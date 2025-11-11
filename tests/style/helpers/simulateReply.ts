import { composeReply, Signals, Locale } from "@/copy/policy_reply";
import { shouldTriggerHonesty } from "@/lib/policy/honesty_signals";

function looksEnglish(text: string) {
  return /\b(what|how|why|you|we|i|today|right now|would you|suggest|step)\b/i.test(text) && !/[åäöÅÄÖ]/.test(text);
}

function looksSwedish(text: string) {
  return /[åäöÅÄÖ]|(?:\b(jag|hur|vad|varför|du|vi|idag|vill|föreslår|steg)\b)/i.test(text);
}

function countQuestions(text: string) {
  return (text.match(/\?/g) || []).length;
}

function normalizeText(text: string) {
  return text.trim().replace(/^['"“”]+|['"“”]+$/g, "").toLowerCase();
}

function echoRatio(user: string, reply: string) {
  const a = normalizeText(user);
  const b = normalizeText(reply);
  if (!a || a.length < 8) return 0;
  const idx = b.indexOf(a);
  if (idx === -1) return 0;
  return a.length / Math.max(1, b.length);
}

export type SimulateInput = {
  seed_id: string;
  locale?: "sv" | "en";
  mode?: "personal" | "hr";
  risk?: "SAFE" | "RED";
  user_text: string;
  signals?: Record<string, unknown>;
};

export async function simulateReply(tc: SimulateInput) {
  const locale = (tc.locale ?? "sv") as Locale;
  const mode = tc.mode ?? "personal";
  const risk = tc.risk ?? "SAFE";

  const honestySignals: Signals["honesty"] = {
    expectedLocale: locale,
    missingFacets: undefined,
    detectedLocale: looksEnglish(tc.user_text) ? "en" : "sv",
  };

  const signals: Signals = {
    intent: "share",
    affect: "medium",
    specificity: "low",
    risk,
    mode,
    turn: 3,
    allowInterjection: false,
    locale,
    sessionId: tc.seed_id,
    honesty: honestySignals,
  };

  if (tc.signals) {
    const map = tc.signals;
    if ("confidence" in map && typeof map.confidence === "number") {
      honestySignals.confidence = map.confidence;
    }
    if ("memoryHitAt3" in map && typeof map.memoryHitAt3 === "number") {
      honestySignals.memoryHitAt3 = map.memoryHitAt3;
    }
    if ("missingFacets" in map && Array.isArray(map.missingFacets)) {
      honestySignals.missingFacets = map.missingFacets.map(String);
    }
    if ("explainHasEvidence" in map && (typeof map.explainHasEvidence === "number" || typeof map.explainHasEvidence === "boolean")) {
      honestySignals.explainHasEvidence = map.explainHasEvidence as number | boolean;
    }
    if ("toneDelta" in map && typeof map.toneDelta === "number") {
      honestySignals.toneDelta = map.toneDelta;
    }
    if ("toneDriftThreshold" in map && typeof map.toneDriftThreshold === "number") {
      honestySignals.toneDriftThreshold = map.toneDriftThreshold;
    }
  }

  if (honestySignals.missingFacets?.length) {
    honestySignals.dataGap = honestySignals.missingFacets;
  }

  const decision = shouldTriggerHonesty({
    memoryHitAt3: honestySignals.memoryHitAt3,
    confidence: honestySignals.confidence,
    explainHasEvidence: honestySignals.explainHasEvidence,
    expectedLocale: honestySignals.expectedLocale ?? signals.locale,
    detectedLocale: honestySignals.detectedLocale,
    toneDelta: honestySignals.toneDelta,
    toneDriftThreshold: honestySignals.toneDriftThreshold,
    dataGap: honestySignals.missingFacets?.length ? honestySignals.missingFacets : undefined,
    risk: signals.risk,
    mode: signals.mode,
  });

  const result = composeReply(tc.user_text, signals);
  const replyText = result.text;

  const replyLang = looksEnglish(replyText)
    ? "en"
    : looksSwedish(replyText)
    ? "sv"
    : locale;

  const noAdvice = !/(råd|tips|advice|suggest)/i.test(replyText);

  return {
    reply_text: replyText,
    reply_lang: replyLang,
    mode,
    style: {
      question_count: countQuestions(replyText),
      echo_ratio: echoRatio(tc.user_text, replyText),
    },
    kpi: {
      explain: {
        no_advice: noAdvice,
        style: mode === "hr" ? "warm" : "warm",
      },
    },
    honesty: {
      active: decision.active,
      reasons: decision.reasons,
      no_advice: noAdvice,
    },
  };
}
