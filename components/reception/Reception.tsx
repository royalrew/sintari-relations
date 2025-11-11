"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { QualityBar } from "@/components/coach/QualityBar";
import Link from "next/link";
import { step, type ReceptionState, type Event, type Ctx } from "@/lib/reception/machine";
import {
  detectEmotionCurve,
  summariseCurve,
  chooseToneBasedOnCurve,
  generateToneReply,
  type EmotionCurve,
  type ToneProfile,
} from "@/lib/reception/emotionCurve";
import { RitualChips, runRitual } from "@/components/reception/RitualChips";
import {
  useTypingDetector,
  useIdleThresholds,
  usePageVisibility,
  useElapsedSince,
} from "@/lib/reception/time_hooks";

/** Gemensam focus-klass för tillgänglighet */
export const focusCls = "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500";

/** Hook för att spåra senast uppdaterad analys */
function useLastUpdated() {
  const [ts, setTs] = useState<number | null>(null);
  function touch() {
    setTs(Date.now());
  }
  const label = ts ? timeAgo(ts) : "aldrig";
  return { ts, label, touch };
}

function timeAgo(t: number): string {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s} s sedan`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min sedan`;
  const h = Math.round(m / 60);
  return `${h} h sedan`;
}

/** Minimal klientloggning för telemetri med graceful degradation */
function logReceptionKPI(evt: "asked_question" | "chip_clicked" | "skip_pressed" | "repeat_rewrite" | "soft_idle_ping" | "med_idle_notice") {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const key = "reception_kpi_v1";
    const raw = localStorage.getItem(key);
    const data = raw ? JSON.parse(raw) : {};
    data[evt] = (data[evt] ?? 0) + 1;
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Graceful degradation: ignore errors if localStorage unavailable
  }
}

/** UI helpers (lätta, med hover) */
function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`group relative rounded-2xl border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-purple-200 ${props.className || ""}`}
    />
  );
}

/** Enkel heuristik: readiness + rutt-förslag */
const RX = {
  pair: /\b(par|partner|vi|min[ ]?(sambo|fru|man))\b/i,
  work: /\b(hr|team|chef|kollega|arbete|jobb(et)?)\b/i,
  mood: /\b(glad|ledsen|stress|oro|ångest|arg|utmatt)\b/i,
  speak: /\b(tala|presentera|kommunik|retorik)\b/i,
};

type Turn = { role: "user" | "assistant"; text: string; ts?: number };

function readinessScore(turns: Turn[]): number {
  const user = turns.filter((t) => t.role === "user");
  const msg = user.length;
  const chars = user.reduce((n, t) => n + t.text.trim().length, 0);
  const blob = user.map((t) => t.text).join(" ");
  const facets = [
    /orol|stress|ångest|ledsen|arg|rädd|trött|uppgiven/i.test(blob),
    /(igår|idag|bråk|konflikt|på jobbet|sa|gjorde)/i.test(blob),
    /(vill|skulle vilja|önskar|behöver|mål)/i.test(blob),
  ].filter(Boolean).length;
  const sMsg = Math.min(msg / 3, 1);
  const sLen = Math.min(chars / 400, 1);
  const sFac = Math.min(facets / 3, 1);
  return Math.max(0, Math.min(1, 0.4 * sMsg + 0.3 * sLen + 0.3 * sFac));
}

function routeGuess(texts: string[]): { to: string; label: string } {
  const t = texts.join(" ").toLowerCase();
  if (RX.pair.test(t)) return { to: "/couples", label: "Par-läge" };
  if (RX.work.test(t)) return { to: "/hr", label: "HR/Team" };
  if (RX.speak.test(t)) return { to: "/coach", label: "Kommunikation/Coach" };
  if (RX.mood.test(t)) return { to: "/coach", label: "Välmående/Coach" };
  return { to: "/coach", label: "Coach" };
}

/** Anti-repeat (enkel) */
function tooSimilar(a: string, b: string, th = 0.6): boolean {
  const tok = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
  const A = tok(a);
  const B = tok(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  const jac = inter / (A.size + B.size - inter || 1);
  return jac >= th;
}

/** Randomiserad välkomstfras pool */
const WELCOME_PHRASES = [
  "Välkommen in i värmen. Skriv fritt – jag lyssnar.",
  "Hej. Kul att du är här. Vad vill du börja med?",
  "Välkommen. Jag finns här för att lyssna – inget måste.",
  "Hej och välkommen. Skriv vad som känns viktigt just nu.",
  "Välkommen. Vi tar det i din takt – inga krav.",
  "Hej. Vad känns viktigt att prata om just nu?",
  "Välkommen. Jag lyssnar när du vill dela något.",
];

function getRandomWelcome(): string {
  return WELCOME_PHRASES[Math.floor(Math.random() * WELCOME_PHRASES.length)];
}

export default function Reception() {
  const [turns, setTurns] = useState<Turn[]>([
    { role: "assistant", text: WELCOME_PHRASES[0] },
  ]);
  const [input, setInput] = useState("");
  const [debouncedInput, setDebouncedInput] = useState("");
  const [mayAsk, setMayAsk] = useState(true); // frågebudget
  const [state, setState] = useState<ReceptionState>("IDLE");
  const [ctx, setCtx] = useState<Ctx>({ userMsgs: 0, readiness: 0 });
  const [curveHistory, setCurveHistory] = useState<EmotionCurve[]>([]);
  const [questionTurnCount, setQuestionTurnCount] = useState(0);
  const prevAssistRef = useRef<string[]>([]);
  const seenKey = "reception_seen_v1";
  const lastAskedAtRef = useRef<number>(0);

  useEffect(() => {
    const welcome = getRandomWelcome();
    setTurns((prev) => {
      if (
        prev.length === 1 &&
        prev[0]?.role === "assistant" &&
        prev[0]?.text === WELCOME_PHRASES[0]
      ) {
        return [{ ...prev[0], text: welcome }];
      }
      return prev;
    });
  }, []);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastPingRef = useRef<number>(0);
  const { ts: analysisTs, label: analysisAgo, touch: markAnalyzed } = useLastUpdated();

  // Tidsuppfattning hooks
  const lastUserTs = useMemo(() => {
    const userTurns = turns.filter((t) => t.role === "user");
    return userTurns.length > 0 ? userTurns[userTurns.length - 1]?.ts ?? null : null;
  }, [turns]);

  const { isTyping, onType } = useTypingDetector({ idleMs: 2000 });
  const idle = useIdleThresholds({ soft: 20_000, med: 45_000, long: 180_000 });
  const pageVisible = usePageVisibility();
  const elapsedSinceUser = useElapsedSince(lastUserTs ?? undefined);

  // Debounce input (300ms)
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      setDebouncedInput(input);
    }, 300);
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [input]);

  // Graceful degradation för sessionStorage
  const softMode = useMemo(() => {
    try {
      return typeof window !== "undefined" && window.sessionStorage && sessionStorage.getItem(seenKey) === "1";
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        sessionStorage.setItem(seenKey, "1");
      }
    } catch {
      // Graceful degradation
    }
  }, []);

  // Session-nivå mildring: om seen=1, lås frågebudget till max 1 fråga på 3 turer
  const sessionMildring = softMode;

  const readiness = useMemo(() => readinessScore(turns), [turns]);
  const route = useMemo(() => {
    const ut = turns.filter((t) => t.role === "user").map((t) => t.text);
    return routeGuess(ut);
  }, [turns]);

  // Update readiness in context (use refs to avoid dependency issues)
  const stateRef = useRef(state);
  const ctxRef = useRef(ctx);
  stateRef.current = state;
  ctxRef.current = ctx;

  useEffect(() => {
    const newCtx = { ...ctxRef.current, readiness };
    const result = step(stateRef.current, newCtx, { type: "READINESS", score01: readiness });
    if (result.state !== stateRef.current || result.ctx.readiness !== newCtx.readiness) {
      setState(result.state);
      setCtx(result.ctx);
    }
  }, [readiness]); // Only depend on readiness

  function addAssistant(text: string, meta?: { asked?: boolean; offer?: "light-analysis" | "route" | "none" }) {
    const prev = prevAssistRef.current.slice(-3);
    if (prev.some((p) => tooSimilar(p, text))) {
      text = text.replace("Jag är med dig", "Jag hör dig").replace("Välkommen", "Kul att du är här");
    }
    prevAssistRef.current.push(text);
    setTurns((t) => [...t, { role: "assistant", text, ts: Date.now() }]);
    
    // Update state based on meta
    if (meta?.asked) {
      lastAskedAtRef.current = Date.now();
    }
  }

  function addUser(text: string) {
    setTurns((t) => [...t, { role: "user", text, ts: Date.now() }]);
    const newCtx = { ...ctxRef.current, userMsgs: ctxRef.current.userMsgs + 1 };
    const result = step(stateRef.current, newCtx, { type: "USER_MESSAGE", text });
    setState(result.state);
    setCtx(result.ctx);
    
    // Reset silence timeout när användaren skriver
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
    }
  }

  function gentleFollowUp(userText: string): string | null {
    if (!mayAsk || softMode) return null;
    
    // MAX 1 fråga var tredje tur (enligt systemprompt)
    const userTurns = turns.filter((t) => t.role === "user").length;
    if (userTurns > 0 && userTurns % 3 !== 0) return null; // Var tredje tur
    
    // Session-nivå mildring: max 1 fråga på 3 turer om seen=1
    if (sessionMildring && userTurns > 0 && userTurns % 3 !== 0) return null;
    
    // Minst 15s mellan frågor
    const timeSinceLastAsk = Date.now() - lastAskedAtRef.current;
    if (timeSinceLastAsk < 15000) return null;
    
    setMayAsk(false);
    setTimeout(() => setMayAsk(true), 15000);
    
    // Enligt systemprompt: bara spegla + valfritt alternativ om inget att fråga
    return null; // Frågan hanteras i generateToneReply
  }

  async function runLightAnalysis(threadId = "reception", retries = 3) {
    // Skicka konversationen om den finns
    const conversation = turns.map((t) => ({
      role: t.role,
      content: t.text,
    }));
    
    const payload = { threadId, mode: "light", conversation };
    
    // Försök med sendBeacon först (non-blocking)
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      const ok = navigator.sendBeacon("/api/coach/analyze", blob);
      if (ok) {
        markAnalyzed();
        addAssistant("Jag kör en lätt föranalys i bakgrunden medan du skriver vidare.");
        return;
      }
    }
    
    // Fallback till fetch med retry-logik
    for (let i = 0; i < retries; i++) {
      try {
        const response = await Promise.race([
          fetch("/api/coach/analyze", {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" },
            keepalive: true,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000)),
        ]);
        
        if (response.ok) {
          markAnalyzed();
          addAssistant("Jag kör en lätt föranalys i bakgrunden medan du skriver vidare.");
          return;
        }
      } catch (error) {
        if (i === retries - 1) {
          // Sista försöket misslyckades, logga tyst
          console.warn("Light analysis failed after retries");
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
      }
    }
  }

  // Tystnads-närvaro: "Jag finns kvar här." efter 20s – men bara om:
  // - sidan är synlig
  // - användaren inte skriver
  // - vi inte nyss skickade en sådan
  useEffect(() => {
    const JUST_SENT_MS = 30_000;
    const shouldPing =
      pageVisible &&
      !isTyping &&
      idle.level === "soft" &&
      elapsedSinceUser >= 20_000 &&
      Date.now() - lastPingRef.current > JUST_SENT_MS &&
      turns.length > 0 && // Måste finnas minst ett meddelande
      turns[turns.length - 1]?.role === "user"; // Senaste måste vara från användaren

    if (shouldPing) {
      const pingMessage = "Ingen stress. Jag finns kvar här.";
      setTurns((prev) => [...prev, { role: "assistant", text: pingMessage, ts: Date.now() }]);
      lastPingRef.current = Date.now();
      // KPI
      try {
        logReceptionKPI("soft_idle_ping");
      } catch {
        // Ignore
      }
    }
  }, [pageVisible, isTyping, idle.level, elapsedSinceUser, turns.length]);

  // Visa stilla rad efter 45s idle (ingen fråga)
  const showGentleNotice = useMemo(() => {
    if (!pageVisible || isTyping || idle.level !== "med") return false;
    // Logga när den visas första gången (endast en gång per session)
    if (idle.level === "med" && elapsedSinceUser >= 45_000) {
      const noticeKey = "med_idle_notice_logged";
      try {
        if (!sessionStorage.getItem(noticeKey)) {
          logReceptionKPI("med_idle_notice");
          sessionStorage.setItem(noticeKey, "1");
        }
      } catch {
        // Ignore
      }
    }
    return true;
  }, [pageVisible, isTyping, idle.level, elapsedSinceUser]);

  function onSend() {
    const v = input.trim();
    if (!v) return;
    setInput("");
    addUser(v);

    // KURVA: Detektera emotionell kurva
    const curve = detectEmotionCurve(v);
    setCurveHistory((prev) => [...prev, curve]);
    
    // Sammanfatta kurva från historik
    const updatedHistory = [...curveHistory, curve];
    const stateCurve = summariseCurve(updatedHistory);
    
    // Detektera om användaren öppnar sig eller har mål
    const isOpeningUp = v.length > 50 && !/(vet inte|ingen aning|kanske)/i.test(v);
    const hasGoal = /(vill|skulle vilja|önskar|behöver|mål|hoppar|bli bättre|förbättra|utveckla|träna på)/i.test(v);
    
    // TON: Välj profil baserat på kurva
    const toneProfile = chooseToneBasedOnCurve(stateCurve, isOpeningUp, hasGoal);
    
    // Frågebudget: MAX 1 fråga var tredje tur
    const userTurns = turns.filter((t) => t.role === "user").length;
    const canAskQuestion = mayAsk && userTurns > 0 && userTurns % 3 === 0 && 
                          (Date.now() - lastAskedAtRef.current) >= 15000;
    
    // Generera svar med TON-profil
    let reply = generateToneReply(toneProfile, v, canAskQuestion);
    
    if (canAskQuestion) {
      logReceptionKPI("asked_question");
      lastAskedAtRef.current = Date.now();
      setMayAsk(false);
      setTimeout(() => setMayAsk(true), 15000);
    }
    
    // Anti-repeat: om för likt, ändra vinkeln
    const lastAssistant = turns.filter((t) => t.role === "assistant").slice(-1)[0];
    if (lastAssistant && tooSimilar(lastAssistant.text, reply)) {
      reply = reply.replace("Jag hör dig", "Jag är med dig").replace("Jag är med dig", "Jag lyssnar");
      logReceptionKPI("repeat_rewrite");
    }
    
    addAssistant(reply, { 
      asked: canAskQuestion, 
      offer: stateRef.current === "LIGHT_ANALYSIS_OK" ? "light-analysis" : stateRef.current === "OFFER_PATH" ? "route" : "none" 
    });
  }

  function handleRitual(type: "breathe" | "pause" | "ground") {
    const ritualReply = runRitual(type);
    addAssistant(ritualReply, { asked: false, offer: "none" });
  }

  function handleChip(id: "free" | "suggest" | "skip" | "light" | "full") {
    logReceptionKPI("chip_clicked");
    const result = step(stateRef.current, ctxRef.current, { type: "CLICK_CHIP", id });
    setState(result.state);
    setCtx(result.ctx);
    
    if (id === "free") {
      addAssistant("Vi fortsätter här. Skriv fritt.", { asked: false, offer: "none" });
    } else if (id === "suggest") {
      addAssistant(`Vill du att jag öppnar ${route.label}? (du kan alltid ångra dig)`, { asked: true, offer: "route" });
    } else if (id === "skip") {
      logReceptionKPI("skip_pressed");
      addAssistant("Vi hoppar över frågor. Jag finns här om du vill fortsätta sen.", { asked: false, offer: "none" });
    } else if (id === "light") {
      runLightAnalysis();
    } else if (id === "full") {
      // Route to /analyze
      if (typeof window !== "undefined") {
        window.location.href = "/analyze";
      }
    }
  }

  const userTexts = turns.filter((t) => t.role === "user").map((t) => t.text);
  const showReadiness = readiness < 0.8; // dölj bar när grönt

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-extrabold tracking-tight text-gray-900">Reception</h3>
          <p className="text-sm text-gray-600">Skriv fritt. Jag lotsar när du vill – inte innan.</p>
        </div>
        <span className="rounded-full border border-purple-200 bg-white/70 px-3 py-1 text-xs font-semibold text-purple-700">
          Beta
        </span>
      </div>

      <div
        className="mt-4 space-y-3"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Samtal"
      >
        {turns.map((m, i) => (
          <div
            key={i}
            className={`max-w-[90%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
              m.role === "assistant"
                ? "ml-auto bg-gradient-to-r from-purple-100 to-blue-100"
                : "bg-white shadow"
            }`}
          >
            {m.text}
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              onType();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Skriv några ord… (du kan också bara sitta en stund)"
            className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
          />
          <Button onClick={onSend}>Skicka</Button>
        </div>

        {showGentleNotice && (
          <p className="mt-2 text-[11px] text-gray-500">
            Vi kan bara vara tysta en stund också – jag är kvar här.
          </p>
        )}

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => handleChip("free")}
            className={`rounded-xl border border-gray-200 bg-white/80 px-3 py-1.5 text-sm text-gray-700 hover:border-purple-300 hover:bg-white transition ${focusCls}`}
          >
            Skriv fritt
          </button>
          <button
            onClick={() => handleChip("suggest")}
            className={`rounded-xl border border-purple-200 bg-white/80 px-3 py-1.5 text-sm text-purple-700 hover:bg-white transition ${focusCls}`}
          >
            Föreslå väg
          </button>
          <button
            onClick={() => handleChip("skip")}
            className={`rounded-xl border border-gray-200 bg-white/80 px-3 py-1.5 text-sm text-gray-700 hover:border-purple-300 hover:bg-white transition ${focusCls}`}
          >
            Hoppa över
          </button>
        </div>
        
        {/* RITUAL: Mikroverktyg */}
        <RitualChips onSelect={handleRitual} />
      </div>

      {/* Readiness + handlingsval – aldrig krav */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <div className="text-sm font-semibold text-gray-900">Vart lutar det?</div>
          <p className="text-sm text-gray-600 mt-1">Jag gissar – du bestämmer.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              { to: "/coach", label: "Coach" },
              { to: "/couples", label: "Par-läge" },
              { to: "/hr", label: "HR/Team" },
              { to: "/analyze", label: "Full analys" },
            ].map((p) => (
              <Link
                key={p.to}
                href={p.to}
                className="rounded-xl border border-gray-200 bg-white/80 px-3 py-2 text-sm text-gray-700 transition hover:border-purple-300 hover:bg-white hover:shadow text-center"
              >
                {p.label}
              </Link>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Mitt förslag just nu: <span className="font-medium">{route.label}</span>
          </p>
        </Card>

        <Card>
          {showReadiness ? (
            <>
              <QualityBar score01={readiness} />
              <p className="mt-1 text-[11px] text-gray-500">
                Analysstatus: uppdaterad {analysisAgo}.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => runLightAnalysis()}>
                  Kör lätt föranalys
                </Button>
                <Button variant="ghost" onClick={() => addAssistant("Okej. Vi väntar tills det känns rätt.", { asked: false, offer: "none" })}>
                  Vänta
                </Button>
              </div>
              <p className="mt-2 text-xs text-gray-500">Tips: känsla + vad som hände + vad du önskar → 9–10/10.</p>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold text-gray-900">Redo för full analys</div>
              <p className="text-sm text-gray-600 mt-1">Vill du öppna den nu?</p>
              <p className="mt-1 text-[11px] text-gray-500">
                Analysstatus: uppdaterad {analysisAgo}.
              </p>
              <div className="mt-3 flex gap-2">
                <Link href="/analyze">
                  <Button onClick={() => handleChip("full")}>Öppna /analyze</Button>
                </Link>
                <Button variant="secondary" onClick={() => addAssistant("Vi kan lika gärna fortsätta här en stund till.", { asked: false, offer: "none" })}>
                  Stanna här
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="mt-6 space-y-2">
        <p className="text-[11px] text-gray-500">
          Etik: AI-genererad vägledning, inte terapi. Vid akuta lägen – 112.
        </p>
        <p className="text-[11px] text-gray-500">
          <Link href="/legal/privacy" className="underline hover:text-purple-700">
            Hur vi använder din text
          </Link>
          {" • "}
          <Link href="/legal/ethics" className="underline hover:text-purple-700">
            Etik & säkerhet
          </Link>
        </p>
      </div>
    </Card>
  );
}

