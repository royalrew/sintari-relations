#!/usr/bin/env node
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "reports", "emotion_golden_report.json");

let W = {
  WX_RED: +process.env.WX_RED || 2.60,
  WX_TENSION: +process.env.WX_TENSION || 1.25,
  WX_POS: +process.env.WX_POS || 0.85,
  WX_EVID: +process.env.WX_EVID || 0.18,
  WX_ANCHOR_NEUTRAL: +process.env.WX_ANCHOR_NEUTRAL || -0.25,
  BIAS: +process.env.BIAS || 0.02,
  Z_LIGHT: +process.env.Z_LIGHT || 0.48,
  Z_PLUS: +process.env.Z_PLUS || 0.82,
  Z_RED: +process.env.Z_RED || 1.02,
};

// Optimize all key parameters
const keys = ["WX_RED", "WX_TENSION", "WX_POS", "WX_EVID", "WX_ANCHOR_NEUTRAL", "BIAS", "Z_LIGHT", "Z_PLUS", "Z_RED"];

let evalCounter = 0;
function evalOnce() {
  evalCounter++;
  const env = { ...process.env, CALIBRATION_MODE: "true" };
  for (const [k, v] of Object.entries(W)) {
    env[k] = v.toString();
  }
  execSync("node scripts/emotion_golden_eval.mjs", { cwd: ROOT, env, stdio: "ignore" });
  const rep = JSON.parse(fs.readFileSync(REPORT, "utf8"));
  const acc = +rep.accuracy || 0;
  const gap = +rep.sv_en_gap || 0;
  const redFp = +rep.red_fp_rate || 0;
  // score: maxa acc, straffa gap > 0.02 och redFP > 0.10
  const score = acc - 0.5 * Math.max(0, gap - 0.02) - 0.2 * Math.max(0, redFp - 0.10);
  if (evalCounter % 10 === 0) {
    console.log(`  eval #${evalCounter}: acc=${acc.toFixed(3)}`);
  }
  return { acc, gap, redFp, score };
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
const MAX_EVAL = +process.env.MAX_EVAL || 90;
for (let pass = 0; pass < 10; pass++) {
  console.log(`\n[Pass ${pass + 1}]`);
  if (evalCounter >= MAX_EVAL) {
    console.log(`\n⏱ Stopping after ${evalCounter} evaluations (MAX_EVAL=${MAX_EVAL})`);
    break;
  }
  let improved = false;
  for (const k of keys) {
    if (evalCounter >= MAX_EVAL) break;
    const orig = W[k];

    for (const dir of [+1, -1]) {
      W[k] = orig + dir * step;
      clampWeights();
      const r = evalOnce();

      if (r.score > best.score) {
        best = r;
        improved = true;
        console.log(`✓ ${k} -> ${W[k].toFixed(3)}  acc=${r.acc.toFixed(3)} gap=${r.gap.toFixed(3)} redFP=${r.redFp.toFixed(3)} score=${r.score.toFixed(3)}`);
        break;
      }
      W[k] = orig;
    }
  }
  if (!improved) step *= 0.5;
  if (step < 0.01) break;
}

console.log("\nBest:", { ...best });
console.log("Weights:", JSON.stringify(W, null, 2));
const OUT = path.join(ROOT, "reports", "emotion_weight_best.json");
fs.writeFileSync(OUT, JSON.stringify({ metrics: best, weights: W }, null, 2));
console.log("→ Saved", OUT);
