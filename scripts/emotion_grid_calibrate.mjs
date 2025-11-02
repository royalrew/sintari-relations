#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

console.log("🔍 Grid Calibration for micro_mood thresholds");

const ROOT = process.cwd(); // förväntas vara .../sintari-relations
const REPORT_PATH = path.join(ROOT, "reports", "emotion_golden_report.json");
const EVAL_CMD = ["node", path.join(ROOT, "scripts", "emotion_golden_eval.mjs")];

// Z-score threshold sweeps
const zReds = [1.05, 1.10, 1.15];
const zPluses = [0.80, 0.85, 0.90];
const zLights = [0.45, 0.50, 0.55];

const combos = [];
for (const zr of zReds) for (const zp of zPluses) for (const zl of zLights) 
  if (zr > zp && zp > zl) combos.push([zr, zp, zl]);

const results = [];

function runEval(zRed, zPlus, zLight) {
  const run = spawnSync(EVAL_CMD[0], [EVAL_CMD[1]], { 
    cwd: ROOT, 
    encoding: "utf8",
    env: {
      ...process.env,
      CALIBRATION_MODE: "true",
      Z_RED: zRed.toString(),
      Z_PLUS: zPlus.toString(),
      Z_LIGHT: zLight.toString(),
    }
  });
  if (run.error) throw run.error;
  if (run.status !== 0) {
    console.warn("⚠️ Eval script exit code:", run.status);
    if (run.stderr) console.error("Stderr:", run.stderr.toString());
  }
  if (!fs.existsSync(REPORT_PATH)) throw new Error("Saknar rapportfil efter eval.");
  const rep = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
  return {
    acc: +rep.accuracy || 0,
    gap: +rep.sv_en_gap || 0,
    redFp: +rep.red_fp_rate || 0,
    cm: rep.confusion_matrix || {},
  };
}

try {
  for (const [zr, zp, zl] of combos) {
    console.log(`\n▶ Testing Z_RED=${zr.toFixed(2)}, Z_PLUS=${zp.toFixed(2)}, Z_LIGHT=${zl.toFixed(2)}`);
    const m = runEval(zr, zp, zl);
    const score = (m.acc ?? 0) - 0.5*Math.max(0, (m.gap ?? 0) - 0.02) - 0.2*Math.max(0, (m.redFp ?? 0) - 0.10);
    console.log(`  Accuracy=${m.acc.toFixed(3)}, Gap=${m.gap.toFixed(4)}, RED-FP=${m.redFp.toFixed(3)}, Score=${score.toFixed(3)}`);
    results.push({ z_red: zr, z_plus: zp, z_light: zl, ...m, score });
  }
} catch (e) {
  console.error("❌ Grid calibration error:", e.message);
}

results.sort((a,b)=> b.score - a.score);
const outPath = path.join(ROOT, "reports", "emotion_grid_results.json");
fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf8");
console.log(`\n✅ Result saved → ${outPath}`);
if (results[0]) {
  const top = results[0];
  console.log(`🏁 Best combo: Z_RED=${top.z_red.toFixed(2)}, Z_PLUS=${top.z_plus.toFixed(2)}, Z_LIGHT=${top.z_light.toFixed(2)}`);
  console.log(`   Accuracy=${top.acc.toFixed(3)} Gap=${top.gap.toFixed(4)} RED-FP=${top.redFp.toFixed(3)} Score=${top.score.toFixed(3)}`);
}
