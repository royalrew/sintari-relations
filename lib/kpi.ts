import { createReadStream, promises as fs } from "fs";
import path from "path";
import readline from "readline";

export type Tier = "fastpath" | "base" | "mid" | "top";

export type KPIResult = {
  updatedAt: string;
  totals: {
    total: number;
    routed: number;
    fastpath: number;
    base: number;
    mid: number;
    top: number;
  };
  pct: {
    fastpath_pct: number; // av total
    base_pct: number;     // av routed
    mid_pct: number;      // av routed
    top_pct: number;      // av routed
  };
  cost: {
    total_usd: number;
    avg_usd: number;
    p95_usd: number;
  };
  pass: {
    fastpath: "PASS" | "WARN";
    base: "PASS" | "WARN";
    mid: "PASS" | "WARN";
    top: "PASS" | "WARN";
  };
  overall: "PASS" | "REVIEW";
};

const BASE_COST = 0.001; // USD per 1x multiplier

export function getReportsDir() {
  const override = process.env.REPORTS_DIR;
  if (override && override.trim().length) return override;
  return path.join(process.cwd(), "reports");
}

export async function fileExists(p: string) {
  try { await fs.access(p); return true; } catch { return false; }
}

export async function parseJsonlPyramid(filePath: string): Promise<KPIResult> {
  const exists = await fileExists(filePath);
  if (!exists) throw new Error(`Missing file: ${filePath}`);

  const rl = readline.createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let total = 0, fastpath = 0, base = 0, mid = 0, top = 0;
  const costs: number[] = [];

  for await (const line of rl) {
    const s = line.trim();
    if (!s) continue;
    let obj: any;
    try { obj = JSON.parse(s); } catch { continue; }
    total += 1;

    const routing = obj?.routing ?? {};
    const isFast = Boolean(
      obj?.fastPathUsed === true ||
      routing?.fastpath_used === true ||
      routing?.modelId === "fastpath-local" ||
      (obj?.tier === "fastpath") // defensivt
    );

    if (isFast) {
      fastpath += 1;
    } else {
      const t = String(routing?.tier ?? "base").trim().toLowerCase();
      if (t === "top") top += 1;
      else if (t === "mid") mid += 1;
      else base += 1;
    }

    // kostnad: 0.001 * multiplier (fallback 1.0)
    const mult = Number(routing?.cost_multiplier ?? 1.0);
    costs.push(BASE_COST * (Number.isFinite(mult) ? mult : 1.0));
  }

  const routed = base + mid + top;
  const fp_pct = total > 0 ? (fastpath / total) * 100 : 0;
  const base_pct = routed > 0 ? (base / routed) * 100 : 0;
  const mid_pct = routed > 0 ? (mid / routed) * 100 : 0;
  const top_pct = routed > 0 ? (top / routed) * 100 : 0;

  costs.sort((a, b) => a - b);
  const p95Idx = Math.min(costs.length - 1, Math.max(0, Math.floor(costs.length * 0.95)));
  const cost_total = costs.reduce((a, b) => a + b, 0);
  const cost_avg = costs.length ? cost_total / costs.length : 0;
  const cost_p95 = costs.length ? costs[p95Idx] : 0;

  const pass = {
    fastpath: fp_pct >= 22 && fp_pct <= 25 ? "PASS" : "WARN",
    base: base_pct >= 72 && base_pct <= 78 ? "PASS" : "WARN",
    mid: mid_pct >= 12 && mid_pct <= 18 ? "PASS" : "WARN",
    top: top_pct >= 4 && top_pct <= 6 ? "PASS" : "WARN",
  };

  const overall: "PASS" | "REVIEW" =
    pass.fastpath === "PASS" &&
    pass.base === "PASS" &&
    pass.mid === "PASS" &&
    pass.top === "PASS"
      ? "PASS"
      : "REVIEW";

  return {
    updatedAt: new Date().toISOString(),
    totals: { total, routed, fastpath, base, mid, top },
    pct: {
      fastpath_pct: Number(fp_pct.toFixed(1)),
      base_pct: Number(base_pct.toFixed(1)),
      mid_pct: Number(mid_pct.toFixed(1)),
      top_pct: Number(top_pct.toFixed(1)),
    },
    cost: {
      total_usd: Number(cost_total.toFixed(4)),
      avg_usd: Number(cost_avg.toFixed(4)),
      p95_usd: Number(cost_p95.toFixed(4)),
    },
    pass,
    overall,
  };
}

export async function loadKPI(): Promise<KPIResult> {
  const reportsDir = getReportsDir();
  const file = path.join(reportsDir, "pyramid_live.jsonl");
  
  // Check if file exists, return empty result if not
  if (!(await fileExists(file))) {
    // Return empty/default KPI result
    return {
      updatedAt: new Date().toISOString(),
      totals: { total: 0, routed: 0, fastpath: 0, base: 0, mid: 0, top: 0 },
      pct: {
        fastpath_pct: 0,
        base_pct: 0,
        mid_pct: 0,
        top_pct: 0,
      },
      cost: {
        total_usd: 0,
        avg_usd: 0,
        p95_usd: 0,
      },
      pass: {
        fastpath: "WARN",
        base: "WARN",
        mid: "WARN",
        top: "WARN",
      },
      overall: "WARN",
    };
  }
  
  return parseJsonlPyramid(file);
}

