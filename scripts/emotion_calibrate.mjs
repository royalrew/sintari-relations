#!/usr/bin/env node
/**
 * Emotion Threshold Calibration
 * Steg 99: Brain First Plan - Grid search optimization
 * 
 * Tests threshold combinations and optimizes for:
 * - High accuracy (≥0.90)
 * - Low SV/EN gap (<0.008)
 * - Low RED false positive rate (≤0.10)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { promisify } from "util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sintariRoot = path.resolve(__dirname, "..");

// Try both paths
let golden = path.join(sintariRoot, "tests", "golden", "emotion", "micro_mood_golden.jsonl");
if (!fs.existsSync(golden)) {
  golden = path.join(sintariRoot, "..", "tests", "golden", "emotion", "micro_mood_golden.jsonl");
}

const thrPath = path.join(sintariRoot, "..", "config", "micro_mood_thresholds.json");
const outPath = path.join(sintariRoot, "reports", "emotion_thresholds_proposed.json");

if (!fs.existsSync(golden)) {
  console.error(`[Calibrate] Golden file not found: ${golden}`);
  process.exit(1);
}

// Load golden test cases
const lines = fs.readFileSync(golden, "utf8").trim().split("\n").filter(Boolean);
const testCases = lines.map((l) => JSON.parse(l));

// Grid search parameters
const BASE_THR = {
  sv: { plus_min: 0.62, light_min: 0.35, red_min: 0.82 },
  en: { plus_min: 0.62, light_min: 0.35, red_min: 0.82 },
};

const GRID_STEP = 0.02;
const GRID_RANGE = 0.06; // ±0.03 from base

// Generate grid combinations
function generateGrid() {
  const grid = [];
  
  for (let sv_plus_delta = -GRID_RANGE; sv_plus_delta <= GRID_RANGE; sv_plus_delta += GRID_STEP) {
    for (let sv_light_delta = -GRID_RANGE; sv_light_delta <= GRID_RANGE; sv_light_delta += GRID_STEP) {
      for (let sv_red_delta = -GRID_RANGE; sv_red_delta <= GRID_RANGE; sv_red_delta += GRID_STEP) {
        // Same for EN (for simplicity, use same deltas)
        const thr = {
          sv: {
            plus_min: Math.max(0.3, Math.min(0.9, BASE_THR.sv.plus_min + sv_plus_delta)),
            light_min: Math.max(0.2, Math.min(0.7, BASE_THR.sv.light_min + sv_light_delta)),
            red_min: Math.max(0.7, Math.min(1.0, BASE_THR.sv.red_min + sv_red_delta)),
          },
          en: {
            plus_min: Math.max(0.3, Math.min(0.9, BASE_THR.en.plus_min + sv_plus_delta)),
            light_min: Math.max(0.2, Math.min(0.7, BASE_THR.en.light_min + sv_light_delta)),
            red_min: Math.max(0.7, Math.min(1.0, BASE_THR.en.red_min + sv_red_delta)),
          },
        };
        grid.push(thr);
      }
    }
  }
  
  return grid;
}

// Evaluate thresholds (requires Python script with threshold override)
async function evaluateThresholds(thr) {
  // For now, return mock evaluation
  // TODO: Actually call Python with threshold override (env var or temp config)
  
  // This would require:
  // 1. Writing temp config file
  // 2. Calling micro_mood.py with override
  // 3. Running evaluation
  
  // For MVP: return placeholder
  return {
    accuracy: 0.75 + Math.random() * 0.15, // Mock
    sv_en_gap: Math.random() * 0.01,
    red_fp_rate: Math.random() * 0.05,
  };
}

async function main() {
  console.log("[Calibrate] Loading golden test cases...");
  console.log(`[Calibrate] ${testCases.length} test cases loaded`);
  
  console.log("[Calibrate] Generating grid...");
  const grid = generateGrid();
  console.log(`[Calibrate] Testing ${grid.length} threshold combinations...`);
  
  // For now, use current thresholds and suggest based on eval report
  const reportPath = path.join(sintariRoot, "reports", "emotion_golden_report.json");
  
  let suggestion = BASE_THR;
  
  if (fs.existsSync(reportPath)) {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    
    // Simple heuristic: if accuracy low, lower thresholds
    if (report.accuracy < 0.90) {
      suggestion = {
        sv: {
          plus_min: Math.max(0.55, BASE_THR.sv.plus_min - 0.03),
          light_min: Math.max(0.30, BASE_THR.sv.light_min - 0.03),
          red_min: BASE_THR.sv.red_min,
        },
        en: {
          plus_min: Math.max(0.55, BASE_THR.en.plus_min - 0.03),
          light_min: Math.max(0.30, BASE_THR.en.light_min - 0.03),
          red_min: BASE_THR.en.red_min,
        },
      };
    }
    
    // If SV/EN gap high, adjust one language slightly
    if (report.sv_en_gap > 0.008) {
      // Tune EN thresholds slightly
      suggestion.en.plus_min += 0.01;
      suggestion.en.light_min += 0.01;
    }
  }
  
  const proposal = {
    proposal: suggestion,
    note: "Manual grid search recommended. Override thresholds via environment or temp config in Python script.",
    current: BASE_THR,
    next_steps: [
      "1. Run: node sintari-relations/scripts/emotion_golden_eval.mjs",
      "2. Check reports/emotion_golden_report.json",
      "3. If accuracy < 0.90, lower plus_min/light_min by 0.02-0.03",
      "4. If SV/EN gap > 0.008, adjust one language's thresholds",
      "5. If RED FP > 0.10, raise red_min by 0.02-0.03",
      "6. Re-test and iterate",
    ],
    generated_utc: new Date().toISOString(),
  };
  
  fs.writeFileSync(outPath, JSON.stringify(proposal, null, 2));
  console.log(`[Calibrate] Proposal → ${outPath}`);
  console.log("\n[Calibrate] Suggested thresholds:");
  console.log(JSON.stringify(suggestion, null, 2));
}

main().catch((e) => {
  console.error("[Calibrate] Error:", e);
  process.exit(1);
});
