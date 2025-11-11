export type HonestyReason =
  | "memory_miss"
  | "low_conf"
  | "no_evidence"
  | "lang_mismatch"
  | "tone_drift"
  | "data_gap"
  | "risk_hr_red";

export type HonestyContext = {
  memoryHitAt3?: number | null;
  confidence?: number | null;
  explainHasEvidence?: number | boolean | null;
  expectedLocale?: "sv" | "en" | null;
  detectedLocale?: "sv" | "en" | null;
  toneDelta?: number | null;
  toneDriftThreshold?: number | null;
  dataGap?: boolean | string[] | null;
  risk?: "SAFE" | "RED" | string | null;
  mode?: "personal" | "hr" | string | null;
};

export type HonestyDecision = {
  active: boolean;
  reasons: HonestyReason[];
};

const DEFAULT_CONFIDENCE_THRESHOLD = 0.6;
const DEFAULT_TONE_DRIFT_THRESHOLD = 0.05;

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return undefined;
  const num = Number(value);
  if (!Number.isNaN(num)) {
    return num !== 0;
  }
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
  }
  return undefined;
}

export function shouldTriggerHonesty(ctx: HonestyContext): HonestyDecision {
  const reasons = new Set<HonestyReason>();

  if (ctx) {
    if (isNumber(ctx.memoryHitAt3) && ctx.memoryHitAt3 < 1.0) {
      reasons.add("memory_miss");
    }

    if (isNumber(ctx.confidence) && ctx.confidence < DEFAULT_CONFIDENCE_THRESHOLD) {
      reasons.add("low_conf");
    }

    const hasEvidence = normalizeBoolean(ctx.explainHasEvidence);
    if (hasEvidence === false) {
      reasons.add("no_evidence");
    }

    const expectedLocale = ctx.expectedLocale ?? undefined;
    const detectedLocale = ctx.detectedLocale ?? undefined;
    if (expectedLocale && detectedLocale && expectedLocale !== detectedLocale) {
      reasons.add("lang_mismatch");
    }

    const toneDelta = isNumber(ctx.toneDelta) ? Math.abs(ctx.toneDelta) : 0;
    const toneThreshold = isNumber(ctx.toneDriftThreshold)
      ? Math.max(0, ctx.toneDriftThreshold)
      : DEFAULT_TONE_DRIFT_THRESHOLD;
    if (toneDelta > toneThreshold) {
      reasons.add("tone_drift");
    }

    if (
      ctx.dataGap === true ||
      (Array.isArray(ctx.dataGap) && ctx.dataGap.length > 0)
    ) {
      reasons.add("data_gap");
    }

    const risk = ctx.risk ?? undefined;
    const mode = ctx.mode ?? undefined;
    if ((typeof risk === "string" && risk.toUpperCase() === "RED") || mode === "hr") {
      reasons.add("risk_hr_red");
    }
  }

  const reasonsArr = Array.from(reasons);
  return {
    active: reasonsArr.length > 0,
    reasons: reasonsArr,
  };
}
