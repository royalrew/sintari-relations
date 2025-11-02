#!/usr/bin/env node
/**
 * Ablation Test for resolve/mutual features
 * Runs 4 profiles: A (both OFF), B (resolve ON), C (mutual ON), D (both ON)
 * Generates comparison report
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const REPORT_PATH = path.join(ROOT, "reports", "emotion_golden_report.json");
const EVAL_CMD = ["node", path.join(ROOT, "scripts", "emotion_golden_eval.mjs")];

const profiles = [
  { name: "A: Baseline (both OFF)", resolve: false, mutual: false },
  { name: "B: Resolve ON, Mutual OFF", resolve: true, mutual: false },
  { name: "C: Resolve OFF, Mutual ON", resolve: false, mutual: true },
  { name: "D: Both ON (with safety)", resolve: true, mutual: true },
];

function runProfile(profile) {
  console.log(`\n▶ ${profile.name}`);
  
  const env = {
    ...process.env,
    CALIBRATION_MODE: "false",
    FEATURE_RESOLVE: profile.resolve ? "true" : "false",
    FEATURE_MUTUAL: profile.mutual ? "true" : "false",
  };

  const run = spawnSync(EVAL_CMD[0], [EVAL_CMD[1]], {
    cwd: ROOT,
    encoding: "utf8",
    env,
  });

  if (run.error) throw run.error;
  if (run.status !== 0) {
    console.warn(`⚠️  Exit code: ${run.status}`);
  }

  if (!fs.existsSync(REPORT_PATH)) {
    throw new Error(`Report file not found: ${REPORT_PATH}`);
  }

  const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
  
  // Extract per-class recall (SV + EN combined)
  const recall = {};
  for (const level of ["neutral", "light", "plus", "red"]) {
    const correct = report.confusion_matrix[level]?.[level] || 0;
    const total = Object.values(report.confusion_matrix[level] || {}).reduce((a, b) => a + b, 0);
    recall[level] = total > 0 ? (correct / total) : 0.0;
  }

  // Extract SV/EN gap
  const gap = report.sv_en_gap || 0;

  return {
    profile: profile.name,
    accuracy: report.accuracy || 0,
    gap,
    redFp: report.red_fp_rate || 0,
    recall,
    confusion_matrix: report.confusion_matrix,
    score: (report.accuracy || 0) - 0.5 * Math.max(0, gap - 0.02) - 0.2 * Math.max(0, (report.red_fp_rate || 0) - 0.10),
  };
}

console.log("🔬 Ablation Test: Resolve/Mutual Features\n");
console.log("Profiles:");
profiles.forEach((p, i) => {
  console.log(`  ${String.fromCharCode(65 + i)}. ${p.name}`);
});

const results = [];

try {
  for (const profile of profiles) {
    const result = runProfile(profile);
    results.push(result);
    
    console.log(`  ✓ Accuracy=${result.accuracy.toFixed(3)}, Gap=${result.gap.toFixed(4)}, RED-FP=${result.redFp.toFixed(3)}`);
    console.log(`    Recall: Neutral=${(result.recall.neutral * 100).toFixed(1)}%, Light=${(result.recall.light * 100).toFixed(1)}%, Plus=${(result.recall.plus * 100).toFixed(1)}%, Red=${(result.recall.red * 100).toFixed(1)}%`);
  }
} catch (e) {
  console.error(`❌ Error: ${e.message}`);
  process.exit(1);
}

// Summary
console.log("\n📊 Summary:");
console.log("=".repeat(80));

const cols = [
  "Profile",
  "Accuracy",
  "Gap",
  "RED-FP",
  "Light %",
  "Plus %",
  "Red %",
  "Score"
];

console.log(cols.map(c => c.padEnd(12)).join(""));
console.log("-".repeat(80));

for (const r of results) {
  const row = [
    r.profile.substring(0, 11),
    r.accuracy.toFixed(3),
    r.gap.toFixed(4),
    r.redFp.toFixed(3),
    (r.recall.light * 100).toFixed(1) + "%",
    (r.recall.plus * 100).toFixed(1) + "%",
    (r.recall.red * 100).toFixed(1) + "%",
    r.score.toFixed(3),
  ];
  console.log(row.map((c, i) => c.padEnd(cols[i].length + 2)).join(""));
}

// Find winner
results.sort((a, b) => b.score - a.score);
const winner = results[0];

console.log("\n🏆 Winner:", winner.profile);
console.log(`   Accuracy=${winner.accuracy.toFixed(3)}, Gap=${winner.gap.toFixed(4)}, RED-FP=${winner.redFp.toFixed(3)}`);
console.log(`   Light recall=${(winner.recall.light * 100).toFixed(1)}%, Plus recall=${(winner.recall.plus * 100).toFixed(1)}%`);

// Save full results
const outPath = path.join(ROOT, "reports", "emotion_ablation_results.json");
fs.writeFileSync(outPath, JSON.stringify({ profiles: results, winner }, null, 2), "utf8");
console.log(`\n✅ Full results saved → ${outPath}`);

// Recommendations
console.log("\n💡 Recommendations:");
if (results[1].accuracy > results[0].accuracy && results[1].redFp <= 0.10) {
  console.log(`   Profile B (Resolve ON) shows promise: accuracy=${results[1].accuracy.toFixed(3)}, RED-FP=${results[1].redFp.toFixed(3)}`);
  console.log(`   → Try tuning: RESOLVE_WINDOW=8-10, WX_RESOLVE=0.6-0.8, Z_LIGHT=0.46-0.48`);
}
if (results[2].recall.plus > results[0].recall.plus && results[2].redFp <= 0.10) {
  console.log(`   Profile C (Mutual ON) boosts Plus recall: ${(results[2].recall.plus * 100).toFixed(1)}%`);
  console.log(`   → Try tuning: WX_MUTUAL=0.35-0.50, f_mutual=0 when s_red>0.25`);
}
if (results[3].redFp > 0.15) {
  console.log(`   Profile D (Both ON) has RED-FP issues: ${results[3].redFp.toFixed(3)}`);
  console.log(`   → Need stronger safety checks or lower weights`);
}

