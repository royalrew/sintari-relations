import type { Thresholds } from "./aggregateStyle";

export const defaultThresholds: Thresholds = {
  tone_p95_max: 0.05,
  echo_p95_max: 0.05,
  parity_gap_p95_max: 0.02,
  honesty_rate_min: 0.1,
  repair_accept_min: 0.5,
  no_advice_required: 1,
  ctx_hit_rate_min: 0.35,
  ctx_conf_p95_min: 0.8,
  coach_ok_rate_min: 0.6,
  repair_completion_rate_min: 0.5,
  repair_completion_p95_max: 15 * 60 * 1000, // 15 min
  telemetry_24h_warn: 10_000,
  telemetry_24h_fail: 15_000,
  handoff_rate_min: 0.5,
  summary_opt_in_rate_min: 0.2,
  coach_goal_first_set_min: 0.5,
  oversight_warn_rate_max: 0.15,
  oversight_fail_max: 0,
  oversight_score_min: 0.9,
};

export function getDefaultThresholds(): Thresholds {
  return { ...defaultThresholds };
}

