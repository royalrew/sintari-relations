// Utility function for calculating relation scores
// Separated from Server Actions to avoid build errors

import indicatorsData from "@/data/indicators.json";

export function calculateScore(description: string) {
  // Använd EXAKT samma logik som relation_agent.ts för konsistens
  const POS = indicatorsData.POS;
  const NEG = indicatorsData.NEG;
  const RISK = indicatorsData.RISK;
  
  // Hjälpfunktioner från agenten
  function hasAny(text: string, list: string[]) {
    const t = text.toLowerCase();
    return list.some(w => t.includes(w));
  }
  
  // scoreText funktionen från agenten
  function scoreText(desc: string) {
    const text = desc.toLowerCase();
    const pos = POS.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
    const neg = NEG.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
    return { pos, neg, net: pos - neg };
  }
  
  // extractSignals funktionen från agenten
  function extractSignals(desc: string) {
    const text = desc.toLowerCase();
    const risks = RISK.filter((w) => text.includes(w));
    const hasApology = /förlåt|ursäkt/i.test(desc);
    const hasPlan = /plan|schema|överens/i.test(desc);
    const safetyFlag = hasAny(desc, [
      "elak", "elaka", "kränkande", "kränker", "respektlös", "hot", "hotar",
      "rädd", "rädda", "våld", "aggressiv", "aggressivitet", "trakasserier",
      "kontrollerande", "psykiskt våld", "fysiskt våld", "övergrepp",
      "slår", "knuffar", "fysisk", "skrämmande", "skrämmer",
      "tvingar", "tvång", "dominans", "dominerar", "isolering", "isolerar",
      "nedvärderande", "förminskar", "förödmjukar", "kontrollerar allt",
      "tillåter inte", "förbjuder", "obehaglig", "hotfull", "farlig"
    ]);
    return { risks, hasApology, hasPlan, safetyFlag };
  }
  
  const scoreData = scoreText(description);
  const signals = extractSignals(description);
  
  // Reparationssignaler (samma som i agenten)
  const REPAIR_HINTS = [
    "förlåt", "ursäkt", "ursäkta",
    "plan", "schema", "överens", "kompromiss",
    "vi pratade", "vi talade", "vi snackade",
    "vi testade", "vi provade",
    "jobbar på", "vi försöker", "vi försökt", "vi ska försöka",
    "tog ansvar", "ansvar", "beklagar"
  ];
  
  // Utökad värme-signaler för bättre identifiering
  const WARM_TONE = [
    "kärlek", "älskar", "värme", "omtanke", "respekt", "tillit", "förståelse", "stöd",
    "kommunicerar bra", "bra kommunikation", "pratar bra", "lyssnar", "snäll", "ärlig",
    "tacksam", "glad", "lycka", "harmoni", "samarbete", "tillsammans", "planerar"
  ];
  
  const hasRepairSignals = hasAny(description, REPAIR_HINTS);
  const hasWarmth = hasAny(description, WARM_TONE);
  
  // Standardiserad net_score beräkning enligt specifikation
  // Formel: pos_count - neg_count - risk_count
  // Detta gör raderna reproducerbara vid analys
  const improvedNetScore = scoreData.pos - scoreData.neg - signals.risks.length;
  
  // Säkerhetsflaggor med tydliga domäner
  let safetyFlagLevel = "NORMAL";
  if (signals.safetyFlag) {
    // Ytterligare kategorisering baserat på risknivå
    if (signals.risks.length >= 3) {
      safetyFlagLevel = "RISK";
    } else {
      safetyFlagLevel = "CAUTION";
    }
  }
  
  // Reparationssignaler med tre nivåer
  let repairLevel = "NO";
  if (hasRepairSignals) {
    if (signals.hasApology && signals.hasPlan) {
      repairLevel = "YES";
    } else if (signals.hasApology || signals.hasPlan) {
      repairLevel = "MAYBE";
    }
  }

  return {
    posCount: scoreData.pos,
    negCount: scoreData.neg,
    riskCount: signals.risks.length,
    hasRepairSignals,
    hasWarmth,
    netScore: Math.round(improvedNetScore * 100) / 100, // Runda till 2 decimaler
    // Säkerhetsflagga med tydlig nivå
    safetyFlag: safetyFlagLevel,
    repairLevel: repairLevel,
    // Extra data för bättre analys
    riskAreas: signals.risks,
    hasApology: signals.hasApology,
    hasPlan: signals.hasPlan
  };
}
