import pool from "./policy_pool.json";
import poolEn from "./policy_pool_en.json";
import { SHOW_INTERJECTION } from "@/lib/copy/warm_config";
import { logWarm } from "@/lib/telemetry/warm_log";
import { shouldTriggerHonesty } from "@/lib/policy/honesty_signals";
import { composeHonestReply } from "@/lib/policy/honesty_reply";

// Browser-compatible hash function for variation rotation
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

export type Intent = "ask" | "share" | "goodbye" | "hr";
export type Affect = "low" | "medium" | "high";
export type Specificity = "low" | "high";
export type Risk = "SAFE" | "RED";
export type Mode = "personal" | "hr";
export type Locale = "sv" | "en";

export type HonestySignals = {
  memoryHitAt3?: number | null;
  confidence?: number | null;
  explainHasEvidence?: number | boolean | null;
  expectedLocale?: Locale | null;
  detectedLocale?: Locale | null;
  toneDelta?: number | null;
  toneDriftThreshold?: number | null;
  dataGap?: boolean | string[] | null;
  missingFacets?: string[];
  suggestedProbe?: string;
  rate?: number | null;
  repairAcceptRate?: number | null;
  noAdvice?: boolean | null;
};

export type Signals = {
  intent: Intent;
  affect: Affect;
  specificity: Specificity;
  risk: Risk;
  mode: Mode;
  turn: number;
  lastInterjectionAt?: number;
  locale?: Locale;
  allowInterjection?: boolean;
  interjectionLocked?: boolean; // Runtime override flag (HR/RED)
  sessionId?: string; // For variation rotation
  honesty?: HonestySignals;
};

function detectLocale(t: string): Locale {
  const trimmed = t.trim();
  // Check for English patterns first (more specific)
  const hasEnglish = /\b(what|how|why|thanks|hi|hello|i|we|i'm|should|do|can|will|would)\b/i.test(trimmed);
  // Check for Swedish patterns
  const hasSwedish = /[åäöÅÄÖ]/.test(t) || /(?:\b(jag|hur|vad|varför|du|vi|idag|ska|göra)\b)/i.test(t);
  
  // If both present, prioritize English if it starts with English or has strong English signals
  if (hasEnglish && hasSwedish) {
    return /^(what|how|why|thanks|hi|hello|i|we|i'm|should|do|can|will|would)\b/i.test(trimmed) ? "en" : "sv";
  }
  // If only English → en
  if (hasEnglish) return "en";
  // If only Swedish → sv
  if (hasSwedish) return "sv";
  // Default to sv
  return "sv";
}

export type ComposeOptions = {
  showInterjection?: boolean;
};

export type ComposeResult = {
  text: string;
  usedInterjection: boolean;
};

function antiEcho(userText: string, locale: Locale = "sv"): string {
  const trimmed = userText.trim().replace(/^['"“”]+|['"“”]+$/g, "");
  if (trimmed.length > 120) {
    return locale === "en" ? "I hear that this is important to you. " : "Jag hör att det här är viktigt för dig. ";
  }
  return "";
}

function choose<T>(items: T[] | undefined, sessionId?: string): T | undefined {
  if (!items || items.length === 0) return undefined;
  if (items.length === 1) return items[0];
  // Deterministic rotation based on session_id hash (browser-compatible)
  if (sessionId) {
    const hash = simpleHash(sessionId);
    const idx = hash % items.length;
    return items[idx];
  }
  return items[0];
}

function resolveBridgeKey(sig: Signals): string {
  const locale: Locale = sig.locale ?? "sv";
  const currentPool = locale === "en" ? poolEn : pool;
  const base = `${sig.intent}_${sig.affect}` as keyof typeof currentPool.bridge;
  if (currentPool.bridge[base]) return base;
  const fallback = `${sig.intent}_low` as keyof typeof currentPool.bridge;
  return currentPool.bridge[fallback] ? fallback : "share_low";
}

export function composeReply(userText: string, sig: Signals, opts?: ComposeOptions): ComposeResult {
  const showInterjection = opts?.showInterjection ?? SHOW_INTERJECTION;
  const detectedFromText = detectLocale(userText);
  const dataGapSignal = Array.isArray(sig.honesty?.dataGap)
    ? sig.honesty?.dataGap.length > 0
    : sig.honesty?.dataGap;
  const honestyCheck = shouldTriggerHonesty({
    memoryHitAt3: sig.honesty?.memoryHitAt3,
    confidence: sig.honesty?.confidence,
    explainHasEvidence: sig.honesty?.explainHasEvidence,
    expectedLocale: sig.honesty?.expectedLocale ?? sig.locale ?? undefined,
    detectedLocale: sig.honesty?.detectedLocale ?? detectedFromText,
    toneDelta: sig.honesty?.toneDelta,
    toneDriftThreshold: sig.honesty?.toneDriftThreshold,
    dataGap: Array.isArray(sig.honesty?.dataGap) ? sig.honesty?.dataGap : dataGapSignal,
    risk: sig.risk,
    mode: sig.mode,
  });

  if (sig.intent !== "goodbye" && honestyCheck.active) {
    const forcedLocaleRaw: Locale | string | undefined =
      sig.honesty?.expectedLocale ?? sig.locale ?? detectedFromText;
    const forcedLocale: Locale = forcedLocaleRaw === "en" ? "en" : "sv";
    const facetList = sig.honesty?.missingFacets
      ?? (Array.isArray(sig.honesty?.dataGap) ? sig.honesty?.dataGap : undefined);
    const honestyNoAdvice = sig.honesty?.noAdvice ?? true;
    const honestReply = composeHonestReply(userText, {
      locale: forcedLocale,
      mode: sig.mode,
      risk: sig.risk,
      reasons: honestyCheck.reasons,
      missingFacets: facetList,
      suggestedProbe: sig.honesty?.suggestedProbe,
      sessionId: sig.sessionId,
    });

    logWarm({
      ts: new Date().toISOString(),
      kind: "reply",
      mode: sig.mode,
      risk: sig.risk,
      usedInterjection: false,
      honesty: {
        active: true,
        reasons: honestyCheck.reasons,
        noAdvice: honestyNoAdvice,
      },
    });

    return honestReply;
  }

  // Priority: seed.locale > explicit locale > detectLocale > default "sv"
  const targetLang: Locale = sig.locale ?? detectedFromText ?? "sv";
  const currentPool = targetLang === "en" ? poolEn : pool;

  if (sig.intent === "goodbye") {
    const sessionId = sig.sessionId;
    const farewell = sig.risk === "RED"
      ? choose(currentPool.red.farewell, sessionId)
      : sig.mode === "hr"
      ? choose(currentPool.hr.farewell, sessionId)
      : targetLang === "en"
      ? "Thanks for today. I'm always here for you."
      : "Tack för idag. Jag finns alltid här för dig.";
    return {
      text: farewell ?? (targetLang === "en" ? "Thanks for today. I'm always here for you." : "Tack för idag. Jag finns alltid här för dig."),
      usedInterjection: false,
    };
  }

  // Variation rotation based on session_id
  const sessionId = sig.sessionId;
  const empathyPhrase = choose(currentPool.empathy[sig.affect], sessionId);
  const bridgePhrase = choose(currentPool.bridge[resolveBridgeKey(sig)], sessionId);
  const questionPool = sig.intent === "ask" ? currentPool.questions.ask : currentPool.questions.generic;
  let question = choose(questionPool, sessionId);
  if (questionPool && questionPool.length > 1) {
    const idx = Math.abs(sig.turn ?? 0) % questionPool.length;
    question = questionPool[idx];
  }

  // Interjektion strikt gate - bara när explicit tillåten i signals
  // Runtime override: interjectionLocked=false kan blockera interjektion (HR/RED)
  const allowInterj = sig.allowInterjection === true && sig.interjectionLocked !== false;
  const interjection = allowInterj ? "Hmm… " : "";

  const defaultEmpathy = targetLang === "en" ? "I hear you." : "Jag hör dig.";
  const defaultQuestion = targetLang === "en" 
    ? (sig.intent === "ask" ? "Would you like me to suggest a first small step?" : "How does it feel right now?")
    : "Vill du berätta lite mer?";

  const pieces = [
    empathyPhrase ?? defaultEmpathy,
    antiEcho(userText, targetLang),
    bridgePhrase,
    `${interjection}${question ?? defaultQuestion}`,
  ].filter(Boolean) as string[];

  let text = pieces.join(" ").replace(/\s+/g, " ").trim();

  // Hard guard: enforce target language
  if (targetLang === "en" && looksSwedish(text)) {
    // Fallback: ensure English pool is used
    const fallbackPool = poolEn;
    const fallbackEmpathy = choose(fallbackPool.empathy[sig.affect], sig.sessionId);
    const fallbackBridge = choose(fallbackPool.bridge[resolveBridgeKey({ ...sig, locale: "en" })], sig.sessionId);
    const fallbackQ = choose(sig.intent === "ask" ? fallbackPool.questions.ask : fallbackPool.questions.generic, sig.sessionId);
    text = [fallbackEmpathy ?? "I hear you.", antiEcho(userText, "en"), fallbackBridge, fallbackQ ?? "How does it feel right now?"].filter(Boolean).join(" ");
  }
  if (targetLang === "sv" && looksEnglish(text) && !/[åäöÅÄÖ]/.test(text)) {
    // Fallback: ensure Swedish pool is used
    const fallbackPool = pool;
    const fallbackEmpathy = choose(fallbackPool.empathy[sig.affect], sig.sessionId);
    const fallbackBridge = choose(fallbackPool.bridge[resolveBridgeKey({ ...sig, locale: "sv" })], sig.sessionId);
    const fallbackQ = choose(sig.intent === "ask" ? fallbackPool.questions.ask : fallbackPool.questions.generic, sig.sessionId);
    text = [fallbackEmpathy ?? "Jag hör dig.", antiEcho(userText, "sv"), fallbackBridge, fallbackQ ?? "Vill du berätta lite mer?"].filter(Boolean).join(" ");
  }

  const usedInterjection = sig.allowInterjection === true;
  
  logWarm({
    ts: new Date().toISOString(),
    kind: "reply",
    mode: sig.mode,
    risk: sig.risk,
    usedInterjection,
  });

  return { text, usedInterjection };
}

function looksSwedish(text: string): boolean {
  return /[åäöÅÄÖ]/.test(text) || /\b(jag|hur|vad|varför|du|vi|idag|vill|föreslår|steg|tack|för|att)\b/i.test(text);
}

function looksEnglish(text: string): boolean {
  return /\b(what|how|why|you|we|i|today|right now|would you|suggest|step|thanks|for|that)\b/i.test(text) && !/[åäöÅÄÖ]/.test(text);
}

export function inferIntent(text: string): "ask" | "share" {
  const trimmed = text.trim();
  if (/[?¿]$/.test(trimmed)) return "ask";
  if (/(hur|vad|varför|tips|råd)/i.test(trimmed)) return "ask";
  return "share";
}
