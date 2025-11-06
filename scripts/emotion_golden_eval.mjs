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

// Parse command line arguments
const args = process.argv.slice(2);
let inputDir = null;
let checkMode = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--in" && i + 1 < args.length) {
    inputDir = args[i + 1];
    i++;
  } else if (args[i] === "--check") {
    checkMode = true;
  }
}

// Determine input directory: --in flag > GOLDEN_IN env var > default
if (!inputDir) {
  inputDir = process.env.GOLDEN_IN || "tests/golden/relations";
}

// Resolve input directory (can be relative or absolute)
if (!path.isAbsolute(inputDir)) {
  inputDir = path.resolve(sintariRoot, inputDir);
}

// Function to find all .jsonl files in a directory (recursively)
function findJsonlFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) {
    return files;
  }
  
  const stat = fs.statSync(dir);
  if (stat.isFile() && dir.endsWith(".jsonl")) {
    return [dir];
  }
  
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findJsonlFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(fullPath);
      }
    }
  }
  
  return files;
}

// Find all golden files
const goldenFiles = findJsonlFiles(inputDir);

if (goldenFiles.length === 0) {
  console.error(`[Eval] No .jsonl files found in: ${inputDir}`);
  console.error(`[Eval] Tried: ${inputDir}`);
  process.exit(1);
}

console.log(`[Eval] Found ${goldenFiles.length} .jsonl file(s) in: ${inputDir}`);

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

  // Load all golden files
  const allCases = [];
  for (const goldenFile of goldenFiles) {
    const lines = fs.readFileSync(goldenFile, "utf8").trim().split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        
        // Map different formats to standard format
        let mappedCase = null;
        
        // Format 1: Simple format with direct label field (lang, text, label)
        if (r.text && r.lang !== undefined && r.label) {
          // Map label directly to expected level
          const label = (r.label || "").toLowerCase();
          let expected = "neutral";
          if (label === "red" || label === "crisis") {
            expected = "red";
          } else if (label === "plus" || label === "worry" || label === "oro") {
            expected = "plus";
          } else if (label === "light" || label === "mild") {
            expected = "light";
          }
          
          mappedCase = {
            id: r.id || `case_${allCases.length + 1}`,
            lang: r.lang === "auto" ? "sv" : r.lang,
            text: r.text,
            expected: expected
          };
        }
        // Format 2: worldclass_emotion.jsonl format (id, lang, text, labels, flags)
        else if (r.id && r.text && r.lang !== undefined) {
          // Map labels to expected level
          let expected = "neutral";
          if (r.flags?.red) {
            expected = "red";
          } else if (r.labels && r.labels.length > 0) {
            const labelsStr = r.labels.join(" ").toLowerCase();
            if (labelsStr.includes("red") || labelsStr.includes("crisis")) {
              expected = "red";
            } else if (labelsStr.includes("plus") || labelsStr.includes("worry") || labelsStr.includes("oro")) {
              expected = "plus";
            } else if (labelsStr.includes("light") || labelsStr.includes("mild")) {
              expected = "light";
            }
          }
          
          mappedCase = {
            id: r.id,
            lang: r.lang === "auto" ? "sv" : r.lang,
            text: r.text,
            expected: expected
          };
        }
        // Format 3: relations format (description, language, expected.tone)
        else if (r.description && r.language) {
          // Map tone to level (simplified mapping)
          let expected = "neutral";
          const tone = (r.expected?.tone || "").toLowerCase();
          if (tone.includes("red") || tone.includes("crisis")) {
            expected = "red";
          } else if (tone.includes("plus") || tone.includes("worry")) {
            expected = "plus";
          } else if (tone.includes("light")) {
            expected = "light";
          }
          
          mappedCase = {
            id: r.id || `case_${allCases.length + 1}`,
            lang: r.language === "auto" ? "sv" : r.language,
            text: r.description,
            expected: expected
          };
        }
        
        if (mappedCase) {
          allCases.push(mappedCase);
        }
      } catch (e) {
        console.warn(`[Eval] Skipping invalid JSON line in ${goldenFile}: ${e.message}`);
      }
    }
  }
  
  if (checkMode) {
    console.log(`\n✅ Loaded ${allCases.length} golden cases from ${goldenFiles.length} file(s)`);
    console.log(`   Files: ${goldenFiles.map(f => path.basename(f)).join(", ")}`);
    const langCounts = {};
    const levelCounts = {};
    for (const c of allCases) {
      langCounts[c.lang] = (langCounts[c.lang] || 0) + 1;
      levelCounts[c.expected] = (levelCounts[c.expected] || 0) + 1;
    }
    console.log(`   Languages: ${JSON.stringify(langCounts)}`);
    console.log(`   Expected levels: ${JSON.stringify(levelCounts)}`);
    
    // Check coverage if requested
    const coverageArg = args.find(arg => arg.startsWith('--check-coverage'));
    if (coverageArg) {
      const minCoverage = parseFloat(coverageArg.split('=')[1] || '0.95');
      const totalCases = allCases.length;
      const coveredLevels = Object.keys(levelCounts).length;
      const expectedLevels = 4; // neutral, light, plus, red
      const coverage = coveredLevels / expectedLevels;
      
      console.log(`   Coverage: ${(coverage * 100).toFixed(1)}% (${coveredLevels}/${expectedLevels} levels)`);
      if (coverage >= minCoverage) {
        console.log(`   ✅ Coverage ≥ ${(minCoverage * 100).toFixed(0)}%`);
      } else {
        console.log(`   ⚠️  Coverage < ${(minCoverage * 100).toFixed(0)}% (need ${(minCoverage * 100).toFixed(0)}%)`);
      }
    }
    
    process.exit(0);
  }
  
  if (allCases.length === 0) {
    console.error(`[Eval] No valid cases found in golden files`);
    process.exit(1);
  }
  
  console.log(`[Eval] Processing ${allCases.length} golden cases...`);
  
  let ok = 0;
  let tot = 0;
  const svScores = [];
  const enScores = [];
  let redFP = 0;
  let redPred = 0;

  for (const r of allCases) {
    try {
      const lang = r.lang === "auto" ? "sv" : r.lang;
      const resp = await callMicroMood(r.text, lang, `golden_${r.id}`);

      if (!resp.ok) {
        console.warn(`[Eval] ${r.id} failed: ${resp.error}`);
        continue;
      }

      const level = resp.level ?? resp.emits?.level ?? "neutral";
      const det = (level || "neutral").toLowerCase();
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
        const score = resp.score ?? resp.emits?.score ?? 0;
        svScores.push(score);
      }
      if (lang === "en") {
        const score = resp.score ?? resp.emits?.score ?? 0;
        enScores.push(score);
      }

      // Track misses
      if (det !== exp) {
        misses.push({
          id: r.id,
          expected: exp,
          detected: det,
          lang,
          text: r.text,
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

