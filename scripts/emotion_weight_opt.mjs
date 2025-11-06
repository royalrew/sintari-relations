#!/usr/bin/env node
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// Parse command line arguments
const args = process.argv.slice(2);
let goldenIn = null;
let outPath = null;
let quickMode = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--in" && i + 1 < args.length) {
    goldenIn = args[i + 1];
    i++;
  } else if (args[i] === "--out" && i + 1 < args.length) {
    outPath = args[i + 1];
    i++;
  } else if (args[i] === "--quick") {
    quickMode = true;
  }
}

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "reports", "emotion_golden_report.json");

// Try to load thresholds from thresholds.json (from step 1)
let thresholdsData = null;
const thresholdsPath = path.join(ROOT, "thresholds.json");
if (fs.existsSync(thresholdsPath)) {
  try {
    thresholdsData = JSON.parse(fs.readFileSync(thresholdsPath, "utf8"));
    console.log("📋 Loaded thresholds from thresholds.json");
  } catch (e) {
    console.warn("⚠️  Could not load thresholds.json:", e.message);
  }
}

// Use thresholds from file if available, otherwise use defaults
let W = {
  WX_RED: +process.env.WX_RED || 2.60,
  WX_TENSION: +process.env.WX_TENSION || 1.25,
  WX_POS: +process.env.WX_POS || 0.85,
  WX_EVID: +process.env.WX_EVID || 0.18,
  WX_ANCHOR_NEUTRAL: +process.env.WX_ANCHOR_NEUTRAL || -0.25,
  BIAS: +process.env.BIAS || 0.02,
  Z_LIGHT: thresholdsData?.sv?.light_min || thresholdsData?.en?.light_min || +process.env.Z_LIGHT || 0.48,
  Z_PLUS: thresholdsData?.sv?.plus_min || thresholdsData?.en?.plus_min || +process.env.Z_PLUS || 0.82,
  Z_RED: thresholdsData?.sv?.red_min || thresholdsData?.en?.red_min || +process.env.Z_RED || 1.02,
};

// Set golden path if provided via --in
if (goldenIn) {
  process.env.GOLDEN_IN = goldenIn;
}

// Optimize all key parameters
const keys = ["WX_RED", "WX_TENSION", "WX_POS", "WX_EVID", "WX_ANCHOR_NEUTRAL", "BIAS", "Z_LIGHT", "Z_PLUS", "Z_RED"];

let evalCounter = 0;
function evalOnce() {
  evalCounter++;
  const startTime = Date.now();
  process.stdout.write(`[${evalCounter}] Evaluating... `);
  
  const env = { ...process.env, CALIBRATION_MODE: "true" };
  for (const [k, v] of Object.entries(W)) {
    env[k] = v.toString();
  }
  
  try {
    execSync("node scripts/emotion_golden_eval.mjs", { cwd: ROOT, env, stdio: "pipe", timeout: 30000 });
    const rep = JSON.parse(fs.readFileSync(REPORT, "utf8"));
    const acc = +rep.accuracy || 0;
    const gap = +rep.sv_en_gap || 0;
    const redFp = +rep.red_fp_rate || 0;
    // score: maxa acc, straffa gap > 0.02 och redFP > 0.10
    const score = acc - 0.5 * Math.max(0, gap - 0.02) - 0.2 * Math.max(0, redFp - 0.10);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(`✓ (${elapsed}s) acc=${acc.toFixed(3)}\n`);
    return { acc, gap, redFp, score };
  } catch (e) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(`✗ (${elapsed}s) Error: ${e.message.substring(0, 50)}\n`);
    return { acc: 0, gap: 1, redFp: 1, score: -1 };
  }
}

function clampWeights() {
  for (const k of keys) {
    if (k === "WX_RED") W[k] = Math.max(1.8, Math.min(3.2, W[k]));
    else if (k === "WX_TENSION") W[k] = Math.max(0.8, Math.min(1.6, W[k]));
    else if (k === "WX_POS") W[k] = Math.max(0.6, Math.min(1.1, W[k]));
    else if (k === "WX_EVID") W[k] = Math.max(0.10, Math.min(0.30, W[k]));
    else if (k === "WX_ANCHOR_NEUTRAL") W[k] = Math.max(-0.45, Math.min(-0.15, W[k]));
    else if (k === "BIAS") W[k] = Math.max(-0.05, Math.min(0.10, W[k]));
    else if (k === "Z_LIGHT") W[k] = Math.max(0.45, Math.min(0.55, W[k]));
    else if (k === "Z_PLUS") W[k] = Math.max(0.75, Math.min(0.88, W[k]));
    else if (k === "Z_RED") W[k] = Math.max(0.95, Math.min(1.10, W[k]));
  }
}

let best = evalOnce();
console.log("Start:", { ...best, W });

let step = 0.06;
const MAX_EVAL = quickMode ? 20 : (+process.env.MAX_EVAL || 50); // Quick mode: 20 evals, Full: 50
const MAX_PASSES = quickMode ? 3 : 10; // Quick mode: 3 passes, Full: 10

console.log(`⚙️  Weight Optimization (${quickMode ? "QUICK" : "FULL"} mode: max ${MAX_EVAL} evals, ${MAX_PASSES} passes)`);

for (let pass = 0; pass < MAX_PASSES; pass++) {
  console.log(`\n[Pass ${pass + 1}/${MAX_PASSES}] (${evalCounter}/${MAX_EVAL} evals used)`);
  if (evalCounter >= MAX_EVAL) {
    console.log(`\n⏱ Stopping after ${evalCounter} evaluations (MAX_EVAL=${MAX_EVAL})`);
    break;
  }
  let improved = false;
  for (const k of keys) {
    if (evalCounter >= MAX_EVAL) {
      console.log(`\n⏱ Reached MAX_EVAL=${MAX_EVAL}, stopping optimization`);
      break;
    }
    const orig = W[k];
    process.stdout.write(`  Testing ${k} (${evalCounter + 1}/${MAX_EVAL})... `);

    for (const dir of [+1, -1]) {
      W[k] = orig + dir * step;
      clampWeights();
      const r = evalOnce();

      if (r.score > best.score) {
        best = r;
        improved = true;
        console.log(`\n  ✓ ${k} -> ${W[k].toFixed(3)}  acc=${r.acc.toFixed(3)} gap=${r.gap.toFixed(3)} redFP=${r.redFp.toFixed(3)} score=${r.score.toFixed(3)}`);
        break;
      }
      W[k] = orig;
    }
    if (!improved) {
      process.stdout.write(`(no improvement)\n`);
    }
  }
  if (!improved) step *= 0.5;
  if (step < 0.01) {
    console.log(`\n⏱ Step size too small (${step.toFixed(4)}), stopping`);
    break;
  }
}

console.log("\nBest:", { ...best });
console.log("Weights:", JSON.stringify(W, null, 2));

// Save detailed results
const resultsPath = path.join(ROOT, "reports", "emotion_weight_best.json");
fs.writeFileSync(resultsPath, JSON.stringify({ metrics: best, weights: W }, null, 2));
console.log("✅ Weight optimization results saved →", resultsPath);

// Determine final output path
const finalOutPath = outPath || path.join(ROOT, "emotion_weights.json");

// Ensure directory exists
const outDir = path.dirname(finalOutPath);
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Save emotion_weights.json in expected format
fs.writeFileSync(finalOutPath, JSON.stringify(W, null, 2) + "\n", "utf8");
console.log("✅ Emotion weights saved →", finalOutPath);

// Calculate likability improvement (baseline comparison)
// Note: This is a placeholder - actual likability calculation would need baseline comparison
console.log(`📊 Optimization complete: acc=${best.acc.toFixed(3)}, gap=${best.gap.toFixed(4)}, redFP=${best.redFp.toFixed(3)}`);
