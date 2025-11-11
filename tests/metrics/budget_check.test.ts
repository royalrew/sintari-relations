import { execSync } from "node:child_process";
import fs from "fs";
import path from "path";

function mkTmp(jsonl: string) {
  const filePath = path.join(process.cwd(), "tmp_budget.jsonl");
  fs.writeFileSync(filePath, jsonl);
  return filePath;
}

describe("telemetry_budget_check", () => {
  test("produces JSON summary and respects window", () => {
    const now = Date.now();
    const jsonl = [
      JSON.stringify({ ts: now, event: "shown" }),
      JSON.stringify({ ts: now, event: "completed" }),
      JSON.stringify({ ts: now - 2 * 24 * 3600 * 1000, event: "old" }),
    ].join("\n");
    const file = mkTmp(jsonl);
    const cmd = `npx tsx scripts/metrics/telemetry_budget_check.ts "${file}" --max 1 --days 1`;
    const out = execSync(cmd, { shell: true })
      .toString()
      .trim();
    const parsed = JSON.parse(out);
    expect(parsed.total).toBe(2);
    expect(parsed.summary.shown).toBe(1);
    expect(parsed.summary.completed).toBe(1);
    expect(parsed.event_rates.shown).toBeGreaterThan(0);
  });
});

