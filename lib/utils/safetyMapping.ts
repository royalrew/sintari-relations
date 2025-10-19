import type { SafetyFlag, OverallStatus } from "./telemetry";

/**
 * Maps safety flags to overall status according to our consistent rules
 */
export function mapSafetyToStatus(flag: SafetyFlag): OverallStatus {
  const map: Record<SafetyFlag, OverallStatus> = {
    NORMAL: "OK",
    CAUTION: "WARNING", 
    RISK: "WARNING",
    DANGER: "CRITICAL"
  };
  return map[flag] || "OK";
}

/**
 * Validates that safety flag mapping is consistent
 */
export function validateSafetyMapping(): boolean {
  const testCases: Array<[SafetyFlag, OverallStatus]> = [
    ["NORMAL", "OK"],
    ["CAUTION", "WARNING"],
    ["RISK", "WARNING"], 
    ["DANGER", "CRITICAL"]
  ];
  
  return testCases.every(([flag, expected]) => 
    mapSafetyToStatus(flag) === expected
  );
}
