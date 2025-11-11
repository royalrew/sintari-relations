import React from "react";
import { MetricCard } from "./MetricCard";
import type { AdminAgg, Thresholds } from "@/lib/metrics/aggregateStyle";
import { defaultThresholds } from "@/lib/metrics/thresholds";
import { COUPLES_ROOM_ENABLED } from "@/lib/copilot/env";

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const fix3 = (value: number) => value.toFixed(3);
const near = (value: number, limit: number, type: "max" | "min") => {
  const margin = 0.1;
  if (type === "max") return value > limit * (1 - margin) && value <= limit;
  return value < limit * (1 + margin) && value >= limit;
};

const formatDuration = (ms?: number | null) => {
  if (!ms || !Number.isFinite(ms)) return "–";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
};

type DashboardPanelsProps = {
  agg?: AdminAgg;
  thresholds?: Partial<Thresholds>;
  loading?: boolean;
};

export function DashboardPanels({ agg, thresholds, loading }: DashboardPanelsProps) {
  if (loading && !agg) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    );
  }

  if (!agg) {
    return <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">Ingen telemetri hittades för valt fönster.</div>;
  }

  const t: Thresholds = { ...defaultThresholds, ...thresholds };

  const styleItems = [
    {
      label: "p95 tone drift",
      value: fix3(agg.style.p95_tone_delta),
      hint: `≤ ${fix3(t.tone_p95_max)}`,
      warn: near(agg.style.p95_tone_delta, t.tone_p95_max, "max"),
      fail: agg.style.p95_tone_delta > t.tone_p95_max,
    },
    {
      label: "p95 echo ratio",
      value: fix3(agg.style.p95_echo_ratio),
      hint: `≤ ${fix3(t.echo_p95_max)}`,
      warn: near(agg.style.p95_echo_ratio, t.echo_p95_max, "max"),
      fail: agg.style.p95_echo_ratio > t.echo_p95_max,
    },
    {
      label: "p95 parity like gap",
      value: fix3(agg.style.parity_like_gap_p95),
      hint: `≤ ${fix3(t.parity_gap_p95_max)}`,
      warn: near(agg.style.parity_like_gap_p95, t.parity_gap_p95_max, "max"),
      fail: agg.style.parity_like_gap_p95 > t.parity_gap_p95_max,
    },
  ];

  const honestyItems = [
    {
      label: "Honesty rate",
      value: pct(agg.honesty.rate),
      hint: `≥ ${pct(t.honesty_rate_min)}`,
      warn: near(agg.honesty.rate, t.honesty_rate_min, "min"),
      fail: agg.honesty.rate < t.honesty_rate_min,
    },
    {
      label: "Repair accept",
      value: pct(agg.honesty.repair_accept_rate),
      hint: `≥ ${pct(t.repair_accept_min)}`,
      warn: near(agg.honesty.repair_accept_rate, t.repair_accept_min, "min"),
      fail: agg.honesty.repair_accept_rate < t.repair_accept_min,
    },
    {
      label: "No-advice när ärlig",
      value: agg.honesty.no_advice_when_honest ? "OK" : "FAIL",
      hint: "Måste vara 1",
      warn: false,
      fail: agg.honesty.no_advice_when_honest !== 1,
    },
  ];

  const oversightItems = agg.oversight
    ? [
        {
          label: "Avg score",
          value: fix3(agg.oversight.avg_score),
          hint: `≥ ${fix3(t.oversight_score_min ?? 0.9)}`,
          warn: agg.oversight.avg_score < (t.oversight_score_min ?? 0.9),
          fail: agg.oversight.avg_score < (t.oversight_score_min ?? 0.9) - 0.05,
        },
        {
          label: "Warn-rate",
          value: pct(agg.oversight.warn_rate),
          hint: `≤ ${pct(t.oversight_warn_rate_max ?? 0.15)}`,
          warn: agg.oversight.warn_rate > (t.oversight_warn_rate_max ?? 0.15),
          fail: agg.oversight.warn_rate > (t.oversight_warn_rate_max ?? 0.15) * 1.2,
        },
        {
          label: "Fail-count",
          value: String(agg.oversight.fail),
          hint: `≤ ${t.oversight_fail_max ?? 0}`,
          warn: agg.oversight.fail > 0 && agg.oversight.fail <= (t.oversight_fail_max ?? 0),
          fail: agg.oversight.fail > (t.oversight_fail_max ?? 0),
        },
        {
          label: "Totalt granskade",
          value: String(agg.oversight.total),
          hint:
            agg.oversight.issues && Object.keys(agg.oversight.issues).length > 0
              ? Object.entries(agg.oversight.issues)
                  .slice(0, 2)
                  .map(([code, meta]) => `${code}:${meta.count}`)
                  .join(" • ")
              : "–",
          warn: false,
          fail: false,
        },
      ]
    : undefined;

  const canaryItems = [
    {
      label: "Breaches (15 min)",
      value: String(agg.canary.breaches_15m),
      warn: false,
      fail: agg.canary.breaches_15m > 0,
    },
    {
      label: "Breaches (24 h)",
      value: String(agg.canary.breaches_24h),
      warn: false,
      fail: agg.canary.breaches_24h > 0,
    },
    {
      label: "Backoff",
      value: agg.canary.backoff_active ? "ON" : "OFF",
      warn: false,
      fail: agg.canary.backoff_active === 1,
    },
  ];

  const subjectCtxItems = [
    {
      label: "Subject-CTX hit-rate",
      value: pct(agg.ctx_hit_rate ?? 0),
      hint: `≥ ${pct(t.ctx_hit_rate_min)}`,
      warn: agg.ctx_hit_rate < t.ctx_hit_rate_min,
      fail: agg.ctx_hit_rate < t.ctx_hit_rate_min,
    },
    {
      label: "CTX p95 confidence",
      value: agg.ctx_conf_p95 != null ? pct(agg.ctx_conf_p95) : "–",
      hint: `≥ ${pct(t.ctx_conf_p95_min)}`,
      warn: agg.ctx_conf_p95 != null && agg.ctx_conf_p95 < t.ctx_conf_p95_min,
      fail: agg.ctx_conf_p95 != null && agg.ctx_conf_p95 < t.ctx_conf_p95_min,
    },
  ];

  const goalsItems = [
    {
      label: "Mål skapade (24h)",
      value: String(agg.goals.created ?? 0),
      hint: "Antal nya mål i fönstret",
      warn: false,
      fail: false,
    },
    {
      label: "Mål progress p95",
      value: pct(agg.goals.progress_p95 ?? 0),
      hint: "Progress delta p95",
      warn: false,
      fail: false,
    },
    {
      label: "Coach OK-rate",
      value: pct(agg.goals.coach_ok_rate ?? 0),
      hint: `≥ ${pct(t.coach_ok_rate_min)}`,
      warn: agg.goals.coach_ok_rate < t.coach_ok_rate_min,
      fail: agg.goals.coach_ok_rate < t.coach_ok_rate_min,
    },
  ];

  const receptionItems = agg.reception
    ? [
        {
          label: "Handoff-rate",
          value: pct(agg.reception.handoff_rate),
          hint: `≥ ${pct(t.handoff_rate_min ?? 0.5)}`,
          warn: near(agg.reception.handoff_rate, t.handoff_rate_min ?? 0.5, "min"),
          fail: agg.reception.handoff_rate < (t.handoff_rate_min ?? 0.5),
        },
        {
          label: "Summary opt-in",
          value: pct(agg.reception.summary_opt_in_rate),
          hint: `≥ ${pct(t.summary_opt_in_rate_min ?? 0.2)}`,
          warn: near(
            agg.reception.summary_opt_in_rate,
            t.summary_opt_in_rate_min ?? 0.2,
            "min",
          ),
          fail: agg.reception.summary_opt_in_rate < (t.summary_opt_in_rate_min ?? 0.2),
        },
        {
          label: "Honesty prompt-rate",
          value: pct(agg.reception.honesty_prompt_rate),
          hint: "Andel intake med honesty-chip",
          warn: false,
          fail: false,
        },
        {
          label: "Repair completion p50",
          value: formatDuration(agg.reception.repair_completion_p50),
          hint: "Median tid (chip → fakta)",
          warn: false,
          fail: false,
        },
        {
          label: "Repair completion p95",
          value: formatDuration(agg.reception.repair_completion_p95),
          hint: "p95 tid (chip → fakta)",
          warn: false,
          fail: false,
        },
      ]
    : undefined;

  const coachItems = agg.coach
    ? [
        {
          label: "Goal first-set rate",
          value: pct(agg.coach.goal_first_set_rate),
          hint: `≥ ${pct(t.coach_goal_first_set_min ?? 0.5)}`,
          warn: near(
            agg.coach.goal_first_set_rate,
            t.coach_goal_first_set_min ?? 0.5,
            "min",
          ),
          fail: agg.coach.goal_first_set_rate < (t.coach_goal_first_set_min ?? 0.5),
        },
        {
          label: "Goal progress p50",
          value: pct(agg.coach.goal_progress_p50),
          hint: "Median målprogress (delar)",
          warn: false,
          fail: false,
        },
        {
          label: "Coach ctx hit-rate",
          value: pct(agg.coach.ctx_hit_rate),
          hint: "Coachens subject ctx-hit",
          warn: false,
          fail: false,
        },
      ]
    : undefined;

  const couplesItems =
    agg.couples && (agg.couples.handoff_rate != null || agg.couples.repair_accept_rate != null)
      ? [
          {
            label: "Couple handoff-rate",
            value:
              agg.couples.handoff_rate != null
                ? pct(agg.couples.handoff_rate)
                : "flag off",
            hint: "Andel som slussas till par-rum",
            warn: false,
            fail: false,
          },
          {
            label: "Conflict repair accept",
            value:
              agg.couples.repair_accept_rate != null
                ? pct(agg.couples.repair_accept_rate)
                : "flag off",
            hint: "Andel par som startar repair",
            warn: false,
            fail: false,
          },
        ]
      : undefined;

  const repairItems = [
    {
      label: "Repair prompt-rate",
      value: pct(agg.repair.prompt_rate ?? 0),
      hint: "Andel svar med chip",
      warn: false,
      fail: false,
    },
    {
      label: "Repair completion-rate",
      value: pct(agg.repair.completion_rate ?? 0),
      hint: `≥ ${pct(t.repair_completion_rate_min)}`,
      warn: agg.repair.completion_rate < t.repair_completion_rate_min,
      fail: agg.repair.completion_rate < t.repair_completion_rate_min,
    },
    {
      label: "Completion median",
      value: formatDuration(agg.repair.completion_p50),
      hint: "p50 tid från chip till fakta",
      warn: false,
      fail: false,
    },
    {
      label: "Completion p95",
      value: formatDuration(agg.repair.completion_p95),
      hint: `≤ ${formatDuration(t.repair_completion_p95_max)}`,
      warn: agg.repair.completion_p95 > t.repair_completion_p95_max,
      fail: agg.repair.completion_p95 > t.repair_completion_p95_max,
    },
  ];

  const showTelemetryCard = process.env.NEXT_PUBLIC_ADMIN_SHOW_TELEMETRY_CARD !== "0";

  const telemetryItems =
    showTelemetryCard && typeof agg.telemetry_total_24h === "number"
      ? (() => {
          const top = agg.telemetry_top_events ?? {};
          const rates = agg.telemetry_event_rates ?? {};
          const spikes = agg.telemetry_spikes ?? {};
          const formatRate = (value?: number) =>
            value != null && Number.isFinite(value) ? `${(value * 60).toFixed(2)}/h` : "–";

          const totalItem = {
            label: "Totalt (24h)",
            value: String(agg.telemetry_total_24h),
            hint: Object.entries(top)
              .slice(0, 3)
              .map(([key, value]) => `${key}:${value}`)
              .join(" • "),
            warn:
              t.telemetry_24h_warn != null &&
              agg.telemetry_total_24h >= t.telemetry_24h_warn &&
              (t.telemetry_24h_fail == null || agg.telemetry_total_24h < t.telemetry_24h_fail),
            fail:
              t.telemetry_24h_fail != null && agg.telemetry_total_24h >= t.telemetry_24h_fail,
          };

          const eventItems = Object.entries(top)
            .slice(0, 4)
            .map(([event, count]) => {
              const rate = rates[event];
              const spike = spikes[event] ?? "ok";
              return {
                label: event,
                value: `${count}`,
                hint: `≈ ${formatRate(rate)}`,
                warn: spike === "warn",
                fail: spike === "fail",
              };
            });

          return [totalItem, ...eventItems];
        })()
      : undefined;

  return (
    <div className="grid grid-cols-1 gap-4">
      <MetricCard title="Style & Parity" items={styleItems} />
      <MetricCard title="Honesty" items={honestyItems} />
      {oversightItems && <MetricCard title="Oversight" items={oversightItems} />}
      <MetricCard title="Canary" items={canaryItems} />
      <MetricCard title="Subject Context" items={subjectCtxItems} />
      <MetricCard title="Mål" items={goalsItems} />
      <MetricCard title="Honesty Repair" items={repairItems} />
      {receptionItems && <MetricCard title="Reception" items={receptionItems} />}
      {coachItems && <MetricCard title="Coach" items={coachItems} />}
      {COUPLES_ROOM_ENABLED && couplesItems && (
        <MetricCard title="Par-rum" items={couplesItems} />
      )}
      {telemetryItems && showTelemetryCard && <MetricCard title="Telemetry Budget" items={telemetryItems} />}
    </div>
  );
}
