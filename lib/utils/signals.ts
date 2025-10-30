import type { RepairSignals, YesNo, SafetyFlag } from "./telemetry";
import indicatorsData from "../../data/indicators.json";

export interface ExtractedSignals {
  pos_count: number;
  neg_count: number;
  risk_count: number;
  risk_areas: string[];
  repair_signals: RepairSignals;
  warmth: YesNo;
  has_apology: YesNo;
  has_plan: YesNo;
  safety_flag: SafetyFlag;
  net_score: number;
  toxicity_score: number;
  self_harm_mention: boolean;
  abuse_mention: boolean;
}

// Use the same word lists as our existing agent for consistency
const POS = indicatorsData.POS;
const NEG = indicatorsData.NEG;
const RISK = indicatorsData.RISK;

const REPAIR_HINTS = [
  "förlåt", "ursäkt", "ursäkta",
  "plan", "schema", "överens", "kompromiss",
  "vi pratade", "vi talade", "vi snackade",
  "vi testade", "vi provade",
  "jobbar på", "vi försöker", "vi försökt", "vi ska försöka",
  "tog ansvar", "ansvar", "beklagar"
];

const WARM_TONE = [
  "kärlek", "älskar", "värme", "omtanke", "respekt", "tillit", "förståelse", "stöd",
  "kommunicerar bra", "bra kommunikation", "pratar bra", "lyssnar", "snäll", "ärlig",
  "tacksam", "glad", "lycka", "harmoni", "samarbete", "tillsammans", "planerar"
];

const SAFETY_WORDS = [
  "elak", "elaka", "kränkande", "kränker", "respektlös", "hot", "hotar",
  "rädd", "rädda", "våld", "aggressiv", "aggressivitet", "trakasserier",
  "kontrollerande", "psykiskt våld", "fysiskt våld", "övergrepp",
  "slår", "knuffar", "fysisk", "skrämmande", "skrämmer", "skriker", "skriker",
  "tvingar", "tvång", "dominans", "dominerar", "isolering", "isolerar",
  "nedvärderande", "förminskar", "förödmjukar", "kontrollerar allt",
  "tillåter inte", "förbjuder", "obehaglig", "hotfull", "farlig",
  "kastar saker", "kastar", "kasta", "verbalt våld", "emotionellt våld"
];

export function countMatches(text: string, words: string[]): number {
  const t = (text || "").toLowerCase();
  return words.reduce((count, word) => 
    count + (t.includes(word.toLowerCase()) ? 1 : 0), 0
  );
}

function hasAny(text: string, list: string[]): boolean {
  const t = (text || "").toLowerCase();
  return list.some(word => t.includes(word.toLowerCase()));
}

export function extractRiskAreas(description: string): string[] {
  const riskAreas: string[] = [];
  const text = description.toLowerCase();
  
  // Map common phrases to risk areas - enhanced to match actual risk_count
  const riskAreaMap: Record<string, string> = {
    "bråk": "bråk",
    "bråkar": "bråk", 
    "konflikt": "konflikt",
    "konflikter": "konflikt",
    "rädd": "trygghet",
    "skriker": "våld",
    "kastar": "våld",
    "elaka": "våld",
    "våld": "våld",
    "hushåll": "ansvar",
    "hushållsarbete": "ansvar", 
    "arbete": "ansvar",
    "ansvar": "ansvar",
    "vecko": "planering",
    "schema": "planering",
    "plan": "planering",
    "kommunikation": "kommunikation",
    "prata": "kommunikation",
    // Otrohet patterns
    "otrogen": "otrohet",
    "otrohet": "otrohet", 
    "var otrogen": "otrohet",
    "cheat": "otrohet",
    "infidelity": "otrohet",
    // Verbal kränkning patterns
    "hemska saker": "verbal kränkning",
    "förolämp": "verbal kränkning",
    "kränk": "verbal kränkning",
    "nedvärder": "verbal kränkning",
    "horrible things": "verbal kränkning",
    "insult": "verbal kränkning",
    "elak": "verbal kränkning",
    "elaka": "verbal kränkning",
    // Psykologiskt våld
    "hemska saker": "psykologiskt våld",
    "kränk": "psykologiskt våld",
    "nedvärder": "psykologiskt våld",
    "förolämp": "psykologiskt våld",
    "elak": "psykologiskt våld",
    "elaka": "psykologiskt våld",
    // Förlåtelsecykel patterns
    "säger förlåt": "förlåtelsecykel",
    "bad om ursäkt": "förlåtelsecykel",
    "lovar": "förlåtelsecykel",
    "inte göra det igen": "förlåtelsecykel",
    "promise": "förlåtelsecykel",
    "not to do it again": "förlåtelsecykel"
  };
  
  Object.entries(riskAreaMap).forEach(([phrase, area]) => {
    if (text.includes(phrase)) {
      riskAreas.push(area);
    }
  });
  
  // Also include direct RISK word matches for better coverage
  RISK.forEach(riskWord => {
    if (text.includes(riskWord.toLowerCase()) && !riskAreas.includes(riskWord)) {
      riskAreas.push(riskWord);
    }
  });
  
  return Array.from(new Set(riskAreas)); // Remove duplicates
}

export function extractSignals(description: string): ExtractedSignals {
  const pos_count = countMatches(description, POS);
  const neg_count = countMatches(description, NEG);
  const risk_areas = extractRiskAreas(description);
  const risk_count = risk_areas.length; // Rule A: risk_count = risk_areas.length
  
  // Use consistent logic with our existing agent
  const hasRepairSignals = hasAny(description, REPAIR_HINTS);
  const hasWarmth = hasAny(description, WARM_TONE);
  const hasSafetyWords = hasAny(description, SAFETY_WORDS);
  const hasApology = /förlåt|ursäkt|ursäkta/i.test(description);
  const hasPlan = /plan|schema|överens|kompromiss/i.test(description);
  
  // Enhanced logic for otrohet/förlåtelsecykel patterns
  const hasOtrohet = risk_areas.includes("otrohet");
  const hasVerbalKränkning = risk_areas.includes("verbal kränkning");
  const hasFörlåtelsecykel = risk_areas.includes("förlåtelsecykel");
  const hasUpprepning = /igen|upprepa|flera gånger|händer igen/i.test(description);

  const warmth: YesNo = hasWarmth ? "YES" : "NO";
  // Sänk repair_signals för otrohet/förlåtelsecykel - ursäkter utan förändring är inte reparativa
  const repair_signals: RepairSignals = (hasOtrohet && hasFörlåtelsecykel) ? "NO" 
    : (hasOtrohet || hasVerbalKränkning) ? "MAYBE"
    : hasRepairSignals ? "YES" 
    : (hasWarmth ? "MAYBE" : "NO");
  const has_apology: YesNo = hasApology ? "YES" : "NO";
  const has_plan: YesNo = hasPlan ? "YES" : "NO";

  // Enhanced safety flag logic - prioritize safety words with better detection
  // Count safety words to better assess danger level
  const safetyWordCount = countMatches(description, SAFETY_WORDS);
  
  // Detect explicit violence patterns
  const hasExplicitViolence = /skriker|kastar|slår|knuffar|fysisk|övergrepp/i.test(description);
  const hasFear = /rädd|skrämmer|skrämmande|hotfull/i.test(description);
  const hasControl = /kontrollerar|dominans|tvingar|isolerar/i.test(description);
  
  // Enhanced logic for obvious violence cases + risk patterns
  // hasOtrohet, hasVerbalKränkning, hasFörlåtelsecykel, hasUpprepning already declared above
  
  const safety_flag: SafetyFlag = 
    hasExplicitViolence || (hasSafetyWords && safetyWordCount >= 2) 
      ? "DANGER"  // Explicit violence or multiple safety words = DANGER
      : hasSafetyWords || hasFear || hasControl
        ? (risk_count >= 2 ? "RISK" : "CAUTION")  // Safety concerns = RISK or CAUTION
        : (hasOtrohet && hasVerbalKränkning && hasUpprepning)
          ? "RISK"  // Otrohet + verbal kränkning + upprepning = RISK
        : (hasOtrohet && hasVerbalKränkning) || (hasOtrohet && hasFörlåtelsecykel)
          ? "RISK"  // Otrohet + verbal kränkning eller förlåtelsecykel = RISK
          : hasOtrohet || hasVerbalKränkning || hasFörlåtelsecykel
            ? "CAUTION"  // Enstaka risk-mönster = CAUTION
            : (risk_count >= 2 ? "RISK" : risk_count >= 1 ? "CAUTION" : "NORMAL");

  // Standardized net_score: pos - neg - risk (as per latest spec)
  const net_score = pos_count - neg_count - risk_count;

  // Enhanced toxicity detection
  const self_harm_mention = /självmord|döda mig|ta livet|sluta leva/i.test(description);
  // Förbättrad abuse detection - "hemska saker" = psykologiskt/verbalt våld
  const abuse_mention = /förbannad|hata dig|skit|jävla|helvete|hemska saker|kränk|nedvärder|förolämp|elak/i.test(description);
  
  // Calculate toxicity score based on negative content
  const toxicity_score = Math.min(
    (neg_count * 0.2) + (abuse_mention ? 0.3 : 0) + (self_harm_mention ? 0.5 : 0), 
    1.0
  );

  return {
    pos_count,
    neg_count,
    risk_count,
    risk_areas,
    repair_signals,
    warmth,
    has_apology,
    has_plan,
    safety_flag,
    net_score,
    toxicity_score: Math.round(toxicity_score * 100) / 100,
    self_harm_mention,
    abuse_mention
  };
}
