import type { ExtractedSignals } from "./signals";

/**
 * Finalizes signals with automatic consistency rules
 * Ensures risk_count = risk_areas.length and net_score calculation are consistent
 */
export function finalizeSignals(rawSignals: ExtractedSignals): ExtractedSignals {
  // Rule A: risk_count = risk_areas.length (enforce consistency)
  const risk_count = rawSignals.risk_areas.length;
  
  // Standardized net_score calculation (enforce consistency)
  const net_score = rawSignals.pos_count - rawSignals.neg_count - risk_count;
  
  return {
    ...rawSignals,
    risk_count,
    net_score
  };
}

/**
 * Validates signal consistency
 */
export function validateSignals(signals: ExtractedSignals): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check risk_count consistency
  if (signals.risk_count !== signals.risk_areas.length) {
    errors.push(`risk_count (${signals.risk_count}) should equal risk_areas.length (${signals.risk_areas.length})`);
  }
  
  // Check net_score calculation
  const expectedNetScore = signals.pos_count - signals.neg_count - signals.risk_count;
  if (signals.net_score !== expectedNetScore) {
    errors.push(`net_score (${signals.net_score}) should equal pos_count - neg_count - risk_count (${expectedNetScore})`);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
