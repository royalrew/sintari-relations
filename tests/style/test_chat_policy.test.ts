import fs from "fs";
import path from "path";
import readline from "readline";

import { composeReply } from "@/copy/policy_reply";
import { shouldTriggerHonesty } from "@/lib/policy/honesty_signals";
import { buildGreeting } from "@/lib/copy/warm_sv";
import { resetInterjection } from "@/lib/state/interjection_store";
import { appendWorldclassLive, buildStyleMetrics } from "@/lib/metrics/style_telemetry";

const CASES = path.join(process.cwd(), "tests/golden/style/chat_cases.jsonl");

function countQuestions(s: string) {
  return (s.match(/\?/g) || []).length;
}

function hasEcho(reply: string, user: string) {
  const normalized = user.trim().replace(/^["“”]+|["“”]+$/g, "");
  if (normalized.length <= 12) return false;
  return reply.includes(normalized);
}

function isWarmOpening(s: string) {
  return /välkommen|fint att du är här|kom in i värmen|jag är här med dig/i.test(s);
}

function hasBridge(s: string) {
  return /(litet steg|i din takt|lugnt och tydligt|tryggt|small step|at your pace|calm and clear)/i.test(s);
}

function isHRTone(s: string) {
  return /på jobbet|respektfullt|stöd.*team|arbetsplats/i.test(s);
}

function isRedFarewell(s: string) {
  return /(112|akut fara|stödresurser|hjälp direkt)/i.test(s);
}

function interjectionPresent(s: string) {
  return /(Hmm|Mmm|Okej…|Jag vill bara känna in)/i.test(s);
}

function hasInterjection(s: string) {
  return /(Hmm…|Hmm\.\.\.|Mmm…)/.test(s);
}

function looksEnglish(s: string) {
  return /\b(what|how|why|you|we|i|today|right now|would you|suggest|step)\b/i.test(s);
}

function looksSwedish(s: string) {
  return /[åäöÅÄÖ]|(?:\b(jag|hur|vad|varför|du|vi|idag|vill|föreslår|steg)\b)/i.test(s);
}

describe("chat style policy", () => {
  test("golden cases pass", async () => {
    const rl = readline.createInterface({
      input: fs.createReadStream(CASES, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      const { id, user, signals, seed, expect: expected } = JSON.parse(line);

      resetInterjection(signals.lastInterjectionAt ?? -999);

      // Priority: seed.locale > explicit locale > detectLocale > default "sv"
      const targetLang = seed?.locale ?? signals.locale ?? (user.match(/[åäöÅÄÖ]|\b(jag|hur|vad)\b/i) ? "sv" : user.match(/\b(what|how|why|you|we|i)\b/i) ? "en" : "sv");
      
      // Ensure sessionId for variation rotation
      const signalsWithSession = { ...signals, locale: targetLang, sessionId: signals.sessionId ?? `test_${id}` };

      const output = signals.turn === 1 ? buildGreeting(signalsWithSession) : composeReply(user, signalsWithSession).text;

      const honestySignals = signalsWithSession.honesty;
      const honestyDecision = honestySignals
        ? shouldTriggerHonesty({
            memoryHitAt3: honestySignals.memoryHitAt3,
            confidence: honestySignals.confidence,
            explainHasEvidence: honestySignals.explainHasEvidence,
            expectedLocale: honestySignals.expectedLocale ?? signalsWithSession.locale,
            detectedLocale: honestySignals.detectedLocale ?? targetLang,
            toneDelta: honestySignals.toneDelta,
            toneDriftThreshold: honestySignals.toneDriftThreshold,
            dataGap: honestySignals.dataGap ?? honestySignals.missingFacets,
            risk: signalsWithSession.risk,
            mode: signalsWithSession.mode,
          })
        : { active: false, reasons: [] };

      const honestyTelemetry = honestyDecision.active
        ? {
            active: true,
            reasons: honestyDecision.reasons,
            missing_facets:
              honestySignals?.missingFacets ?? (Array.isArray(honestySignals?.dataGap) ? honestySignals?.dataGap : undefined),
            suggested_probe: honestySignals?.suggestedProbe ?? null,
            rate: honestySignals?.rate ?? 0.12,
            repair_accept_rate: honestySignals?.repairAcceptRate ?? 0.6,
            no_advice: honestySignals?.noAdvice ?? true,
          }
        : { active: false };

      // Log telemetry for style gate
      const detectedLang = looksEnglish(output) ? "en" : "sv";
      const styleMetrics = buildStyleMetrics({
        userText: user,
        replyText: output,
        empathy_score: signals.affect?.empathy ?? 0.7,
        tone_delta: 0.02,
        locale: targetLang,
      });
      appendWorldclassLive({
        ts: new Date().toISOString(),
        session_id: `test_${id}`,
        run_id: "test_chat_policy",
        seed_id: id,
        turn: signals.turn ?? 1,
        mode: signals.mode ?? "personal",
        risk: signals.risk ?? "SAFE",
        locale: targetLang,
        reply_text: output,
        kpi: {
          explain: {
            coverage: 1.0,
            has_evidence: 1.0,
            no_advice: honestyTelemetry.active ? (honestyTelemetry.no_advice ? 1.0 : 0.0) : 1.0,
            level: "standard",
            style: "warm",
          },
          memory: { mrr: 0.92, hit_at_3: 1.0 },
        },
        tone: { vec: [0.62, 0.38, 0.53] },
        style: styleMetrics,
        honesty: honestyTelemetry,
      });

      expect(countQuestions(output)).toBeLessThanOrEqual(expected.max_questions ?? 1);

      if (expected.no_echo) {
        expect(hasEcho(output, user)).toBe(false);
      }

      if (expected.warm_opening) {
        expect(isWarmOpening(output)).toBe(true);
      }

      if (expected.has_bridge) {
        expect(hasBridge(output)).toBe(true);
      }

      if (expected.hr_tone) {
        expect(isHRTone(output)).toBe(true);
      }

      if (expected.red_farewell) {
        expect(isRedFarewell(output)).toBe(true);
      }

      if (expected.allows_interjection === true) {
        expect(interjectionPresent(output)).toBe(true);
      }
      if (expected.allows_interjection === false) {
        expect(interjectionPresent(output)).toBe(false);
      }

      if (expected.no_interjection) {
        expect(hasInterjection(output)).toBe(false);
      }

      if (expected.honesty_no_interjection) {
        expect(hasInterjection(output)).toBe(false);
      }

      if (expected.language === "en") {
        expect(looksEnglish(output)).toBe(true);
        expect(looksSwedish(output)).toBe(false);
      }
      if (expected.language === "sv") {
        expect(looksSwedish(output)).toBe(true);
      }
      
      // Assert reply_lang if specified
      if (expected.reply_lang === "en") {
        expect(looksEnglish(output)).toBe(true);
        expect(looksSwedish(output)).toBe(false);
      }
      if (expected.reply_lang === "sv") {
        expect(looksSwedish(output)).toBe(true);
      }

      if (expected.honesty_active === true) {
        expect(honestyDecision.active).toBe(true);
      }
      if (expected.honesty_no_advice === true) {
        expect(honestyTelemetry.no_advice).not.toBe(false);
      }
    }
  });

  test("honesty hook returns honesty reply", () => {
    const result = composeReply("I feel lost", {
      intent: "share",
      affect: "medium",
      specificity: "low",
      risk: "SAFE",
      mode: "personal",
      turn: 3,
      locale: "en",
      sessionId: "honesty_case",
      honesty: {
        confidence: 0.4,
        explainHasEvidence: 0,
        memoryHitAt3: 0.6,
        expectedLocale: "en",
        detectedLocale: "sv",
        missingFacets: ["who is involved"],
      },
    });

    expect(result.usedInterjection).toBe(false);
    const lowered = result.text.toLowerCase();
    expect(lowered.includes("i see") || lowered.includes("taking in")).toBe(true);
    expect(lowered).toContain("missing");
    expect((result.text.match(/\?/g) || []).length).toBe(1);
  });
});
