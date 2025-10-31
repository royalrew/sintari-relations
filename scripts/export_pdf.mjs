#!/usr/bin/env node
/**
 * CLI script to export dashboard PDF without server
 * 
 * Usage:
 *   node scripts/export_pdf.mjs
 *   npm run export:pdf
 */

import PDFDocument from "pdfkit";
import { createReadStream, promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function getReportsDir() {
  const override = process.env.REPORTS_DIR;
  if (override && override.trim().length) return override;
  return path.join(ROOT, "reports");
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

const BASE_COST = 0.001;

async function parseJsonlPyramid(filePath) {
  const exists = await fileExists(filePath);
  if (!exists) throw new Error(`Missing file: ${filePath}`);

  const rl = readline.createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let total = 0,
    fastpath = 0,
    base = 0,
    mid = 0,
    top = 0;
  const costs = [];

  for await (const line of rl) {
    const s = line.trim();
    if (!s) continue;
    let obj;
    try {
      obj = JSON.parse(s);
    } catch {
      continue;
    }
    total += 1;

    const routing = obj?.routing ?? {};
    const isFast = Boolean(
      obj?.fastPathUsed === true ||
        routing?.fastpath_used === true ||
        routing?.modelId === "fastpath-local" ||
        obj?.tier === "fastpath"
    );

    if (isFast) {
      fastpath += 1;
    } else {
      const t = String(routing?.tier ?? "base").trim().toLowerCase();
      if (t === "top") top += 1;
      else if (t === "mid") mid += 1;
      else base += 1;
    }

    const mult = Number(routing?.cost_multiplier ?? 1.0);
    costs.push(BASE_COST * (Number.isFinite(mult) ? mult : 1.0));
  }

  const routed = base + mid + top;
  const fp_pct = total > 0 ? (fastpath / total) * 100 : 0;
  const base_pct = routed > 0 ? (base / routed) * 100 : 0;
  const mid_pct = routed > 0 ? (mid / routed) * 100 : 0;
  const top_pct = routed > 0 ? (top / routed) * 100 : 0;

  costs.sort((a, b) => a - b);
  const p95Idx = Math.min(
    costs.length - 1,
    Math.max(0, Math.floor(costs.length * 0.95))
  );
  const cost_total = costs.reduce((a, b) => a + b, 0);
  const cost_avg = costs.length ? cost_total / costs.length : 0;
  const cost_p95 = costs.length ? costs[p95Idx] : 0;

  const pass = {
    fastpath: fp_pct >= 22 && fp_pct <= 25 ? "PASS" : "WARN",
    base: base_pct >= 72 && base_pct <= 78 ? "PASS" : "WARN",
    mid: mid_pct >= 12 && mid_pct <= 18 ? "PASS" : "WARN",
    top: top_pct >= 4 && top_pct <= 6 ? "PASS" : "WARN",
  };

  const overall =
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

async function main() {
  const reportsDir = getReportsDir();
  const jsonlPath = path.join(reportsDir, "pyramid_live.jsonl");
  const outputPath = path.join(reportsDir, "relations-investor-report.pdf");

  console.log("📊 Loading KPI data from:", jsonlPath);
  const kpi = await parseJsonlPyramid(jsonlPath);

  const buffers = [];
  const doc = new PDFDocument({ size: "A4", margin: 36 });

  doc.on("data", buffers.push.bind(buffers));

  await new Promise((resolve) => {
    doc.on("end", resolve);

    // Titel
    doc
      .fontSize(18)
      .text("Relations AI — Investor Report", { align: "left" });
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .fillColor("#555")
      .text(`Generated: ${new Date().toISOString()}`);
    doc.moveDown();

    // Pyramid
    doc.fillColor("#000").fontSize(14).text("Pyramid Distribution");
    doc.fontSize(11);
    const p = kpi.pct;
    doc.text(`FastPath: ${p.fastpath_pct}%  (target 22–25%)`);
    doc.text(`Base:     ${p.base_pct}%      (target 72–78%)`);
    doc.text(`Mid:      ${p.mid_pct}%       (target 12–18%)`);
    doc.text(`Top:      ${p.top_pct}%       (target 4–6%)`);
    doc.moveDown();

    // Kostnad
    doc.fontSize(14).text("Cost");
    doc.fontSize(11);
    doc.text(`Total:  $${kpi.cost.total_usd.toFixed(4)}`);
    doc.text(`Avg:    $${kpi.cost.avg_usd.toFixed(4)}`);
    doc.text(`p95:    $${kpi.cost.p95_usd.toFixed(4)}`);
    doc.moveDown();

    // Status
    doc.fontSize(14).text("Status");
    doc.fontSize(11);
    doc.text(`Overall: ${kpi.overall}`);
    doc.text(
      `FastPath: ${kpi.pass.fastpath}  Base: ${kpi.pass.base}  Mid: ${kpi.pass.mid}  Top: ${kpi.pass.top}`
    );
    doc.moveDown();

    // Länk till scorecard
    const scorePath = path.join(reportsDir, "scorecards", "last.html");
    doc.fontSize(12).text("Latest Scorecard:", { underline: true });
    doc.fontSize(10).fillColor("#0070f3").text(scorePath, { link: "about:blank" });
    doc.fillColor("#000");

    doc.end();
  });

  const pdf = Buffer.concat(buffers);
  await fs.writeFile(outputPath, pdf);

  console.log(`✅ PDF exported to: ${outputPath}`);
}

main().catch((err) => {
  console.error("❌ Error exporting PDF:", err);
  process.exit(1);
});

