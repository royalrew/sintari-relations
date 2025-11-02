#!/usr/bin/env node
/**
 * Golden test för Py-Bridge Micro-Mood (steg 92)
 * 20 fall (SV/EN/emoji/RED) + latency assertion
 * 
 * KPI: p95 <150ms, error rate <0.5%, 100% schema-validerade svar
 * 
 * Usage: node scripts/test_py_bridge_micro_mood.mjs
 */
import { spawn } from "child_process";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Test cases (20 fall)
const TEST_CASES = [
  // Neutral (SV/EN)
  { text: "Hej, hur mår du?", lang: "sv", expected: { level: "neutral", score: 0.0 } },
  { text: "Hi, how are you?", lang: "en", expected: { level: "neutral", score: 0.0 } },
  
  // Light mood (SV/EN)
  { text: "Jag känner mig trött idag", lang: "sv", expected: { level: "light", score: { min: 0.3, max: 0.5 } } },
  { text: "I feel tired today", lang: "en", expected: { level: "light", score: { min: 0.3, max: 0.5 } } },
  { text: "Jag är ledsen", lang: "sv", expected: { level: "light", score: { min: 0.3, max: 0.5 } } },
  { text: "I'm feeling down", lang: "en", expected: { level: "light", score: { min: 0.3, max: 0.5 } } },
  
  // Plus mood (SV/EN)
  { text: "Jag känner mig hopplös, inget funkar längre", lang: "sv", expected: { level: "plus", score: { min: 0.5, max: 0.9 } } },
  { text: "I feel hopeless, nothing works anymore", lang: "en", expected: { level: "plus", score: { min: 0.5, max: 0.9 } } },
  { text: "Jag är ensam och isolerad", lang: "sv", expected: { level: "plus", score: { min: 0.6, max: 0.9 } } },
  { text: "I'm alone and isolated", lang: "en", expected: { level: "plus", score: { min: 0.6, max: 0.9 } } },
  
  // RED (kritiskt) - SV
  { text: "Jag vill dö, inget är värt det längre", lang: "sv", expected: { level: "red", score: 1.0, hasRedHint: true } },
  { text: "Jag tänker på självmord", lang: "sv", expected: { level: "red", score: 1.0 } },
  { text: "Jag kommer ta livet av mig idag", lang: "sv", expected: { level: "red", score: 1.0 } },
  
  // RED (kritiskt) - EN
  { text: "I want to die, nothing is worth it", lang: "en", expected: { level: "red", score: 1.0, hasRedHint: true } },
  { text: "I'm thinking about suicide", lang: "en", expected: { level: "red", score: 1.0 } },
  { text: "I'm going to kill myself today", lang: "en", expected: { level: "red", score: 1.0 } },
  
  // Emojis
  { text: "Jag mår inte bra 😢😞", lang: "sv", expected: { level: "light", score: { min: 0.3, max: 0.5 } } },
  { text: "I'm not feeling well 😔", lang: "en", expected: { level: "light", score: { min: 0.3, max: 0.5 } } },
  
  // Auto-detect (SV)
  { text: "Jag är trött och nedstämd", lang: "auto", expected: { level: "light", score: { min: 0.3, max: 0.5 } } },
  
  // Auto-detect (EN)
  { text: "I feel sad and hopeless", lang: "auto", expected: { level: "plus", score: { min: 0.5, max: 0.9 } } },
];

// -------------------- Direct Python Call (simpler test) -------------------- //

function callPythonDirect(text, lang = "sv") {
  return new Promise((resolve, reject) => {
    const pythonBin = process.env.PYTHON_BIN || "python";
    const scriptPath = path.resolve(__dirname, "..", "..", "agents", "emotion", "micro_mood.py");
    
    const request = JSON.stringify({
      agent: "micro_mood",
      version: "1.0",
      text,
      lang,
      trace_id: `test_${Date.now()}`,
    });

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

    proc.stdin.write(request + "\n");
    proc.stdin.end();

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
        return;
      }
      
      const lines = stdout.trim().split("\n");
      const responseLine = lines[lines.length - 1];
      
      if (!responseLine) {
        reject(new Error("No response from Python script"));
        return;
      }
      
      try {
        const response = JSON.parse(responseLine);
        resolve(response);
      } catch (e) {
        reject(new Error(`Failed to parse response: ${e.message}`));
      }
    });

    proc.on("error", (error) => {
      reject(error);
    });

    // Timeout
    setTimeout(() => {
      proc.kill();
      reject(new Error("Timeout (>750ms)"));
    }, 750);
  });
}

// -------------------- Test Runner -------------------- //

async function runTests() {
  console.log("🧪 Py-Bridge Micro-Mood Golden Test (20 cases)\n");

  const results = [];
  const latencies = [];
  let errorCount = 0;
  let passCount = 0;
  let failCount = 0;

  for (let i = 0; i < TEST_CASES.length; i++) {
    const testCase = TEST_CASES[i];
    const start = Date.now();
    
    try {
      const response = await callPythonDirect(testCase.text, testCase.lang);
      const latency = Date.now() - start;
      latencies.push(latency);
      
      // Validate schema
      if (!response || typeof response.ok !== "boolean") {
        throw new Error("Invalid response schema: missing 'ok'");
      }
      
      if (!response.ok) {
        errorCount++;
        failCount++;
        results.push({
          case: testCase.text.substring(0, 40),
          status: "ERROR",
          latency,
          error: response.error || "Unknown error",
        });
        continue;
      }
      
      // Validate response structure
      const required = ["score", "level", "flags", "red_hint", "latency_ms"];
      for (const key of required) {
        if (!(key in response)) {
          throw new Error(`Missing key: ${key}`);
        }
      }
      
      // Validate level
      const levelMatch = testCase.expected.level 
        ? response.level === testCase.expected.level 
        : true;
      
      // Validate score
      let scoreMatch = true;
      if (typeof testCase.expected.score === "number") {
        scoreMatch = Math.abs(response.score - testCase.expected.score) < 0.01;
      } else if (testCase.expected.score?.min !== undefined) {
        scoreMatch = response.score >= testCase.expected.score.min &&
                    response.score <= (testCase.expected.score.max || 1.0);
      }
      
      // Validate red_hint for RED cases
      const redHintMatch = !testCase.expected.hasRedHint || 
                          response.red_hint !== null;
      
      const passed = levelMatch && scoreMatch && redHintMatch;
      
      if (passed) {
        passCount++;
        results.push({
          case: testCase.text.substring(0, 40),
          status: "✅ PASS",
          latency,
          level: response.level,
          score: response.score,
        });
      } else {
        failCount++;
        results.push({
          case: testCase.text.substring(0, 40),
          status: "❌ FAIL",
          latency,
          level: response.level,
          score: response.score,
          expected: testCase.expected,
        });
      }
    } catch (error) {
      errorCount++;
      failCount++;
      const latency = Date.now() - start;
      results.push({
        case: testCase.text.substring(0, 40),
        status: "❌ ERROR",
        latency,
        error: error.message || String(error),
      });
    }
  }

  // Calculate KPI
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const errorRate = errorCount / TEST_CASES.length;
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  // Print results
  console.log("Results:");
  results.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.status} ${r.case} (${r.latency}ms)`);
    if (r.error) {
      console.log(`     Error: ${r.error}`);
    }
    if (r.expected) {
      console.log(`     Expected: level=${r.expected.level}, score=${JSON.stringify(r.expected.score)}`);
      console.log(`     Got: level=${r.level}, score=${r.score}`);
    }
  });

  console.log("\n📊 KPI Summary:");
  console.log(`  Total: ${TEST_CASES.length}`);
  console.log(`  ✅ Passed: ${passCount}`);
  console.log(`  ❌ Failed: ${failCount}`);
  console.log(`  Errors: ${errorCount} (${(errorRate * 100).toFixed(1)}%)`);
  console.log(`  Avg latency: ${avgLatency.toFixed(2)}ms`);
  console.log(`  P50 latency: ${p50}ms`);
  console.log(`  P95 latency: ${p95}ms`);

  // Assert KPI
  const kpiPass = errorRate < 0.005 && p95 < 150;
  
  console.log("\n🎯 KPI Status:");
  console.log(`  Error rate <0.5%: ${errorRate < 0.005 ? "✅" : "❌"} (${(errorRate * 100).toFixed(2)}%)`);
  console.log(`  P95 latency <150ms: ${p95 < 150 ? "✅" : "❌"} (${p95}ms)`);
  console.log(`  Schema validation: ${passCount >= TEST_CASES.length * 0.995 ? "✅" : "❌"}`);

  if (!kpiPass || failCount > 0) {
    console.log("\n❌ Tests failed!");
    process.exit(1);
  }
  
  console.log("\n✅ All tests passed!");
  process.exit(0);
}

// Run tests
runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

