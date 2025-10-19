import { describe, test, expect } from "vitest";
import { extractSignals } from "../utils/signals";
import { finalizeSignals, validateSignals } from "../utils/metrics";
import { mapSafetyToStatus } from "../utils/safetyMapping";
import normalCase from "./golden_cases/normal.json" assert { type: "json" };
import dangerCase from "./golden_cases/danger.json" assert { type: "json" };

describe("Signal Analysis Golden Tests", () => {
  test("Normal case gets NORMAL + OK", () => {
    const rawSignals = extractSignals(normalCase.input.description);
    const signals = finalizeSignals(rawSignals);
    const overallStatus = mapSafetyToStatus(signals.safety_flag);
    
    expect(signals.risk_count).toBe(normalCase.expected.risk_count);
    expect(signals.risk_count).toBe(signals.risk_areas.length); // Rule A
    expect(signals.net_score).toBe(normalCase.expected.net_score);
    expect(signals.safety_flag).toBe(normalCase.expected.safety_flag);
    expect(overallStatus).toBe(normalCase.expected.overall_status);
    
    // Validate consistency
    const validation = validateSignals(signals);
    expect(validation.isValid).toBe(true);
  });

  test("Danger case gets DANGER + CRITICAL", () => {
    const rawSignals = extractSignals(dangerCase.input.description);
    const signals = finalizeSignals(rawSignals);
    const overallStatus = mapSafetyToStatus(signals.safety_flag);
    
    expect(signals.risk_count).toBeGreaterThanOrEqual(dangerCase.expected.risk_count);
    expect(signals.risk_count).toBe(signals.risk_areas.length); // Rule A
    expect(signals.net_score).toBeLessThanOrEqual(dangerCase.expected.net_score);
    expect(signals.safety_flag).toBe(dangerCase.expected.safety_flag);
    expect(overallStatus).toBe(dangerCase.expected.overall_status);
    
    // Validate consistency
    const validation = validateSignals(signals);
    expect(validation.isValid).toBe(true);
  });

  test("Risk count always equals risk areas length", () => {
    const testDescriptions = [
      "Vi älskar varandra",
      "Vi bråkar om pengar och kommunikation", 
      "Jag är rädd för våld och hot hemma"
    ];
    
    testDescriptions.forEach(description => {
      const rawSignals = extractSignals(description);
      const signals = finalizeSignals(rawSignals);
      
      expect(signals.risk_count).toBe(signals.risk_areas.length);
    });
  });

  test("Net score follows formula: pos - neg - risk", () => {
    const testDescriptions = [
      "Vi älskar varandra",
      "Vi bråkar ibland",
      "Jag är rädd och känner mig hotad"
    ];
    
    testDescriptions.forEach(description => {
      const rawSignals = extractSignals(description);
      const signals = finalizeSignals(rawSignals);
      
      const expectedNetScore = signals.pos_count - signals.neg_count - signals.risk_count;
      expect(signals.net_score).toBe(expectedNetScore);
    });
  });
});
