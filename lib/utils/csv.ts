import type { AnalysisReportV2 } from "../schemas/analysisReportSchema";

export const CSV_HEADER = [
  "timestamp",
  "person1", 
  "person2",
  "description",
  "safety_flag",
  "recommendation", 
  "pos_count",
  "neg_count",
  "risk_count",
  "repair_signals",
  "warmth",
  "net_score",
  "has_apology",
  "has_plan",
  "risk_areas",
  "reflections",
  "description_length",
  "time_in_day_seconds",
  "analysis_mode",
  "confidence"
] as const;

/**
 * Safely escapes CSV values
 */
export function csvEscape(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Formats arrays as JSON strings for CSV
 */
export function jsonArray(value: string[]): string {
  return csvEscape(JSON.stringify(value));
}

/**
 * Converts AnalysisReportV2 to CSV row
 */
export function toCsvRow(data: AnalysisReportV2): string {
  const s = data.analysis.signals;
  
  return [
    data.timestamp,
    csvEscape(data.input.person1),
    csvEscape(data.input.person2),
    csvEscape(data.input.description),
    s.safety_flag,
    csvEscape(data.analysis.recommendation),
    s.pos_count,
    s.neg_count,
    s.risk_count,
    s.repair_signals,
    s.warmth,
    s.net_score,
    s.has_apology,
    s.has_plan,
    jsonArray(s.risk_areas),
    jsonArray(data.analysis.reflections),
    data.input.description_length,
    data.metrics.time_in_day_seconds,
    data.metadata.analysis_mode,
    data.metadata.confidence ?? ""
  ].join(",");
}

/**
 * Creates CSV header row
 */
export function createCsvHeader(): string {
  return CSV_HEADER.join(",");
}
