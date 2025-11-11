#!/usr/bin/env node
// Simple SI proposal generator based on nightly shadow run results.

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const getArg = (key, fallback) => {
  const idx = args.indexOf(`--${key}`);
  return idx >= 0 ? args[idx + 1] : fallback;
};

const inputPath = getArg("in", "reports/si/nightly.jsonl");
const outputPath = getArg("out", "reports/si/forlag.json");

const lines = fs.existsSync(inputPath)
  ? fs.readFileSync(inputPath, "utf8").split(/\r?\n/).filter(Boolean)
  : [];

let totalMrr = 0;
let coverageSum = 0;
let noAdviceSum = 0;
let count = 0;

for (const line of lines) {
  try {
    const rec = JSON.parse(line);
    const kpi = rec?.kpi || {};
    totalMrr += Number(kpi["memory.mrr"] || 0);
    coverageSum += Number(kpi["explain.coverage"] || 0);
    noAdviceSum += Number(kpi["explain.no_advice"] || 0);
    count += 1;
  } catch (err) {
    // ignore bad lines
  }
}

const avgMrr = count ? totalMrr / count : 0;
const avgCoverage = count ? coverageSum / count : 0;
const avgNoAdvice = count ? noAdviceSum / count : 0;

const proposals = [];
if (avgMrr > 0 && avgMrr < 0.65) {
  proposals.push({
    area: "memory.scoring",
    change: { beta_plus: 0.03, rerank_topk: 12 },
    rationale: `MRR ${avgMrr.toFixed(3)} < 0.65 – öka kosinusvikt och utöka rerank-fönster.`,
  });
}
if (avgCoverage > 0 && avgCoverage < 0.95) {
  proposals.push({
    area: "explain.coverage",
    change: { fallback_spans: true, rerun_resolver: true },
    rationale: `Explain coverage ${avgCoverage.toFixed(3)} < 0.95 – utöka fallback-spans.`,
  });
}
if (avgNoAdvice < 1.0) {
  proposals.push({
    area: "explain.no_advice",
    change: { reflection_tweak: true },
    rationale: "No-advice under 100% – justera reflektionstext.",
  });
}

const report = {
  average: {
    mrr: Number(avgMrr.toFixed(4)),
    explainCoverage: Number(avgCoverage.toFixed(4)),
    explainNoAdvice: Number(avgNoAdvice.toFixed(4)),
    samples: count,
  },
  proposals,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(`[SI] Skrev förslag till ${outputPath}`);
