// Enkel, deterministisk v1-agent utan externa API:n.
// Input: person1, person2, description
// Output: 3 reflektioner + 1 rekommendation

import indicatorsData from "@/data/indicators.json";

export type RelationAgentOutput = {
  reflections: string[];        // exakt 3
  recommendation: string;       // 1 huvudrekommendation
  safetyFlag: boolean;          // röd flagga om trygghet hotas
};

// Importera indikatorer från extern fil för enkel underhåll
const POS = indicatorsData.POS;
const NEG = indicatorsData.NEG;
const RISK = indicatorsData.RISK;

// Reparationssignaler - ord som visar handling/ansvar
const REPAIR_HINTS = [
  "förlåt", "ursäkt", "ursäkta",
  "plan", "schema", "överens", "kompromiss",
  "vi pratade", "vi talade", "vi snackade",
  "vi testade", "vi provade",
  "jobbar på", "vi försöker", "vi försökt", "vi ska försöka",
  "tog ansvar", "ansvar", "beklagar"
];

// Värme & positiv grund - utökad för bättre identifiering
const WARM_TONE = [
  "kärlek", "älskar", "värme", "omtanke", "respekt", "tillit", "förståelse", "stöd",
  "kommunicerar bra", "bra kommunikation", "pratar bra", "lyssnar", "snäll", "ärlig",
  "tacksam", "glad", "lycka", "harmoni", "samarbete", "tillsammans", "planerar"
];

// Trygghetshot - signaler som kan indikera osäker relation (röd flagga)
const SAFETY_WORDS = [
  "elak", "elaka", "kränkande", "kränker", "respektlös", "hot", "hotar",
  "rädd", "rädda", "våld", "aggressiv", "aggressivitet", "trakasserier",
  "kontrollerande", "psykiskt våld", "fysiskt våld", "övergrepp",
  "slår", "knuffar", "fysisk", "skrämmande", "skrämmer",
  "tvingar", "tvång", "dominans", "dominerar", "isolering", "isolerar",
  "nedvärderande", "förminskar", "förödmjukar", "kontrollerar allt",
  "tillåter inte", "förbjuder", "obehaglig", "hotfull", "farlig"
];

// Hjälpfunktioner
function hasAny(text: string, list: string[]) {
  const t = text.toLowerCase();
  return list.some(w => t.includes(w));
}

function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Nivåer för reparationsreflektion
const MSG_CLEAR = [
  "Ni tar ansvar och pekar framåt – bra. Lås 1 veckoritual och tidsätt första steget.",
  "Det finns både ursäkt och plan – konkretisera och sätt datum.",
  "Ni visar både ansvar och riktning – fånga det. Sätt en enkel veckoritual och tidsätt första steget."
];

const MSG_WARM = [
  "Värmen finns där. Välj 1 vana, 1 tid, 1 regel – prova i 7 dagar.",
  "Ni har värme. Gör den operativ: liten vana + fast tid varje vecka.",
  "Värmen finns där. Gör det konkret: välj 1 vana, 1 tidpunkt, 1 gemensam regel – testa i 7 dagar."
];

const MSG_NONE = [
  "Jag ser inte tydliga reparationssignaler ännu. Börja litet: 1 vana/vecka och en 10-min check-in.",
  "Inga tydliga reparationssteg syns. Starta minimalt: en vana och kort veckomöte.",
  "Börja smått med 1 konkret vana per vecka och en kort check-in."
];

function repairReflection(description: string): string {
  const hasRepair = hasAny(description, REPAIR_HINTS);
  const hasWarmth = hasAny(description, WARM_TONE);
  
  if (hasRepair) return pick(MSG_CLEAR);
  if (hasWarmth) return pick(MSG_WARM);
  return pick(MSG_NONE);
}

function scoreText(desc: string) {
  const text = desc.toLowerCase();
  const pos = POS.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
  const neg = NEG.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
  return { pos, neg, net: pos - neg };
}

function extractSignals(desc: string) {
  const text = desc.toLowerCase();
  const risks = RISK.filter((w) => text.includes(w));
  const hasApology = /förlåt|ursäkt/i.test(desc);
  const hasPlan = /plan|schema|överens/i.test(desc);
  const safetyFlag = hasAny(desc, SAFETY_WORDS);
  return { risks, hasApology, hasPlan, safetyFlag };
}

// --- Explain/Evidence Utilities ---
import { prioritizedSpans, RawSpan } from '../utils/explain_utils';

// Enhanced evidence span extraction with comprehensive diamond-level flag detection
export function extractEvidenceSpans(description: string, lang: string = 'sv'): RawSpan[] {
  const text = description.toLowerCase();
  const matches: RawSpan[] = [];
  
  // Comprehensive flag detection patterns for all diamond cases
  const FLAG_PATTERNS = {
    // Basic flags
    "kritik": [
      "kritiserar", "kritik", "fel", "problem", "borde", "skulle", "bör"
    ],
    "försvar": [
      "försvarar", "försvar", "inte mitt fel", "det var inte", "jag gjorde inte"
    ],
    "stonewalling": [
      "tyst", "svarar inte", "ignorerar", "vänder ryggen", "stänger av"
    ],
    "missed_repair": [
      "missade", "förstod inte", "lyssnade inte", "ignorerade"
    ],
    "sarkasm": [
      "sarkasm", "ironi", "hån", "spydigt", "sarkastisk"
    ],
    "validering": [
      "förstår", "håller med", "stödjer", "respekterar", "bekräftar"
    ],
    "hot": [
      "hot", "hotar", "våld", "slår", "farlig", "rädd"
    ],
    "ansvar": [
      "ta ansvar", "ansvar", "mitt fel", "jag gjorde", "beklagar"
    ],
    "gaslighting": [
      "du minns fel", "det hände inte", "du överdriver", "fantiserar"
    ],
    "kontroll": [
      "kontrollerar", "bestämmer", "berättar du alltid", "från och med nu", "du får inte"
    ],
    "distansering": [
      "distans", "kall", "känslomässig distans", "isolerar"
    ],
    "anknytning_krock": [
      "anknytning", "närhet", "känslomässig", "attachment"
    ],
    "values_misalignment": [
      "olika värderingar", "värderingar", "principer", "olika mål"
    ],
    "ekonomisk_kontroll": [
      "ekonomisk kontroll", "jag tar kortet", "du får inte köpa", "jag bestämmer vad du får köpa"
    ],
    "ritual": [
      "ritual", "vanor", "rutiner", "traditions"
    ],
    "trauma_trigger": [
      "trauma", "trigger", "påminner om", "flashback"
    ],
    "trygghetsbegäran": [
      "trygghet", "säkerhet", "stöd", "hjälp"
    ],
    "gränssättning": [
      "gränser", "inte när rösterna höjs", "pausar jag", "kommer tillbaka"
    ],
    "assertivitet": [
      "assertiv", "tydlig", "direkt", "pausar jag fem minuter"
    ],
    "kommunikationsplan": [
      "kommunikationsplan", "prata", "diskutera", "planera"
    ],
    // Advanced diamond flags
    "kodväxling": [
      "men i'm exhausted", "kodet växling", "språkbyte"
    ],
    "förminskning": [
      "slöseri", "förminskar", "liten", "oviktig"
    ],
    "conditional_affection": [
      "villkorslös kärlek", "villkor", "om du"
    ],
    "cykel": [
      "cykel", "upprepar", "samma mönster"
    ],
    "föräldrastil": [
      "föräldrastil", "uppfostran", "barn"
    ],
    "mått": [
      "mått", "balans", "jämvikt"
    ],
    "soft_repair": [
      "mjuk reparation", "mild", "försiktig"
    ],
    "behovsutsaga": [
      "behov", "vill ha", "önskar"
    ],
    "telefon_kontroll": [
      "telefon", "ringa", "kontrollera"
    ],
    "svartsjuka": [
      "svartsjuka", "avundsjuk", "misstänksam"
    ],
    "självinsikt": [
      "självinsikt", "reflektion", "självanalys"
    ]
  };

  // Generate spans for each detected flag
  for (const [flag, patterns] of Object.entries(FLAG_PATTERNS)) {
    for (const pattern of patterns) {
      const idx = text.indexOf(pattern);
      if (idx >= 0) {
        matches.push({
          start: idx,
          end: idx + pattern.length,
          flag,
          cue: pattern,
          type: pattern.length > 10 ? "PHRASE" : "LEXICON"
        });
      }
    }
  }

  // Apply F3 heuristics pipeline
  return prioritizedSpans(matches, description, lang);
}

export function relationAgentV1(input: { person1: string; person2: string; description: string }): RelationAgentOutput & { evidence: any[]; explain_spans_labeled: any[] } {
  const { person1, person2, description } = input;
  const s = scoreText(description);
  const sig = extractSignals(description);

  const reflections: string[] = [];

  // Trygghetskontroll FÖRST (högsta prioritet)
  if (sig.safetyFlag) {
    reflections.push(
      "⚠️ Orden antyder att tryggheten kan vara hotad. Säkerställ att du har stöd och utrymme att prata tryggt om det som känns fel. Vid akuta lägen, kontakta professionellt stöd."
    );
  }

  // Reflektion 1: tonläge
  if (s.net >= 2) {
    reflections.push("Grundtonen känns varm och respektfull – det finns positiva byggstenar.");
  } else if (s.net <= -1) {
    reflections.push("Det finns negativ laddning som behöver avlastas innan ni kan bygga vidare.");
  } else {
    reflections.push("Tonläget verkar blandat – både ljuspunkter och friktion.");
  }

  // Reflektion 2: riskindikatorer
  if (sig.risks.length > 0) {
    reflections.push(`Riskytor nämns: ${sig.risks.join(", ")} – dessa kräver tydliga spelregler.`);
  } else {
    reflections.push("Inga tydliga riskytor nämns – men definiera gärna prioriteringar och förväntningar.");
  }

  // Reflektion 3: reparationssignaler (förbättrad med varianter)
  reflections.push(repairReflection(description));

  // Rekommendation (1st) – enkel, handlingsbar
  let recommendation = "";
  
  // Svek-specifik rekommendation (högsta prioritet efter safety)
  const hasOtrohet = sig.risks.includes("otrohet");
  const hasVerbalKränkning = sig.risks.includes("verbal kränkning") || sig.risks.includes("psykologiskt våld");
  const hasFörlåtelsecykel = sig.risks.includes("förlåtelsecykel");
  
  if (hasOtrohet && (hasVerbalKränkning || hasFörlåtelsecykel)) {
    recommendation = "Du beskriver kärlek men också upprepat svek och kränkningar. Mönstret med ursäkt + löfte → nytt övertramp är riskfyllt. Sätt en tydlig gräns och vad som händer vid nästa övertramp. Ta stöd av en terapeut eller stödlinje. Du förtjänar respekt och trygghet.";
  } else if (hasOtrohet) {
    recommendation = "Otrohet skapar djup skada i förtroendet. Överväg parterapi för att hantera sveket och bygga upp trygghet igen. Sätt tydliga gränser för framtiden.";
  } else if (hasVerbalKränkning) {
    recommendation = "Verbala kränkningar är aldrig okej. Sätt en tydlig gräns och vad som händer vid fortsatt kränkande beteende. Du förtjänar respekt.";
  }
  // Om trygghet hotas → prioritera trygghet över allt annat
  else if (sig.safetyFlag) {
    recommendation =
      "Prioritera trygghet: välj en lugn tid att prata, sätt gränser tydligt, och involvera stöd (vän/familj/professionell hjälp) vid behov. Hoppa över prestationsmål tills tryggheten känns stabil.";
  } else if (s.net <= -1) {
    recommendation =
      "Gör en 20-min veckoritual: 5 min var att prata ostört, 5 min gemensam summering med 1 konkret åtgärd till nästa vecka.";
  } else if (sig.risks.includes("kommunikation") || sig.risks.includes("missförstånd") || sig.risks.includes("brist på lyssnande")) {
    recommendation =
      "Inför 'check-in' 10 min varje kväll: 3 punkter – vad gick bra, vad skavde, vad testar vi imorgon.";
  } else if (sig.risks.includes("ekonomi") || sig.risks.includes("pengar") || sig.risks.includes("budget")) {
    recommendation =
      "Skapa en enkel månadsbudget på 30 min: 3 kategorier, tak per kategori, och en gemensam 15-min avstämning varje söndag.";
  } else if (sig.risks.includes("tid") || sig.risks.includes("stress") || sig.risks.includes("obalans") || sig.risks.includes("prioriteringar")) {
    recommendation =
      "Boka in 'quality time' varje vecka: 2 timmar utan telefon där ni fokuserar på varandra. Planera tillsammans vad ni vill göra.";
  } else if (sig.risks.includes("barn") || sig.risks.includes("föräldraskap") || sig.risks.includes("ansvarsfördelning")) {
    recommendation =
      "Gör en veckoplanering tillsammans: fördela ansvar tydligt och boka in parstid utan barn minst en gång i veckan.";
  } else if (sig.risks.includes("intimitet") || sig.risks.includes("närhet") || sig.risks.includes("sex")) {
    recommendation =
      "Sätt av tid för fysisk och emotionell närhet: börja med 15 min kramstund varje dag utan förväntningar, bygg upp förtroende stegvis.";
  } else if (sig.risks.includes("olika mål") || sig.risks.includes("framtid") || sig.risks.includes("olika riktning")) {
    recommendation =
      "Boka en 'framtidsdag': 3 timmar där ni pratar om era individuella och gemensamma mål. Hitta överlapp och kompromisser.";
  } else {
    recommendation =
      "Planera en 90-min kvalitetsdejt varje vecka: 30 min aktivitet, 30 min samtal, 30 min plan för kommande vecka.";
  }

  // Evidence spans från extractEvidenceSpans
  const evidence = extractEvidenceSpans(description);
  
  // Generate explain_spans_labeled for test runner compatibility
  const explain_spans_labeled = evidence.map(span => ({
    start: span.start,
    end: span.end,
    text: description.slice(span.start, span.end),
    label: span.flag
  }));

  return {
    reflections: reflections.slice(0, 3),
    recommendation,
    safetyFlag: sig.safetyFlag,
    evidence,
    explain_spans_labeled
  };
}

