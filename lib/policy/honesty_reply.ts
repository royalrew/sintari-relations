import type { ComposeResult, Locale, Mode, Risk } from "@/copy/policy_reply";
import type { HonestyReason } from "./honesty_signals";

export type HonestyReplyOptions = {
  locale?: Locale;
  mode?: Mode;
  risk?: Risk;
  reasons?: HonestyReason[];
  missingFacets?: string[];
  suggestedProbe?: string;
  sessionId?: string;
};

type LocaleBundle = {
  see: string[];
  hrSee: string[];
  redSee: string[];
  lackGeneric: string[];
  lackWithFacet: (facets: string) => string;
  questionGeneric: string[];
  questionWithProbe: (probe: string) => string;
};

const bundles: Record<Locale, LocaleBundle> = {
  sv: {
    see: [
      "Jag ser det du delar.",
      "Jag hör hur viktigt det här är för dig.",
      "Jag tar in det du beskriver.",
    ],
    hrSee: [
      "Jag tar in det du beskriver om jobbet och vill hantera det respektfullt.",
      "Jag ser att du lyfter en situation på jobbet och är med dig i det.",
    ],
    redSee: [
      "Jag hör hur allvarligt det känns för dig just nu. Om du är i akut fara – ring 112.",
      "Jag ser att det här är tungt och vill vara nära i det. Om du är i akut fara – ring 112. Säg till om du vill att jag listar stödresurser.",
    ],
    lackGeneric: [
      "Jag saknar fortfarande lite mer fakta för att förstå helheten.",
      "Jag behöver lite fler detaljer för att kunna följa dig helt.",
    ],
    lackWithFacet: (facets: string) => `Jag saknar detaljer om ${facets}.`,
    questionGeneric: [
      "Vill du berätta lite mer om vad som händer?",
      "Skulle du vilja dela lite mer så jag hänger med?",
      "Vad känns viktigast att fylla i just nu?",
    ],
    questionWithProbe: (probe: string) => `Vill du berätta mer om ${probe}?`,
  },
  en: {
    see: [
      "I see what you’re sharing.",
      "I hear how important this feels to you.",
      "I’m taking in what you’re telling me.",
    ],
    hrSee: [
      "I’m taking in what you’re describing at work and want to handle it respectfully.",
      "I understand you’re raising a workplace situation and I’m here with you in it.",
    ],
    redSee: [
      "I hear how serious this feels right now. If you're in immediate danger, call your local emergency number.",
      "I can sense the weight of this and want to stay close with you. If you're in immediate danger, call your local emergency number. Let me know if you want me to list support resources.",
    ],
    lackGeneric: [
      "I’m still missing a bit more context to see the whole picture.",
      "I need a few more details to fully follow you.",
    ],
    lackWithFacet: (facets: string) => `I’m missing details about ${facets}.`,
    questionGeneric: [
      "Could you share a little more about what’s going on?",
      "Would you be open to filling in a bit more so I can follow?",
      "What feels most important to add right now?",
    ],
    questionWithProbe: (probe: string) => `Could you tell me more about ${probe}?`,
  },
};

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // 32-bit
  }
  return Math.abs(hash);
}

function choose(items: string[], sessionId?: string): string {
  if (items.length === 0) return "";
  if (items.length === 1 || !sessionId) return items[0];
  const idx = simpleHash(sessionId) % items.length;
  return items[idx];
}

function formatFacets(locale: Locale, facets: string[]): string {
  if (!facets.length) return "";
  const cleaned = facets.map((facet) => facet.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];
  const last = cleaned[cleaned.length - 1];
  const prefix = cleaned.slice(0, -1).join(locale === "en" ? ", " : ", ");
  const conjunction = locale === "en" ? " and " : " och ";
  return `${prefix}${conjunction}${last}`;
}

export function composeHonestReply(
  userText: string,
  options: HonestyReplyOptions = {},
): ComposeResult {
  const locale: Locale = options.locale ?? "sv";
  const bundle = bundles[locale] ?? bundles.sv;
  const sessionId = options.sessionId;

  const reasons = options.reasons ?? [];
  const missingFacets = options.missingFacets ?? [];

  let opener: string;
  if (options.risk === "RED") {
    opener = choose(bundle.redSee, sessionId) || choose(bundle.see, sessionId);
  } else if (options.mode === "hr") {
    opener = choose(bundle.hrSee, sessionId) || choose(bundle.see, sessionId);
  } else {
    opener = choose(bundle.see, sessionId);
  }

  const facetsText = formatFacets(locale, missingFacets);
  let lackBlock: string;
  if (facetsText) {
    lackBlock = bundle.lackWithFacet(facetsText);
  } else if (reasons.includes("memory_miss") || reasons.includes("data_gap")) {
    lackBlock = choose(bundle.lackGeneric, sessionId);
  } else {
    lackBlock = choose(bundle.lackGeneric, sessionId);
  }

  let question: string;
  if (options.suggestedProbe) {
    question = bundle.questionWithProbe(options.suggestedProbe);
  } else {
    question = choose(bundle.questionGeneric, sessionId);
  }

  const pieces = [opener, lackBlock, question]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    text: pieces,
    usedInterjection: false,
  };
}
