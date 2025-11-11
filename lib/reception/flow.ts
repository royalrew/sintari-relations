import { cooldown } from "@/lib/server/cooldown";

export type IntakeFacet = "person" | "context" | "goal" | "barrier";

export type IntakeQuestion = {
  id: string;
  facet: IntakeFacet;
  text: string;
};

export type IntakeQuestionOptions = {
  missingFacets?: string[];
  locale?: "sv" | "en";
};

const QUESTION_TEXTS = {
  sv: {
    person:
      "Vem gäller det mest just nu? (t.ex. du själv, partner, annan viktig person)",
    context: "Vad är det som händer just nu som du vill prata om?",
    goal: "Vad hoppas du få hjälp med i samtalet idag?",
    barrier:
      "Vad känner du hindrar dig mest från att komma vidare just nu?",
  },
  en: {
    person:
      "Who is this mainly about right now? (e.g. yourself, partner, someone else)",
    context: "What is happening right now that you want to talk about?",
    goal: "What do you hope to get out of this conversation today?",
    barrier:
      "What feels like the biggest thing holding you back right now?",
  },
} as const;

const PERSON_QUESTION_ID = "intake_person";
const CONTEXT_QUESTION_ID = "intake_context";
const GOAL_QUESTION_ID = "intake_goal";
const BARRIER_QUESTION_ID = "intake_barrier";

export function buildIntakeQuestions(
  options: IntakeQuestionOptions = {},
): IntakeQuestion[] {
  const locale = options.locale ?? "sv";
  const texts = QUESTION_TEXTS[locale];

  const q1: IntakeQuestion = {
    id: PERSON_QUESTION_ID,
    facet: "person",
    text: texts.person,
  };

  const q2: IntakeQuestion = {
    id: CONTEXT_QUESTION_ID,
    facet: "context",
    text: texts.context,
  };

  const shouldAskBarrier =
    (options.missingFacets ?? []).length > 0 ||
    (options.missingFacets ?? []).includes("evidence");

  const finalQuestion: IntakeQuestion = shouldAskBarrier
    ? {
        id: BARRIER_QUESTION_ID,
        facet: "barrier",
        text: texts.barrier,
      }
    : {
        id: GOAL_QUESTION_ID,
        facet: "goal",
        text: texts.goal,
      };

  return [q1, q2, finalQuestion];
}

const HONESTY_TTL_PREFIX = "reception_honesty";

export type HonestyTTLResult =
  | { show: true; ttlRemainingMs: number }
  | { show: false; ttlRemainingMs: number };

export function shouldShowHonestyChip(
  sessionId: string,
  now = Date.now(),
  serverTtlMs = 5 * 60 * 1000,
): HonestyTTLResult {
  const key = `${HONESTY_TTL_PREFIX}:${sessionId}`;
  const { suppressed, ttlRemainingMs } = cooldown.ping(key, now, serverTtlMs);
  if (suppressed) {
    return { show: false, ttlRemainingMs };
  }
  return { show: true, ttlRemainingMs };
}

export function resetHonestyChipCooldown(sessionId: string) {
  const key = `${HONESTY_TTL_PREFIX}:${sessionId}`;
  cooldown.clear(key);
}

export type HonestyChipEventType =
  | "honesty_chip_shown"
  | "honesty_chip_completed";

export type HonestyChipEvent = {
  ts: string;
  session_id: string;
  event: HonestyChipEventType;
  facets?: string[];
  duration_ms?: number;
};

export function buildHonestyChipEvent(params: {
  sessionId: string;
  type: HonestyChipEventType;
  facets?: string[];
  durationMs?: number;
  now?: number;
}): HonestyChipEvent {
  return {
    ts: new Date(params.now ?? Date.now()).toISOString(),
    session_id: params.sessionId,
    event: params.type,
    facets:
      params.facets && params.facets.length > 0 ? params.facets : undefined,
    duration_ms:
      params.durationMs && params.durationMs > 0
        ? Math.round(params.durationMs)
        : undefined,
  };
}

