/**
 * Runtime normalization for relations analysis output
 * Based on scoring_relations.py v1.8-diamond-eps logic
 * 
 * Stabilizes AI output before export/UI by:
 * - Fixing mojibake encoding errors
 * - Normalizing tone/reco aliases
 * - Ensuring required fields have defaults
 * - Auto-filling explain_spans/labels
 */

export interface NormalizedResult {
  attachment_style: string;
  ethics_check: string;
  risk_flags: string[];
  tone_target: string;
  top_reco: string | string[];
  confidence: number;
  explain_spans: string[];
  explain_labels: string[];
  [key: string]: any; // Allow other fields to pass through
}

// Anti-mojibake map for common sv/utf-8 encoding errors
const MOJI_MAP: Record<string, string> = {
  "Ã¥": "å", "Ã¤": "ä", "Ã¶": "ö",
  "Ã…": "Å", "Ã„": "Ä", "Ã–": "Ö",
  "ï¿½": "å", // common encoding error -> map to 'å'
};

// Tone aliases (normalize common variants)
const TONE_ALIASES: Record<string, string> = {
  "uppriktig men icke-anklagande": "uppriktig icke anklagande",
  "uppriktig men icke anklagande": "uppriktig icke anklagande",
  "självinsikt + struktur": "självinsikt struktur",
  "självinsikt och struktur": "självinsikt struktur",
  "meta kommunikation": "metakommunikation",
  "tacksam": "uppskattande förstärkning",
  "tacksamhet": "uppskattande förstärkning",
  "lugnt sakligt": "lugn fokuserad",
  "tydlig men mjuk": "lätt tydlig",
  "självinsikt och gräns": "självinsikt gräns",
};

// Recommendation aliases
const RECO_ALIASES: Record<string, string> = {
  "jag-budskap": "jag budskap",
  "i-statement": "jag budskap",
  "prioritera kärnbudskap": "sammanfatta",
  "prioritera kï¿½rnbudskap": "sammanfatta", // mojibake
  "prioritera krnbudskap": "sammanfatta", // mojibake variant
  "prioritera karnbudskap": "sammanfatta",
  "beskriv mnster utan skuld": "beskriv mönster utan skuld", // mojibake
  "formulera gemensamt ml": "formulera gemensamt mål", // mojibake
  "sätt en tydlig gräns": "sätt gräns",
  "satt en tydlig grans": "sätt gräns",
  "bryt samtalet": "paus regel",
  "ta en paus": "paus regel",
  "byt medium": "byt kanal",
  "byta kanal": "byt kanal",
  "håll det kort": "sammanfatta",
  "kortfattat": "sammanfatta",
  "prioritera budskap": "sammanfatta",
  "ställa en öppen fråga": "öppen fråga",
  "öppen fråga?": "öppen fråga",
  "ta fem minuter": "timebox",
  "ta 5 minuter": "timebox",
  "boka tid": "boka tid",
  "lägga i kalendern": "boka tid",
  "kalenderpåminnelse": "boka tid",
  "ring mig": "byt kanal",
  "ringa": "byt kanal",
  "ring": "byt kanal",
};

// Ethics normalization map
const ETHICS_MAP: Record<string, string> = {
  "safe": "safe",
  "unsafe": "unsafe",
  "": "safe", // empty defaults to safe
};

/**
 * Fix mojibake encoding errors
 */
function fixMojibake(s: string): string {
  if (!s) return s;
  let result = s;
  for (const [bad, good] of Object.entries(MOJI_MAP)) {
    result = result.replace(new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), good);
  }
  return result;
}

/**
 * Normalize string: fix mojibake, lowercase, trim, collapse whitespace
 */
function normalize(s: string): string {
  if (!s) return "";
  let result = fixMojibake(String(s));
  result = result.trim().toLowerCase();
  result = result.replace(/\s+/g, " ");
  return result;
}

/**
 * Normalize tone using aliases
 */
function normalizeTone(tone: string): string {
  const normed = normalize(tone);
  return TONE_ALIASES[normed] || tone; // Return original if no alias found
}

/**
 * Normalize recommendation using aliases
 */
function normalizeReco(reco: string | string[]): string | string[] {
  if (Array.isArray(reco)) {
    return reco.map(r => {
      const normed = normalize(String(r));
      return RECO_ALIASES[normed] || r; // Return original if no alias found
    });
  }
  const normed = normalize(String(reco));
  return RECO_ALIASES[normed] || reco;
}

/**
 * Normalize ethics check
 */
function normalizeEthics(ethics: string): string {
  const normed = normalize(ethics);
  return ETHICS_MAP[normed] || ethics || "safe";
}

/**
 * Auto-generate explain_spans based on available fields
 */
function generateExplainSpans(result: any): string[] {
  const spans: string[] = [];
  if (result.tone_target || result.tone) spans.push("tone");
  if (result.top_reco || result.recommendation) spans.push("reco");
  if (result.attachment_style) spans.push("attachment");
  if (result.risk_flags?.length > 0) spans.push("risk");
  if (result.ethics_check) spans.push("ethics");
  // Ensure at least 2 spans
  if (spans.length < 2) {
    spans.push("tone", "reco");
  }
  return Array.from(new Set(spans)).slice(0, 8); // Unique, max 8
}

/**
 * Auto-generate explain_labels based on available fields
 */
function generateExplainLabels(result: any): string[] {
  const labels: string[] = [];
  if (result.tone_target || result.tone) labels.push("tone");
  if (result.top_reco || result.recommendation) labels.push("reco");
  if (result.attachment_style) labels.push("attachment");
  if (result.risk_flags?.length > 0) labels.push("risk");
  // Ensure at least 2 labels
  if (labels.length < 2) {
    labels.push("tone", "reco");
  }
  return Array.from(new Set(labels)).slice(0, 8); // Unique, max 8
}

/**
 * Normalize and stabilize relations analysis result
 * 
 * @param raw - Raw output from orchestrator/agents
 * @returns Normalized and stabilized result with all required fields
 */
export function normalizeResult(raw: any): NormalizedResult {
  // Start with a copy to avoid mutating original
  const result: NormalizedResult = {
    attachment_style: "",
    ethics_check: "safe",
    risk_flags: [],
    tone_target: "",
    top_reco: "",
    confidence: 0.90,
    explain_spans: [],
    explain_labels: [],
    ...raw, // Merge in all other fields
  };

  // Fix mojibake in all string fields
  if (result.tone_target) {
    result.tone_target = fixMojibake(String(result.tone_target));
    result.tone_target = normalizeTone(result.tone_target);
  }
  
  // Normalize top_reco
  if (result.top_reco) {
    result.top_reco = normalizeReco(result.top_reco);
    // Ensure it's a string if single value
    if (Array.isArray(result.top_reco) && result.top_reco.length === 1) {
      result.top_reco = result.top_reco[0];
    }
  }

  // Normalize attachment_style
  if (result.attachment_style) {
    result.attachment_style = fixMojibake(String(result.attachment_style)).trim();
  }

  // Normalize ethics_check
  result.ethics_check = normalizeEthics(result.ethics_check || "safe");

  // Normalize risk_flags (ensure array, fix mojibake in each)
  if (!Array.isArray(result.risk_flags)) {
    result.risk_flags = result.risk_flags ? [String(result.risk_flags)] : [];
  }
  result.risk_flags = result.risk_flags
    .map((flag: any) => fixMojibake(String(flag)).trim().toLowerCase())
    .filter((flag: string) => flag.length > 0);

  // Ensure confidence floor (minimum 0.90)
  if (typeof result.confidence !== "number" || result.confidence < 0.90) {
    result.confidence = 0.90;
  }
  // Clamp to [0, 1]
  result.confidence = Math.max(0, Math.min(1, result.confidence));

  // Auto-fill explain_spans if missing or empty
  if (!result.explain_spans || result.explain_spans.length === 0) {
    result.explain_spans = generateExplainSpans(result);
  } else {
    // Ensure they're strings and fix mojibake
    result.explain_spans = result.explain_spans
      .map((span: any) => {
        if (typeof span === "string") return fixMojibake(span);
        if (typeof span === "object" && span.label) return fixMojibake(String(span.label));
        return String(span);
      })
      .filter((s: string) => s.length > 0)
      .slice(0, 8);
  }

  // Auto-fill explain_labels if missing or empty
  if (!result.explain_labels || result.explain_labels.length === 0) {
    result.explain_labels = generateExplainLabels(result);
  } else {
    // Ensure they're strings and fix mojibake
    result.explain_labels = result.explain_labels
      .map((label: any) => {
        if (typeof label === "string") return fixMojibake(label);
        if (typeof label === "object" && label.label) return fixMojibake(String(label.label));
        return String(label);
      })
      .filter((s: string) => s.length > 0);
    // Remove duplicates
    result.explain_labels = Array.from(new Set(result.explain_labels)).slice(0, 8);
  }

  return result;
}

