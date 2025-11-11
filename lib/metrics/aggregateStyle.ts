import fs from "fs";
import type { NormRow } from "./readNormJsonl";

const P95 = (arr: number[]) => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(0.95 * (sorted.length - 1)));
  return sorted[idx];
};

const P50 = (arr: number[]) => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(0.5 * (sorted.length - 1));
  return sorted[idx];
};

const sum = (arr: number[]) => arr.reduce((acc, value) => acc + value, 0);

const ratio = (num: number, den: number) => {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
  return num / den;
};

export type AdminAgg = {
  style: { p95_tone_delta: number; p95_echo_ratio: number; parity_like_gap_p95: number };
  honesty: { rate: number; repair_accept_rate: number; no_advice_when_honest: 0 | 1 };
  canary: { breaches_15m: number; breaches_24h: number; backoff_active: 0 | 1 };
  ctx_hit_rate: number;
  ctx_conf_p95: number | null;
  goals: {
    created: number;
    updated: number;
    progress_p50: number;
    progress_p95: number;
    coach_ok_rate: number;
  };
  repair: {
    prompt_rate: number;
    completion_rate: number;
    completion_p50: number;
    completion_p95: number;
  };
  telemetry_total_24h?: number;
  telemetry_top_events?: Record<string, number>;
  telemetry_event_rates?: Record<string, number>;
  telemetry_spikes?: Record<string, "ok" | "warn" | "fail">;
  reception?: {
    handoff_rate: number;
    summary_opt_in_rate: number;
    honesty_prompt_rate: number;
    repair_completion_p50: number;
    repair_completion_p95: number;
  };
  coach?: {
    goal_first_set_rate: number;
    goal_progress_p50: number;
    ctx_hit_rate: number;
  };
  couples?: {
    handoff_rate?: number;
    repair_accept_rate?: number;
  };
  oversight?: {
    total: number;
    warn: number;
    fail: number;
    avg_score: number;
    warn_rate: number;
    fail_rate: number;
    last_run?: string;
    issues?: Record<
      string,
      {
        count: number;
        severity: "warn" | "fail";
      }
    >;
  };
};

export function aggregate(rows: NormRow[]): AdminAgg {
  const styleRowCount = rows.filter((row) => row.style != null).length;
  const tone = rows
    .map((row) => row.style?.tone_delta ?? 0)
    .filter((value): value is number => Number.isFinite(value));
  const echo = rows
    .map((row) => row.style?.echo_ratio ?? 0)
    .filter((value): value is number => Number.isFinite(value));

  const detectedLocale = (row: NormRow) => row.lang?.detected ?? row.lang?.expected;
  const sv = rows
    .filter((row) => detectedLocale(row) === "sv")
    .map((row) => row.style?.likability_proxy ?? 0)
    .filter((value): value is number => Number.isFinite(value));
  const en = rows
    .filter((row) => detectedLocale(row) === "en")
    .map((row) => row.style?.likability_proxy ?? 0)
    .filter((value): value is number => Number.isFinite(value));
  const parity_like_gap_p95 = Math.abs(P95(sv) - P95(en));

  const honestRows = rows.filter((row) => (row.honesty?.active ?? 0) === 1 || row.honesty?.active === true);
  const rate = rows.length ? honestRows.length / rows.length : 0;
  const repair_accept_rate = honestRows.length
    ? honestRows.reduce((sum, row) => sum + ((row.honesty?.repair_accepted === true || row.honesty?.repair_accepted === 1) ? 1 : 0), 0) / honestRows.length
    : 0;
  const no_advice_when_honest = honestRows.every((row) => row.honesty?.no_advice === true || row.honesty?.no_advice === 1) ? 1 : 0;

  const ctxHits = rows.filter((row) => row.subject_ctx?.hit).length;
  const ctxConfVals = rows
    .map((row) => row.subject_ctx?.confidence)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const goalsCreated = sum(
    rows.map((row) => {
      const value = row.goals?.created;
      return typeof value === "number" && Number.isFinite(value) ? value : 0;
    }),
  );
  const goalsUpdated = sum(
    rows.map((row) => {
      const value = row.goals?.updated;
      return typeof value === "number" && Number.isFinite(value) ? value : 0;
    }),
  );
  const progressDeltas = rows
    .map((row) => row.goals?.progress_delta)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const coachOkTotal = sum(
    rows.map((row) => {
      const value = row.goals?.coach_ok;
      return typeof value === "number" && Number.isFinite(value) ? value : 0;
    }),
  );
  const coachBlockTotal = sum(
    rows.map((row) => {
      const value = row.goals?.coach_block;
      return typeof value === "number" && Number.isFinite(value) ? value : 0;
    }),
  );

  const repairShown = rows.reduce((acc, row) => acc + (typeof row.repair?.prompt_shown === "number" ? row.repair?.prompt_shown : 0), 0);
  const repairCompleted = rows.reduce((acc, row) => acc + (typeof row.repair?.completed === "number" ? row.repair?.completed : 0), 0);
  const repairDurations = rows
    .map((row) => row.repair?.time_to_complete_ms)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const receptionRows = rows.filter((row) => row.reception != null);
  const receptionHandoffs = receptionRows.reduce((acc, row) => acc + (row.reception?.handoff ?? 0), 0);
  const receptionSummaryOptIn = receptionRows.reduce(
    (acc, row) => acc + (row.reception?.summary_opt_in ?? 0),
    0,
  );
  const receptionHonestyPrompt = receptionRows.reduce(
    (acc, row) => acc + (row.reception?.honesty_prompt ?? 0),
    0,
  );
  const receptionRepairDurations = receptionRows
    .map((row) => row.reception?.repair_completion_ms)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const coachRows = rows.filter((row) => row.coach != null);
  const coachGoalFirstSet = coachRows.reduce((acc, row) => acc + (row.coach?.goal_first_set ?? 0), 0);
  const coachGoalStarts = coachRows.reduce(
    (acc, row) => acc + (row.coach?.goal_session_start ?? 0),
    0,
  );
  const coachGoalProgress = coachRows
    .map((row) => row.coach?.goal_progress ?? 0)
    .filter((value): value is number => Number.isFinite(value));
  const coachCtxHits = coachRows.reduce((acc, row) => acc + (row.coach?.ctx_hit ?? 0), 0);

  const coupleRows = rows.filter((row) => row.couples != null);
  const coupleHandoffs = coupleRows.reduce((acc, row) => acc + (row.couples?.handoff ?? 0), 0);
  const coupleRepairAccepts = coupleRows.reduce(
    (acc, row) => acc + (row.couples?.repair_accept ?? 0),
    0,
  );

  let telemetryTotal: number | undefined;
  let telemetryTop: Record<string, number> | undefined;
  let telemetryRates: Record<string, number> | undefined;
  let telemetrySpikes: Record<string, "ok" | "warn" | "fail"> | undefined;
  let oversight:
    | {
        total: number;
        warn: number;
        fail: number;
        avg_score: number;
        warn_rate: number;
        fail_rate: number;
        last_run?: string;
        issues?: Record<string, { count: number; severity: "warn" | "fail" }>;
      }
    | undefined;

  try {
    const raw = fs.readFileSync("reports/telemetry_budget_summary.json", "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.total === "number") telemetryTotal = parsed.total;
    if (parsed.summary && typeof parsed.summary === "object") {
      telemetryTop = Object.fromEntries(
        Object.entries(parsed.summary).filter(([, value]) => typeof value === "number"),
      ) as Record<string, number>;
    }
    if (parsed.event_rates && typeof parsed.event_rates === "object") {
      telemetryRates = Object.fromEntries(
        Object.entries(parsed.event_rates).filter(([, value]) => typeof value === "number"),
      ) as Record<string, number>;
    } else if (telemetryTop) {
      const windowHours =
        typeof parsed.hours === "number" && Number.isFinite(parsed.hours) && parsed.hours > 0
          ? parsed.hours
          : typeof parsed.days === "number" && Number.isFinite(parsed.days) && parsed.days > 0
          ? parsed.days * 24
          : 24;
      const minutes = Math.max(windowHours * 60, 1);
      telemetryRates = Object.fromEntries(
        Object.entries(telemetryTop).map(([event, count]) => [event, count / minutes]),
      );
    }
  } catch {
    // ignore missing summary
  }

  try {
    const raw = fs.readFileSync("reports/oversight_summary.json", "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.total === "number" && parsed.total >= 0) {
      oversight = {
        total: parsed.total,
        warn: typeof parsed.warn === "number" ? parsed.warn : 0,
        fail: typeof parsed.fail === "number" ? parsed.fail : 0,
        avg_score: typeof parsed.avgScore === "number" ? parsed.avgScore : 0,
        warn_rate:
          typeof parsed.total === "number" && parsed.total > 0
            ? (typeof parsed.warn === "number" ? parsed.warn : 0) / parsed.total
            : 0,
        fail_rate:
          typeof parsed.total === "number" && parsed.total > 0
            ? (typeof parsed.fail === "number" ? parsed.fail : 0) / parsed.total
            : 0,
        last_run: typeof parsed.generated_at === "string" ? parsed.generated_at : undefined,
        issues:
          parsed.issues && typeof parsed.issues === "object"
            ? Object.fromEntries(
                Object.entries(parsed.issues).map(([key, value]) => [
                  key,
                  {
                    count: typeof (value as any)?.count === "number" ? (value as any).count : 0,
                    severity:
                      (value as any)?.severity === "fail" || (value as any)?.severity === "warn"
                        ? (value as any).severity
                        : "warn",
                  },
                ]),
              )
            : undefined,
      };
    }
  } catch {
    // ignore if summary missing
  }

  return {
    style: {
      p95_tone_delta: P95(tone),
      p95_echo_ratio: P95(echo),
      parity_like_gap_p95,
    },
    honesty: {
      rate,
      repair_accept_rate,
      no_advice_when_honest,
    },
    canary: {
      breaches_15m: 0,
      breaches_24h: 0,
      backoff_active: 0,
    },
    ctx_hit_rate: rows.length ? ctxHits / rows.length : 0,
    ctx_conf_p95: ctxConfVals.length ? P95(ctxConfVals) : null,
    goals: {
      created: goalsCreated,
      updated: goalsUpdated,
      progress_p50: P50(progressDeltas),
      progress_p95: P95(progressDeltas),
      coach_ok_rate: ratio(coachOkTotal, coachOkTotal + coachBlockTotal),
    },
    repair: {
      prompt_rate: styleRowCount ? repairShown / styleRowCount : 0,
      completion_rate: repairShown ? repairCompleted / repairShown : 0,
      completion_p50: P50(repairDurations),
      completion_p95: P95(repairDurations),
    },
    telemetry_total_24h: telemetryTotal,
    telemetry_top_events: telemetryTop,
    telemetry_event_rates: telemetryRates,
    telemetry_spikes: telemetrySpikes,
    reception: {
      handoff_rate: receptionRows.length ? receptionHandoffs / receptionRows.length : 0,
      summary_opt_in_rate: receptionRows.length ? receptionSummaryOptIn / receptionRows.length : 0,
      honesty_prompt_rate: receptionRows.length ? receptionHonestyPrompt / receptionRows.length : 0,
      repair_completion_p50: P50(receptionRepairDurations),
      repair_completion_p95: P95(receptionRepairDurations),
    },
    coach: {
      goal_first_set_rate: coachGoalStarts ? coachGoalFirstSet / coachGoalStarts : 0,
      goal_progress_p50: P50(coachGoalProgress),
      ctx_hit_rate: coachRows.length ? coachCtxHits / coachRows.length : 0,
    },
    couples: {
      handoff_rate: coupleRows.length ? coupleHandoffs / coupleRows.length : undefined,
      repair_accept_rate: coupleRows.length ? coupleRepairAccepts / coupleRows.length : undefined,
    },
    oversight,
  };
}

export type Thresholds = {
  tone_p95_max: number;
  echo_p95_max: number;
  parity_gap_p95_max: number;
  honesty_rate_min: number;
  repair_accept_min: number;
  no_advice_required: 0 | 1;
  ctx_hit_rate_min: number;
  ctx_conf_p95_min: number;
  coach_ok_rate_min: number;
  repair_completion_rate_min: number;
  repair_completion_p95_max: number;
  telemetry_24h_warn?: number;
  telemetry_24h_fail?: number;
  handoff_rate_min?: number;
  summary_opt_in_rate_min?: number;
  coach_goal_first_set_min?: number;
  oversight_warn_rate_max?: number;
  oversight_fail_max?: number;
  oversight_score_min?: number;
};

export function evaluate(agg: AdminAgg, t: Thresholds) {
  const warn: string[] = [];
  const fail: string[] = [];

  const near = (value: number, limit: number, type: "max" | "min") => {
    const margin = 0.10;
    if (type === "max") return value > limit * (1 - margin);
    return value < limit * (1 + margin);
  };

  if (agg.style.p95_tone_delta > t.tone_p95_max) fail.push("tone_p95");
  else if (near(agg.style.p95_tone_delta, t.tone_p95_max, "max")) warn.push("tone_p95");

  if (agg.style.p95_echo_ratio > t.echo_p95_max) fail.push("echo_p95");
  else if (near(agg.style.p95_echo_ratio, t.echo_p95_max, "max")) warn.push("echo_p95");

  if (agg.style.parity_like_gap_p95 > t.parity_gap_p95_max) fail.push("parity_p95");
  else if (near(agg.style.parity_like_gap_p95, t.parity_gap_p95_max, "max")) warn.push("parity_p95");

  if (agg.honesty.rate < t.honesty_rate_min) fail.push("honesty_rate");
  else if (near(agg.honesty.rate, t.honesty_rate_min, "min")) warn.push("honesty_rate");

  if (agg.honesty.repair_accept_rate < t.repair_accept_min) fail.push("repair_accept");
  else if (near(agg.honesty.repair_accept_rate, t.repair_accept_min, "min")) warn.push("repair_accept");

  if (t.no_advice_required === 1 && agg.honesty.no_advice_when_honest !== 1) fail.push("no_advice_when_honest");

  if (agg.ctx_hit_rate < t.ctx_hit_rate_min) warn.push("subject_ctx_hit_rate");
  if (agg.ctx_conf_p95 !== null && agg.ctx_conf_p95 < t.ctx_conf_p95_min) warn.push("subject_ctx_confidence");
  if (agg.goals.coach_ok_rate < t.coach_ok_rate_min) warn.push("coach_ok_rate");
  if (agg.repair.completion_rate < t.repair_completion_rate_min) warn.push("repair_completion_rate");
  if (agg.repair.completion_p95 > t.repair_completion_p95_max) warn.push("repair_completion_time");

  if (agg.reception) {
    const handoffMin = t.handoff_rate_min ?? 0.5;
    if (agg.reception.handoff_rate < handoffMin) warn.push("reception_handoff_rate");
    const summaryMin = t.summary_opt_in_rate_min ?? 0.2;
    if (agg.reception.summary_opt_in_rate < summaryMin) warn.push("reception_summary_opt_in_rate");
  }

  if (agg.coach) {
    const goalFirstMin = t.coach_goal_first_set_min ?? 0.5;
    if (agg.coach.goal_first_set_rate < goalFirstMin) warn.push("coach_goal_first_set_rate");
  }

  if (agg.oversight) {
    const failTolerance = t.oversight_fail_max ?? 0;
    if (agg.oversight.fail > failTolerance) {
      fail.push("oversight_fail");
    } else if (agg.oversight.fail > 0) {
      warn.push("oversight_fail");
    }

    const warnRateMax = t.oversight_warn_rate_max ?? 0.15;
    if (agg.oversight.warn_rate > warnRateMax) {
      warn.push("oversight_warn_rate");
    }

    const minScore = t.oversight_score_min ?? 0.9;
    if (agg.oversight.avg_score < minScore) {
      warn.push("oversight_score");
    }
  }

  return { warn, fail };
}
