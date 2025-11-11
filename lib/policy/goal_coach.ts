import { z } from "zod";

export const CoachInput = z.object({
  goal_text: z.string().min(3),
  context_facts: z.array(z.string()).default([]),
});

export type CoachPlan = {
  ok: boolean;
  reason?: string;
  next_step?: string;
  checklist?: string[];
  cautions?: string[];
};

export function goalCoach(input: z.infer<typeof CoachInput>): CoachPlan {
  const { goal_text, context_facts } = CoachInput.parse(input);

  if (!context_facts || context_facts.length === 0) {
    return {
      ok: false,
      reason: "Ingen evidens — samla ett fakta först (honesty/no-advice).",
    };
  }

  const step = `Gör en 10‑min aktivitet kopplad till: ${goal_text}.`;
  const checklist = [
    "Beskriv vad du vill uppnå i en mening",
    "Planera en konkret handling ≤10 min",
    "Utför handlingen denna vecka",
  ];
  const cautions = [
    "Håll tonen varm, undvik diagnoser, föreslå aldrig skadliga eller manipulativa steg.",
  ];

  return {
    ok: true,
    next_step: step,
    checklist,
    cautions,
  };
}

