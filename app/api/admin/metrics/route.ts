import fs from "fs";
import { NextResponse } from "next/server";
import { aggregate, evaluate } from "@/lib/metrics/aggregateStyle";
import { readNormJsonl } from "@/lib/metrics/readNormJsonl";
import { getDefaultThresholds } from "@/lib/metrics/thresholds";

type BudgetSummary = {
  total: number;
  summary: Record<string, number>;
  event_rates?: Record<string, number>;
  hours?: number;
  days?: number;
};

const MAX_HOURS = 168;
const MIN_HOURS = 1;

export const dynamic = "force-dynamic";

function computeBudgetFromRows(rows: any[], hours = 24): BudgetSummary {
  const since = Date.now() - hours * 3_600_000;
  let total = 0;
  const map = new Map<string, number>();

  for (const row of rows) {
    const ts =
      typeof row.ts === "number"
        ? row.ts
        : typeof row.ts === "string"
        ? Date.parse(row.ts)
        : Number.isFinite(row.ts)
        ? Number(row.ts)
        : 0;
    if (!Number.isFinite(ts) || ts < since) continue;
    const event =
      row.event ??
      row?.kpi?.event ??
      row?.repair?.event ??
      row?.honesty?.event ??
      "unknown";
    total += 1;
    map.set(event, (map.get(event) ?? 0) + 1);
  }

  const summary = Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1]));
  return {
    total,
    summary,
    event_rates: computeRates(summary, hours),
    hours,
  };
}

function computeRates(summary: Record<string, number>, hours: number): Record<string, number> {
  const minutes = Math.max(hours * 60, 1);
  const rates: Record<string, number> = {};
  for (const [event, count] of Object.entries(summary)) {
    if (typeof count === "number" && Number.isFinite(count)) {
      rates[event] = count / minutes;
    }
  }
  return rates;
}

function detectSpikes(
  current: Record<string, number>,
  baseline: Record<string, number>,
): Record<string, "ok" | "warn" | "fail"> {
  const spikes: Record<string, "ok" | "warn" | "fail"> = {};
  const MIN_BASELINE = 1 / (24 * 60); // ≈0.0007 events/min (~1 per day)
  const MIN_SPIKE_RATE = 1 / 60; // 1 per hour

  for (const [event, rate] of Object.entries(current)) {
    const base = baseline[event] ?? 0;
    let level: "ok" | "warn" | "fail" = "ok";

    if (base <= MIN_BASELINE) {
      if (rate > MIN_SPIKE_RATE * 2) level = "fail";
      else if (rate > MIN_SPIKE_RATE) level = "warn";
    } else {
      const ratio = rate / base;
      if (ratio >= 2.5) level = "fail";
      else if (ratio >= 1.6) level = "warn";
    }

    spikes[event] = level;
  }

  return spikes;
}

function readBudgetFromFile(): BudgetSummary | null {
  try {
    const raw = fs.readFileSync("reports/telemetry_budget_summary.json", "utf8");
    const json = JSON.parse(raw);
    if (typeof json.total === "number" && json.summary && typeof json.summary === "object") {
      const summary = Object.fromEntries(
        Object.entries(json.summary).filter(([, value]) => typeof value === "number"),
      ) as Record<string, number>;
      const hours =
        typeof json.hours === "number" && Number.isFinite(json.hours)
          ? json.hours
          : typeof json.days === "number" && Number.isFinite(json.days)
          ? json.days * 24
          : undefined;
      const eventRates =
        json.event_rates && typeof json.event_rates === "object"
          ? Object.fromEntries(
              Object.entries(json.event_rates).filter(([, value]) => typeof value === "number"),
            )
          : undefined;
      return { total: json.total, summary, event_rates: eventRates, hours };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const hoursParam = Number(url.searchParams.get("hours") ?? "24");
  const safeHours = Number.isFinite(hoursParam)
    ? Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.floor(hoursParam)))
    : 24;

  const allRows = await readNormJsonl();
  const cutoff = Date.now() - safeHours * 3_600_000;
  const rows = allRows.filter((row) => {
    if (!row.ts) return false;
    const ts = Date.parse(row.ts);
    if (Number.isNaN(ts)) return false;
    return ts >= cutoff;
  });

  const agg = aggregate(rows);
  const thresholds = getDefaultThresholds();

  const budgetWindow = Math.min(24, safeHours);
  const budget = computeBudgetFromRows(rows, budgetWindow);
  const baseline = readBudgetFromFile();
  const telemetry_total_24h = budget.total || baseline?.total || 0;
  const telemetry_top_events =
    budget.total > 0 ? budget.summary : baseline?.summary ?? {};
  const currentRates =
    budget.total > 0
      ? budget.event_rates ?? computeRates(budget.summary, budget.hours ?? budgetWindow)
      : {};
  const baselineRates = baseline
    ? baseline.event_rates ??
      computeRates(baseline.summary, baseline.hours && baseline.hours > 0 ? baseline.hours : 24)
    : {};
  const telemetry_spikes =
    budget.total > 0 ? detectSpikes(currentRates, baselineRates) : {};

  const evaluation = evaluate(
    {
      ...agg,
      telemetry_total_24h,
      telemetry_top_events,
      telemetry_event_rates: currentRates,
      telemetry_spikes,
    } as any,
    thresholds,
  );
  const level =
    evaluation.fail.length > 0 ? "fail" : evaluation.warn.length > 0 ? "warn" : "ok";

  return NextResponse.json({
    hours: safeHours,
    agg: {
      ...agg,
      telemetry_total_24h,
      telemetry_top_events,
      telemetry_event_rates: currentRates,
      telemetry_spikes,
    },
    thresholds,
    status: {
      level,
      warn: evaluation.warn,
      fail: evaluation.fail,
    },
    updatedAt: new Date().toISOString(),
  });
}

