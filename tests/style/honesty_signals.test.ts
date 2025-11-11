import { HonestyContext, shouldTriggerHonesty } from "@/lib/policy/honesty_signals";

describe("shouldTriggerHonesty", () => {
  it("returns inactive when no triggers present", () => {
    const ctx: HonestyContext = {
      memoryHitAt3: 1,
      confidence: 0.9,
      explainHasEvidence: true,
      expectedLocale: "sv",
      detectedLocale: "sv",
      toneDelta: 0.01,
      dataGap: false,
      risk: "SAFE",
      mode: "personal",
    };

    const result = shouldTriggerHonesty(ctx);
    expect(result.active).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it("collects multiple reasons when breaches occur", () => {
    const ctx: HonestyContext = {
      memoryHitAt3: 0.7,
      confidence: 0.4,
      explainHasEvidence: 0,
      expectedLocale: "sv",
      detectedLocale: "en",
      toneDelta: 0.08,
      dataGap: true,
      risk: "RED",
      mode: "personal",
    };

    const result = shouldTriggerHonesty(ctx);
    expect(result.active).toBe(true);
    expect(result.reasons.sort()).toEqual(
      [
        "memory_miss",
        "low_conf",
        "no_evidence",
        "lang_mismatch",
        "tone_drift",
        "data_gap",
        "risk_hr_red",
      ].sort(),
    );
  });

  it("uses custom tone threshold when provided", () => {
    const ctx: HonestyContext = {
      toneDelta: 0.03,
      toneDriftThreshold: 0.02,
    };

    expect(shouldTriggerHonesty(ctx)).toEqual({
      active: true,
      reasons: ["tone_drift"],
    });
  });

  it("normalizes boolean-like values for has evidence", () => {
    const result = shouldTriggerHonesty({ explainHasEvidence: "false" });
    expect(result.active).toBe(true);
    expect(result.reasons).toContain("no_evidence");
  });

  it("flags HR mode even when risk is SAFE", () => {
    const result = shouldTriggerHonesty({ mode: "hr", risk: "SAFE" });
    expect(result.active).toBe(true);
    expect(result.reasons).toEqual(["risk_hr_red"]);
  });
});
