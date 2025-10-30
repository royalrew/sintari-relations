// Central text utilities för UTF-8 och textflöde
export const toUtf8 = (s: string): string => {
  if (!s) return "";
  return Buffer.from(Buffer.from(s, "utf8").toString("utf8"), "utf8").toString("utf8");
};

export const normalizeText = (text: string): string => {
  if (!text) return "";
  return toUtf8(text).normalize("NFC");
};

export const getWorkText = (
  rawText: string,
  normalizedText?: string,
  maskedText?: string
): string => {
  const raw = normalizeText(rawText || "");
  const norm = normalizeText(normalizedText || "");
  const masked = normalizeText(maskedText || "");
  
  const workText = (masked || norm || raw).trim();
  
  if (!workText) {
    console.warn("[WARN] Empty workText; falling back to rawText");
    return raw;
  }
  
  return workText;
};

// Canonical label mapping - utökad för mojibake-fix
const LABEL_MAP = new Map([
  // Mojibake fixes
  ["grnser", "gränser"],
  ["gransers", "gränser"], 
  ["Gränser", "gränser"],
  ["gränser", "gränser"],
  ["Respekt", "respekt"],
  ["Kommunikation", "kommunikation"],
  ["Vardag", "vardag"],
  ["Ansvar", "ansvar"],
  ["Gränssättning", "gränssättning"],
  ["Assertivitet", "assertivitet"],
  // Standard labels
  ["kommunikation", "kommunikation"],
  ["respekt", "respekt"],
  ["vardag", "vardag"],
  ["ansvar", "ansvar"],
  ["gränssättning", "gränssättning"],
  ["assertivitet", "assertivitet"],
  ["kritik", "kritik"],
  ["försvar", "försvar"],
  ["stonewalling", "stonewalling"],
  ["gaslighting", "gaslighting"]
]);

export const canonLabel = (label: string): string => {
  if (!label) return "";
  const normalized = label.toLowerCase().trim().normalize("NFC");
  return LABEL_MAP.get(normalized) || normalized;
};

// PII in-place masking (preserve indices)
export const maskInPlace = (text: string, hits: Array<{start: number, end: number}>): string => {
  if (!text || !hits.length) return text;
  
  const arr = Array.from(text);
  for (const hit of hits) {
    for (let i = hit.start; i < hit.end && i < arr.length; i++) {
      arr[i] = "•";
    }
  }
  return arr.join("");
};

// Fallback spans generation - förbättrad logik
export const generateFallbackSpans = (text: string, top3: string[] = []): Array<{start: number, end: number, label: string}> => {
  if (!text.trim()) return [];
  
  const spans: Array<{start: number, end: number, label: string}> = [];
  
  // Always add first sentence as fallback
  const firstSentenceEnd = Math.min(text.length, Math.floor(text.length * 0.35));
  spans.push({ start: 0, end: firstSentenceEnd, label: "auto" });
  
  // Try to find spans for top3 terms
  for (const term of top3) {
    const canonTerm = canonLabel(term);
    const index = text.toLowerCase().indexOf(canonTerm.toLowerCase());
    if (index !== -1) {
      const start = Math.max(0, index - 10);
      const end = Math.min(text.length, index + canonTerm.length + 10);
      spans.push({ start, end, label: canonTerm });
    }
  }
  
  // Add spans for common relationship terms
  const commonTerms = ["kärlek", "älskar", "relation", "kommunikation", "respekt", "tillit"];
  for (const term of commonTerms) {
    const index = text.toLowerCase().indexOf(term);
    if (index !== -1) {
      const start = Math.max(0, index - 5);
      const end = Math.min(text.length, index + term.length + 5);
      spans.push({ start, end, label: term });
    }
  }
  
  return spans;
};
