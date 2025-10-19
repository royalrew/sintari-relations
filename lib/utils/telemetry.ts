import crypto from "crypto";

export type SafetyFlag = "NORMAL" | "CAUTION" | "RISK" | "DANGER";
export type OverallStatus = "OK" | "WARNING" | "CRITICAL";
export type YesNo = "YES" | "NO";
export type RepairSignals = "YES" | "NO" | "MAYBE";

export function newRunId(): string {
  return crypto.randomUUID();
}

export function hashInput(s: string): string {
  return "sha256:" + crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

export function descLength(s: string): number {
  return (s ?? "").length;
}

export function secondsInDayFromIso(tsIso: string): number {
  const d = new Date(tsIso);
  const ms = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds() + d.getUTCMilliseconds() / 1000;
  return ms;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Mät tid för ett steg */
export async function timeStage<T>(name: string, fn: () => Promise<T>, bucket: Record<string, number>): Promise<T> {
  const t0 = performance.now();
  try {
    const out = await fn();
    bucket[name] = Math.round(performance.now() - t0);
    return out;
  } catch (e) {
    bucket[name] = Math.round(performance.now() - t0);
    throw e;
  }
}

export function totalLatency(bucket: Record<string, number>): number {
  return Object.values(bucket).reduce((a, b) => a + b, 0);
}

export function generateSessionId(): string {
  return "sess_" + crypto.randomBytes(8).toString("hex");
}

export function generateUserId(): string {
  return "user_anon_" + crypto.randomBytes(4).toString("hex");
}

// Simple toxicity detection (MVP - replace with proper moderation later)
export function detectToxicity(text: string): {
  toxicity_score: number;
  self_harm_mention: boolean;
  abuse_mention: boolean;
} {
  const t = (text || "").toLowerCase();
  
  // Simple heuristics - replace with proper moderation API later
  const selfHarmWords = ["självmord", "döda mig", "sluta leva", "ta livet"];
  const abuseWords = ["skit", "jävla", "helvete", "fan", "idiot"];
  
  const selfHarmCount = selfHarmWords.reduce((count, word) => 
    count + (t.includes(word) ? 1 : 0), 0);
  const abuseCount = abuseWords.reduce((count, word) => 
    count + (t.includes(word) ? 1 : 0), 0);
  
  // Simple scoring (0-1 range)
  const toxicity_score = Math.min(0.1 + (abuseCount * 0.1) + (selfHarmCount * 0.3), 1.0);
  
  return {
    toxicity_score: Math.round(toxicity_score * 100) / 100,
    self_harm_mention: selfHarmCount > 0,
    abuse_mention: abuseCount > 0
  };
}

export function detectLanguage(text: string): string {
  // Simple detection - in production, use a proper language detection library
  if (/[åäöÅÄÖ]/.test(text)) return "sv";
  if (/[üÜ]/.test(text)) return "de";
  return "en"; // default fallback
}

export function calculateOverallStatus(safetyFlag: SafetyFlag): OverallStatus {
  switch (safetyFlag) {
    case "NORMAL":
      return "OK";
    case "CAUTION":
      return "WARNING";
    case "RISK":
      return "WARNING";
    case "DANGER":
      return "CRITICAL";
    default:
      return "OK";
  }
}

export function estimateTokensAndCost(inputText: string, outputText: string, model: string = "gpt-3.5-turbo"): {
  tokens_in: number;
  tokens_out: number;
  cost_estimate: number;
} {
  // Simple estimation - in production, use actual tokenizer
  const tokens_in = Math.ceil(inputText.length / 4); // Rough estimate: 4 chars per token
  const tokens_out = Math.ceil(outputText.length / 4);
  
  // GPT-3.5-turbo pricing (as of 2024)
  const input_cost_per_1k = 0.0015;
  const output_cost_per_1k = 0.002;
  
  const cost_estimate = (tokens_in / 1000) * input_cost_per_1k + (tokens_out / 1000) * output_cost_per_1k;
  
  return {
    tokens_in,
    tokens_out,
    cost_estimate: Math.round(cost_estimate * 10000) / 10000 // Round to 4 decimals
  };
}
