type Locale = "sv" | "en" | "unknown";

export type OversightInput = {
  userText: string;
  replyText: string;
  locale?: Locale | string | null;
  intent?: string | null;
  mode?: string | null;
  risk?: string | null;
  honestyActive?: boolean;
  turn?: number;
};

export type OversightIssue = {
  code: string;
  severity: "warn" | "fail";
  message: string;
  evidence?: string;
};

export type OversightReview = {
  rating: "pass" | "warn" | "fail";
  score: number;
  issues: OversightIssue[];
  heuristics: {
    detectedLanguage: Locale;
    targetLanguage: Locale | "unspecified";
    tokens: number;
    length: number;
    sentenceCount: number;
  };
};

const PLACEHOLDER_PATTERNS: Array<[RegExp, OversightIssue]> = [
  [
    /\[object Object\]/i,
    {
      code: "OVR_PLACEHOLDER",
      severity: "fail",
      message: "Svar innehåller platshållare som '[object Object]'",
    },
  ],
  [
    /\bundefined\b|\bnull\b/i,
    {
      code: "OVR_UNDEFINED",
      severity: "warn",
      message: "Svar innehåller 'undefined' eller 'null'",
    },
  ],
  [
    /lorem ipsum/i,
    {
      code: "OVR_LOREM",
      severity: "fail",
      message: "Svar innehåller lorem-ipsum text",
    },
  ],
];

function detectLanguage(text: string): Locale {
  const lower = text.toLowerCase();
  if (!lower.trim()) return "unknown";

  const swedishLetters = lower.match(/[åäö]/g)?.length ?? 0;
  const swedishWords =
    lower.match(
      /\b(?:och|att|du|jag|inte|det|känns|vill|kan|ska|skulle|hjälp|berätta|tillsammans|steg|tryggt|lugnt)\b/g,
    )?.length ?? 0;
  const englishWords =
    lower.match(/\b(?:the|and|you|i|it|feel|help|share|tell|support|together|step|gentle|would)\b/g)?.length ?? 0;

  const swScore = swedishLetters * 2 + swedishWords * 3;
  const enScore = englishWords * 3;

  if (swScore === 0 && enScore === 0) return "unknown";
  if (swScore >= enScore * 1.2) return "sv";
  if (enScore >= swScore * 1.2) return "en";
  return "unknown";
}

function clampLocale(locale?: string | null): Locale | "unspecified" {
  if (!locale) return "unspecified";
  const norm = locale.toLowerCase();
  if (norm.startsWith("sv")) return "sv";
  if (norm.startsWith("en")) return "en";
  return "unspecified";
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?…]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function addIssue(issues: OversightIssue[], issue: OversightIssue, evidence?: string) {
  issues.push(evidence ? { ...issue, evidence } : issue);
}

export function reviewOversight(input: OversightInput): OversightReview {
  const reply = String(input.replyText ?? "").trim();
  const user = String(input.userText ?? "").trim();
  const issues: OversightIssue[] = [];

  const detectedLanguage = detectLanguage(reply);
  const targetLanguage = clampLocale(input.locale);

  const tokens = tokenize(reply).length;
  const sentences = splitSentences(reply);

  if (!reply) {
    addIssue(issues, {
      code: "OVR_EMPTY_REPLY",
      severity: "fail",
      message: "Svar saknas eller är tomt",
    });
  }

  for (const [regex, template] of PLACEHOLDER_PATTERNS) {
    const match = regex.exec(reply);
    if (match) {
      addIssue(issues, template, match[0]);
    }
  }

  if (tokens > 0 && tokens <= 5 && (input.intent === "ask" || input.intent === "share")) {
    addIssue(issues, {
      code: "OVR_TOO_SHORT",
      severity: "warn",
      message: "Svar är mycket kort i förhållande till intent",
    });
  }

  if (sentences.length > 1) {
    const seen = new Map<string, number>();
    for (const sentence of sentences) {
      const key = sentence.toLowerCase();
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
    if (duplicates.length > 0) {
      addIssue(issues, {
        code: "OVR_REPETITION",
        severity: "warn",
        message: "Svaret upprepar identiska meningar",
        evidence: duplicates
          .map(([sentence, count]) => `${sentence.slice(0, 60)} (${count}×)`)
          .join("; "),
      });
    }
  }

  if (targetLanguage !== "unspecified" && detectedLanguage !== "unknown" && detectedLanguage !== targetLanguage) {
    addIssue(issues, {
      code: "OVR_LANGUAGE_MISMATCH",
      severity: "fail",
      message: `Språkdetektion (${detectedLanguage}) matchar inte målspråk (${targetLanguage})`,
    });
  } else if (targetLanguage === "unspecified" && detectedLanguage === "unknown" && reply.length > 0) {
    addIssue(issues, {
      code: "OVR_LANGUAGE_UNSURE",
      severity: "warn",
      message: "Språk kunde inte avgöras – målspråk saknas",
    });
  }

  const userAffirmative = /\b(ja|självklart|okej|ok|sure|yes|yep)\b/i.test(user);
  const replyQuestionCount = (reply.match(/\?/g) ?? []).length;
  if (userAffirmative && replyQuestionCount === 0 && /vill du/i.test(user)) {
    addIssue(issues, {
      code: "OVR_NO_FOLLOWUP_AFTER_AFFIRM",
      severity: "warn",
      message: "Ingen uppföljningsfråga trots bekräftelse från användaren",
    });
  }

  if (input.honestyActive && /\b(förslag|råd|tips)\b/i.test(reply)) {
    addIssue(issues, {
      code: "OVR_HONESTY_ADVICE",
      severity: "fail",
      message: "Honesty-läge ska inte ge konkreta råd",
    });
  }

  const failCount = issues.filter((issue) => issue.severity === "fail").length;
  const warnCount = issues.filter((issue) => issue.severity === "warn").length;
  const rawScore = Math.max(0, 1 - failCount * 0.4 - warnCount * 0.15);

  const rating: OversightReview["rating"] =
    failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass";

  return {
    rating,
    score: Number(rawScore.toFixed(3)),
    issues,
    heuristics: {
      detectedLanguage,
      targetLanguage,
      tokens,
      length: reply.length,
      sentenceCount: sentences.length,
    },
  };
}


