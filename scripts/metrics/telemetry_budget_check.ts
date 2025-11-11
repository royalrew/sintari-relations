#!/usr/bin/env tsx

import fs from "fs";
import readline from "readline";

type Row = { ts?: number; event?: string; kpi?: any };

function getArg(name: string, def: number) {
  const i = process.argv.findIndex((a) => a === `--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node telemetry_budget_check.ts <jsonl> --max 10000 --days 1");
    process.exit(2);
  }
  const max = getArg("max", 10000);
  const days = getArg("days", 1);
  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  });

  let total = 0;
  const perType = new Map<string, number>();

  for await (const line of rl) {
    if (!line) continue;
    try {
      const row = JSON.parse(line) as Row;
      if (!row?.ts || row.ts < since) continue;
      total += 1;
      const type = row.event || row.kpi?.event || "unknown";
      perType.set(type, (perType.get(type) ?? 0) + 1);
    } catch {
      // ignore parse errors
    }
  }

  const summary = Object.fromEntries([...perType.entries()].sort((a, b) => b[1] - a[1]));
  const hours = days * 24;
  const minutes = Math.max(hours * 60, 1);
  const eventRates = Object.fromEntries(
    Object.entries(summary).map(([event, count]) => [
      event,
      typeof count === "number" && Number.isFinite(count) ? count / minutes : 0,
    ]),
  );
  const payload = {
    level: total <= max ? "info" : "warning",
    total,
    max,
    days,
    hours,
    summary,
    event_rates: eventRates,
    since,
    generated_at: new Date().toISOString(),
  };

  try {
    fs.mkdirSync("reports", { recursive: true });
  } catch {
    // ignore
  }
  fs.writeFileSync("reports/telemetry_budget_summary.json", JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(0);
});

