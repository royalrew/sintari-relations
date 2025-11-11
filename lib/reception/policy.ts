import { z } from "zod";

export type CarryOverMode = "none" | "minimal";

export type HandoffPayload = {
  sessionId: string;
  consent: boolean;
  carryOver: CarryOverMode;
  summary?: string | null;
  risk: "SAFE" | "RED";
  mode: "personal" | "hr";
  introNote?: string | null;
};

export const handoffSchema = z.object({
  sessionId: z.string().min(1),
  consent: z.boolean(),
  carryOver: z.union([z.literal("none"), z.literal("minimal")]),
  summary: z
    .string()
    .max(240)
    .optional()
    .nullable()
    .transform((value) => (value?.trim() ? value.trim() : undefined)),
  risk: z.union([z.literal("SAFE"), z.literal("RED")]),
  mode: z.union([z.literal("personal"), z.literal("hr")]),
  introNote: z
    .string()
    .max(240)
    .optional()
    .nullable()
    .transform((value) => (value?.trim() ? value.trim() : undefined)),
});

const PII_STRICT = /\b(personnummer|ålder|adress|telefonnummer|telefon|mejl|mail|email|gmail|diagnos|diagnoser|ptsd|adhd|bipolär|autism|sjukdom)\b/i;

export class HandoffPolicy {
  static canTransfer(payload: HandoffPayload) {
    if (payload.risk === "RED") {
      return {
        allow: false,
        reason: "risk_red",
      } as const;
    }

    if (payload.mode === "hr") {
      return {
        allow: false,
        reason: "hr_mode_blocked",
      } as const;
    }

    if (payload.carryOver === "minimal") {
      if (!payload.summary || payload.summary.length === 0) {
        return {
          allow: false,
          reason: "summary_missing",
        } as const;
      }

      if (payload.summary.length > 240) {
        return {
          allow: false,
          reason: "summary_too_long",
        } as const;
      }

      if (PII_STRICT.test(payload.summary)) {
        return {
          allow: false,
          reason: "summary_contains_pii",
        } as const;
      }
    }

    return {
      allow: true,
    } as const;
  }

  static introNoteForCoach(payload: HandoffPayload) {
    if (!payload.consent || payload.carryOver !== "minimal") {
      return undefined;
    }
    return payload.summary?.slice(0, 240);
  }
}

