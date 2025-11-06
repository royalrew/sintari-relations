#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

// --- PATCH: dynamic Z-parameter sweep flags ---
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.includes("=") ? a.split("=", 2) : [a, argv[i + 1]?.startsWith("--") ? true : argv[i + 1]];
      const key = k.replace(/^--/, "");
      if (v !== undefined && v !== true && !a.includes("=")) i++;
      args[key] = v === undefined ? true : v;
    }
  }
  return args;
}

const args = parseArgs(process.argv);
let goldenIn = args["in"] || null;
let outPath = args["out"] || null;
let quickMode = args["quick"] === true || args["quick"] === "true";
let maxEvalTime = args["timeout"] ? parseInt(args["timeout"]) * 1000 : 30000; // 30 seconds per eval max

console.log("🔍 Grid Calibration for EmpathyToneAgent v2 thresholds");

const ROOT = process.cwd(); // förväntas vara .../sintari-relations
const REPORT_PATH = path.join(ROOT, "reports", "emotion_golden_report.json");
const EVAL_CMD = ["node", path.join(ROOT, "scripts", "emotion_golden_eval.mjs")];

// Set golden path if provided via --in
if (goldenIn) {
  process.env.GOLDEN_IN = goldenIn;
}

// Default ranges (om flaggar ej sätts)
const Z_RED_MIN   = parseFloat(args["zred-min"]   ?? (quickMode ? "0.95" : "0.85"));
const Z_RED_MAX   = parseFloat(args["zred-max"]   ?? (quickMode ? "0.95" : "1.00"));
const Z_RED_STEP  = parseFloat(args["zred-step"]  ?? "0.05");
const Z_PLUS_MIN  = parseFloat(args["zplus-min"]  ?? (quickMode ? "0.60" : "0.60"));
const Z_PLUS_MAX  = parseFloat(args["zplus-max"]  ?? (quickMode ? "0.60" : "0.85"));
const Z_PLUS_STEP = parseFloat(args["zplus-step"] ?? "0.05");
const Z_LIGHT_MIN = parseFloat(args["zlight-min"] ?? (quickMode ? "0.35" : "0.30"));
const Z_LIGHT_MAX = parseFloat(args["zlight-max"] ?? (quickMode ? "0.35" : "0.50"));
const Z_LIGHT_STEP= parseFloat(args["zlight-step"]?? "0.05");

// Generera kombinationer (grid)
const combos = [];
for (let zred = Z_RED_MIN; zred <= Z_RED_MAX + 1e-9; zred += Z_RED_STEP) {
  for (let zplus = Z_PLUS_MIN; zplus <= Z_PLUS_MAX + 1e-9; zplus += Z_PLUS_STEP) {
    for (let zlight = Z_LIGHT_MIN; zlight <= Z_LIGHT_MAX + 1e-9; zlight += Z_LIGHT_STEP) {
      if (zred > zplus && zplus > zlight) {
        combos.push([
          Number(zred.toFixed(3)),
          Number(zplus.toFixed(3)),
          Number(zlight.toFixed(3))
        ]);
      }
    }
  }
}

console.log(`[INFO] Sweep range: ${combos.length} combinations`);
console.log(`[INFO] Z_RED=${Z_RED_MIN}–${Z_RED_MAX} (step ${Z_RED_STEP}) | Z_PLUS=${Z_PLUS_MIN}–${Z_PLUS_MAX} (step ${Z_PLUS_STEP}) | Z_LIGHT=${Z_LIGHT_MIN}–${Z_LIGHT_MAX} (step ${Z_LIGHT_STEP})`);

console.log(`📊 Testing ${combos.length} threshold combinations${quickMode ? " (quick mode)" : ""}`);

const results = [];

function runEval(zRed, zPlus, zLight, comboIndex, totalCombos) {
  const startTime = Date.now();
  process.stdout.write(`[${comboIndex + 1}/${totalCombos}] Testing... `);
  
  const run = spawnSync(EVAL_CMD[0], [EVAL_CMD[1]], { 
    cwd: ROOT, 
    encoding: "utf8",
    timeout: maxEvalTime,
    env: {
      ...process.env,
      CALIBRATION_MODE: "true",
      Z_RED: zRed.toString(),
      Z_PLUS: zPlus.toString(),
      Z_LIGHT: zLight.toString(),
    }
  });
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  if (run.error) {
    if (run.error.code === 'ETIMEDOUT') {
      console.warn(`⚠️  Timeout after ${elapsed}s`);
      return { acc: 0, gap: 1, redFp: 1, cm: {}, timeout: true };
    }
    throw run.error;
  }
  
  if (run.status !== 0) {
    console.warn(`⚠️  Exit code ${run.status} (${elapsed}s)`);
    if (run.stderr) console.error("Stderr:", run.stderr.toString().substring(0, 200));
  }
  
  if (!fs.existsSync(REPORT_PATH)) {
    console.warn(`⚠️  Report file missing (${elapsed}s)`);
    return { acc: 0, gap: 1, redFp: 1, cm: {}, missing: true };
  }
  
  try {
    const rep = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
    const cm = rep.confusion_matrix || {};
    
    // Beräkna RED recall, PLUS precision, LIGHT rate från confusion matrix
    const red_true = (cm.red?.red || 0);
    const red_total = Object.values(cm.red || {}).reduce((a, b) => a + b, 0);
    const red_recall = red_total > 0 ? red_true / red_total : 0;
    
    const plus_pred = Object.values(cm.plus || {}).reduce((a, b) => a + b, 0);
    const plus_true = (cm.plus?.plus || 0);
    const plus_precision = plus_pred > 0 ? plus_true / plus_pred : 0;
    
    const light_pred = Object.values(cm.light || {}).reduce((a, b) => a + b, 0);
    const total_pred = Object.values(cm).reduce((sum, row) => {
      return sum + Object.values(row).reduce((a, b) => a + b, 0);
    }, 0);
    const light_rate = total_pred > 0 ? light_pred / total_pred : 0;
    
    const result = {
      acc: +rep.accuracy || 0,
      gap: +rep.sv_en_gap || 0,
      redFp: +rep.red_fp_rate || 0,
      redRecall: red_recall,
      plusPrecision: plus_precision,
      lightRate: light_rate,
      cm: cm,
    };
    process.stdout.write(`✓ (${elapsed}s)\n`);
    return result;
  } catch (e) {
    console.warn(`⚠️  Parse error: ${e.message} (${elapsed}s)`);
    return { acc: 0, gap: 1, redFp: 1, redRecall: 0, plusPrecision: 0, lightRate: 0, cm: {}, parseError: true };
  }
}

const totalStartTime = Date.now();
try {
  let comboIndex = 0;
  for (const [zr, zp, zl] of combos) {
    const m = runEval(zr, zp, zl, comboIndex, combos.length);
    // Optimera mot gates (inte bara accuracy)
    // score = 0.45*ACC + 0.30*RED_recall + 0.20*PLUS_precision + 0.05*LIGHT_rate
    // straffa RED-FP och bias
    const score = 0.45 * (m.acc ?? 0) 
                + 0.30 * (m.redRecall ?? 0)
                + 0.20 * (m.plusPrecision ?? 0)
                + 0.05 * (m.lightRate ?? 0)
                - 0.10 * (m.redFp ?? 0)
                - 0.05 * Math.max(0, 0.01 - (m.lightRate ?? 0))
                - 0.05 * Math.max(0, 0.01 - (1 - Math.abs(m.gap ?? 0)));
    console.log(`  Z_RED=${zr.toFixed(2)}, Z_PLUS=${zp.toFixed(2)}, Z_LIGHT=${zl.toFixed(2)} → acc=${m.acc.toFixed(3)}, RED_recall=${(m.redRecall ?? 0).toFixed(3)}, PLUS_prec=${(m.plusPrecision ?? 0).toFixed(3)}, LIGHT_rate=${(m.lightRate ?? 0).toFixed(3)}, redFP=${m.redFp.toFixed(3)}, score=${score.toFixed(3)}`);
    results.push({ z_red: zr, z_plus: zp, z_light: zl, ...m, score });
    comboIndex++;
  }
  
  const totalElapsed = ((Date.now() - totalStartTime) / 1000).toFixed(1);
  console.log(`\n⏱ Total time: ${totalElapsed}s (avg ${(totalElapsed / combos.length).toFixed(1)}s per combo)`);
} catch (e) {
  console.error("❌ Grid calibration error:", e.message);
  console.error(e.stack);
}

results.sort((a,b)=> b.score - a.score);

// Save detailed results
const resultsPath = path.join(ROOT, "reports", "emotion_grid_results.json");
fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), "utf8");
console.log(`\n✅ Grid results saved → ${resultsPath}`);

if (results[0]) {
  const top = results[0];
  console.log(`🏁 Best combo: Z_RED=${top.z_red.toFixed(2)}, Z_PLUS=${top.z_plus.toFixed(2)}, Z_LIGHT=${top.z_light.toFixed(2)}`);
  console.log(`   Accuracy=${top.acc.toFixed(3)} RED_recall=${(top.redRecall ?? 0).toFixed(3)} PLUS_precision=${(top.plusPrecision ?? 0).toFixed(3)} LIGHT_rate=${(top.lightRate ?? 0).toFixed(3)}`);
  console.log(`   Gap=${top.gap.toFixed(4)} RED-FP=${top.redFp.toFixed(3)} Score=${top.score.toFixed(3)}`);
  
  // Save thresholds.json in the format expected by micro_mood.py
  // Z-scores are already in the right scale (0-1), so we can use them directly
  const thresholds = {
    sv: {
      plus_min: top.z_plus,
      light_min: top.z_light,
      red_min: top.z_red
    },
    en: {
      plus_min: top.z_plus,
      light_min: top.z_light,
      red_min: top.z_red
    }
  };
  
  // Determine final output path
  const finalOutPath = outPath || path.join(ROOT, "thresholds.json");
  
  // Ensure directory exists
  const outDir = path.dirname(finalOutPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  
  fs.writeFileSync(finalOutPath, JSON.stringify(thresholds, null, 2) + "\n", "utf8");
  console.log(`✅ Thresholds saved → ${finalOutPath}`);
  
  // Verify thresholds meet acceptance criteria
  if (top.acc >= 0.94 && Math.abs(top.gap) < 0.01) {
    console.log(`✅ ACCEPTANCE: F1 ≥ 0.94 (${top.acc.toFixed(3)}) and bias Δ < 0.01 (${Math.abs(top.gap).toFixed(4)})`);
  } else {
    console.warn(`⚠️  ACCEPTANCE: May not meet criteria - F1=${top.acc.toFixed(3)} (need ≥0.94), bias=${Math.abs(top.gap).toFixed(4)} (need <0.01)`);
  }
}
