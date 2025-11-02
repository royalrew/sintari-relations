#!/usr/bin/env node
/**
 * Emotion Golden Evaluation Script
 * Steg 99: Brain First Plan - Golden Tests
 * 
 * Generates confusion matrix, misses, SV/EN gap, and RED false positive rate
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Script is in sintari-relations/scripts, so go up one level to sintari-relations
const sintariRoot = path.resolve(__dirname, "..");

// Try both sintari-relations/tests and project root/tests
let golden = path.join(sintariRoot, "tests", "golden", "emotion", "micro_mood_golden.jsonl");
if (!fs.existsSync(golden)) {
  // Try from project root (one level up from sintari-relations)
  golden = path.join(sintariRoot, "..", "tests", "golden", "emotion", "micro_mood_golden.jsonl");
}
if (!fs.existsSync(golden)) {
  console.error(`[Eval] Golden file not found. Tried:`);
  console.error(`  ${path.join(sintariRoot, "tests", "golden", "emotion", "micro_mood_golden.jsonl")}`);
  console.error(`  ${path.join(sintariRoot, "..", "tests", "golden", "emotion", "micro_mood_golden.jsonl")}`);
  process.exit(1);
}

const reportPath = path.join(sintariRoot, "reports", "emotion_golden_report.json");

const levels = ["neutral", "light", "plus", "red"];

// Confusion matrix: cm[expected][detected] = count
const cm = Object.fromEntries(
  levels.map((a) => [a, Object.fromEntries(levels.map((b) => [b, 0]))])
);

const misses = [];

async function run() {
  // Import py_bridge using same approach as test script
  let callMicroMood;
  try {
    // Use spawn directly (like test script does)
    const { spawn } = await import("child_process");
    const { promisify } = await import("util");
    
    const pythonBin = process.env.PYTHON_BIN || "python";
    // Try both paths: project root/agents and sintari-relations/../agents
    let scriptPath = path.join(sintariRoot, "..", "agents", "emotion", "micro_mood.py");
    if (!fs.existsSync(scriptPath)) {
      scriptPath = path.join(sintariRoot, "agents", "emotion", "micro_mood.py");
    }
    if (!fs.existsSync(scriptPath)) {
      console.warn(`[Eval] Micro-Mood script not found at ${scriptPath}, using fallback`);
    }
    
    // Simple wrapper that uses Python directly
    callMicroMood = async (text, lang, traceId) => {
      return new Promise((resolve) => {
        const proc = spawn(pythonBin, [scriptPath], {
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            PYTHONUNBUFFERED: "1",
            PYTHONIOENCODING: "utf-8",
            LC_ALL: "C.UTF-8",
            LANG: "C.UTF-8",
          },
        });

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (chunk) => {
          stdout += chunk.toString("utf-8");
        });

        proc.stderr.on("data", (chunk) => {
          stderr += chunk.toString("utf-8");
        });

        proc.on("close", (code) => {
          if (code === 0 && stdout.trim()) {
            try {
              const lines = stdout.trim().split("\n");
              const lastLine = lines[lines.length - 1];
              const resp = JSON.parse(lastLine);
              resolve(resp);
            } catch (e) {
              resolve({ ok: false, error: "Failed to parse response", level: "neutral", score: 0 });
            }
          } else {
            resolve({ ok: false, error: stderr || "Process failed", level: "neutral", score: 0 });
          }
        });

        proc.on("error", (error) => {
          resolve({ ok: false, error: error.message, level: "neutral", score: 0 });
        });

        // Send request
        const request = JSON.stringify({
          agent: "micro_mood",
          text: text,
          lang: lang === "auto" ? "sv" : lang,
          trace_id: traceId || "eval",
        });
        proc.stdin.write(request + "\n");
        proc.stdin.end();
      });
    };
  } catch (e) {
    console.error("[Eval] Failed to setup callMicroMood:", e.message);
    console.error("[Eval] Will use fallback - script structure test only");
    // Fallback: mock
    callMicroMood = async (text, lang, traceId) => ({
      ok: true,
      level: "neutral",
      score: 0.5,
      latency_ms: 10,
    });
  }

  if (!fs.existsSync(golden)) {
    console.error(`[Eval] Golden file not found: ${golden}`);
    process.exit(1);
  }

  const lines = fs.readFileSync(golden, "utf8").trim().split("\n");
  
  let ok = 0;
  let tot = 0;
  const svScores = [];
  const enScores = [];
  let redFP = 0;
  let redPred = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    
    const r = JSON.parse(line);

    try {
      const lang = r.lang === "auto" ? "sv" : r.lang;
      const resp = await callMicroMood(r.text, lang, `golden_${r.id}`);

      if (!resp.ok) {
        console.warn(`[Eval] ${r.id} failed: ${resp.error}`);
        continue;
      }

      const det = (resp.level || "neutral").toLowerCase();
      const exp = (r.expected || "neutral").toLowerCase();

      // Build confusion matrix
      if (levels.includes(exp) && levels.includes(det)) {
        cm[exp][det]++;
      }

      // Track RED false positives
      if (det === "red") {
        redPred++;
        if (exp !== "red") {
          redFP++;
        }
      }

      // Track SV/EN scores
      if (lang === "sv") {
        svScores.push(resp.score ?? 0);
      }
      if (lang === "en") {
        enScores.push(resp.score ?? 0);
      }

      // Track misses
      if (det !== exp && misses.length < 50) {
        misses.push({
          id: r.id,
          expected: exp,
          detected: det,
          lang: lang,
          text: r.text.substring(0, 100), // Truncate for readability
        });
      }

      if (det === exp) {
        ok++;
      }
      tot++;
    } catch (error) {
      console.error(`[Eval] Error on ${r.id}:`, error.message);
    }
  }

  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const acc = tot ? ok / tot : 0;
  const sv_en_gap = Math.abs(mean(svScores) - mean(enScores));
  const red_fp_rate = redPred ? redFP / redPred : 0;

  const out = {
    total: tot,
    accuracy: +acc.toFixed(4),
    confusion_matrix: cm,
    misses: misses,
    sv_en_gap: +sv_en_gap.toFixed(4),
    red_fp_rate: +red_fp_rate.toFixed(4),
    sv_count: svScores.length,
    en_count: enScores.length,
    red_predictions: redPred,
    red_false_positives: redFP,
    generated_utc: new Date().toISOString(),
  };

  // Ensure reports directory exists
  const reportsDir = path.dirname(reportPath);
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  fs.writeFileSync(reportPath, JSON.stringify(out, null, 2));
  console.log(`[Eval] Report → ${reportPath}`);
  console.log(`[Eval] Accuracy: ${acc.toFixed(4)}, Gap: ${sv_en_gap.toFixed(4)}, RED-FP: ${red_fp_rate.toFixed(4)}`);
}

run().catch((error) => {
  console.error("[Eval] Fatal error:", error);
  process.exit(1);
});

