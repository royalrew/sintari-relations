import fs from "fs";
import path from "path";

type ToneVector = [number, number, number];
interface ExplainInput {
  toneVector: ToneVector;
  spans?: Array<Record<string, any>>;
  memoryFacets?: string[];
  riskFlags?: Record<string, any>;
  level?: "brief" | "standard" | "deep";
  style?: "warm" | "neutral" | "coach";
  lang?: "sv" | "en";
}

interface ExplainConfig {
  style: "warm" | "neutral" | "coach";
  max_len: number;
  levels: Array<"brief" | "standard" | "deep">;
  no_advice: boolean;
  sv_en_parity: boolean;
  evidence_links: boolean;
}

const explainConfig: ExplainConfig = (() => {
  try {
    const cfgPath = path.join(process.cwd(), "config", "explain.json");
    const raw = fs.readFileSync(cfgPath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      style: parsed.style ?? "warm",
      max_len: parsed.max_len ?? 160,
      levels: parsed.levels ?? ["brief", "standard", "deep"],
      no_advice: parsed.no_advice ?? true,
      sv_en_parity: parsed.sv_en_parity ?? true,
      evidence_links: parsed.evidence_links ?? true,
    };
  } catch (err) {
    return {
      style: "warm",
      max_len: 160,
      levels: ["brief", "standard", "deep"],
      no_advice: true,
      sv_en_parity: true,
      evidence_links: true,
    };
  }
})();

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function styleTemplate(style: string) {
  switch ((style || "warm").toLowerCase()) {
    case "neutral":
      return {
        lead: "Jag observerar att",
        why: "Det tyder på att",
        reflect: "Stämmer det om vi formulerar det så här?",
      };
    case "coach":
      return {
        lead: "Här är ett skifte jag ser",
        why: "Det pekar mot",
        reflect: "Vill du utforska vilket av dessa som känns mest sant nu?",
      };
    default:
      return {
        lead: "Det du delar visar",
        why: "Det verkar som",
        reflect: "Vill du stanna upp vid den känslan en stund?",
      };
  }
}

function buildPatterns(tone: ToneVector, riskFlags: Record<string, any>, facets: string[] = []) {
  const [e, w, c] = tone;
  const lowerFacets = new Set((facets || []).map((f) => String(f).toLowerCase()));
  const patterns: string[] = [];
  if (e > 0.7 && w < 0.4) patterns.push("empati utan värme → risk för utmattning");
  if (c < 0.35 && (lowerFacets.has("boundary") || riskFlags?.coercion)) {
    patterns.push("gräns-oskärpa i känsligt samtal");
  }
  if (riskFlags?.selfharm) patterns.push("akut risksignal – observerad, ej tolkning");
  if (!patterns.length) patterns.push("tolkningsmönster: värde/tempo‑missmatch");
  return patterns;
}

function buildWhy(tone: ToneVector, spans: Array<Record<string, any>>, tpl: ReturnType<typeof styleTemplate>) {
  const [e, w, c] = tone;
  const highlights: string[] = [];
  if (e >= 0.6) highlights.push("hög empati");
  if (w <= 0.4) highlights.push("lägre värme");
  if (c <= 0.5) highlights.push("minskad klarhet");
  const bits = highlights.length ? highlights.join(", ") : "en blandad känsla";
  let evidence = "";
  if (Array.isArray(spans) && spans.length) {
    const phrases = spans
      .slice(0, 2)
      .map((s) => String(s?.text || s?.cue || "").trim().slice(0, 48))
      .filter(Boolean);
    if (phrases.length) {
      evidence = ` – (spår: ${phrases.join("; ")})`;
    }
  }
  return `${tpl.lead} ${bits}. ${tpl.why} vissa delar väger tyngre idag${evidence}.`;
}

function buildReflection(tpl: ReturnType<typeof styleTemplate>, tone: ToneVector) {
  const [e, , c] = tone;
  let addon = "Vad vill du sätta ord på först?";
  if (e < 0.35) addon = "Vad väcker det här i dig just nu?";
  else if (c < 0.4) addon = "Vad skulle göra läget lite tydligare för dig?";
  return `${tpl.reflect} ${addon}`;
}

export function buildExplainPayload(params: ExplainInput) {
  const cfg = explainConfig;
  const style = params.style || process.env.EXPLAIN_STYLE || cfg.style;
  const level = (params.level || process.env.EXPLAIN_LEVEL || "standard") as ExplainInput["level"];
  const tpl = styleTemplate(style);

  const tone: ToneVector = [
    clamp01(params.toneVector?.[0] ?? 0.5),
    clamp01(params.toneVector?.[1] ?? 0.5),
    clamp01(params.toneVector?.[2] ?? 0.5),
  ];

  const maxLen = Number.isFinite(cfg.max_len) ? Number(cfg.max_len) : 160;

  let why = buildWhy(tone, params.spans || [], tpl).slice(0, maxLen);
  const patterns = buildPatterns(tone, params.riskFlags || {}, params.memoryFacets || []);
  let reflection = buildReflection(tpl, tone);

  if (level === "brief") {
    return {
      style,
      level,
      why,
      patterns: patterns.slice(0, 1),
      reflection: reflection.slice(0, maxLen),
      evidence: cfg.evidence_links ? (params.spans || []).slice(0, 1) : [],
      no_advice: cfg.no_advice,
    };
  }

  if (level === "deep") {
    reflection = `${reflection} Om du vill kan vi lägga märke till vad som känns viktigast i detta.`.slice(0, maxLen);
  }

  return {
    style,
    level,
    why,
    patterns,
    reflection: reflection.slice(0, maxLen),
    evidence: cfg.evidence_links ? (params.spans || []).slice(0, 2) : [],
    no_advice: cfg.no_advice,
  };
}
