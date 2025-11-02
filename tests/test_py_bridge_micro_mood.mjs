#!/usr/bin/env node
/**
 * Golden test för Py-Bridge Micro-Mood (steg 92)
 * 20 fall (SV/EN/emoji/RED) + latency assertion
 * 
 * KPI: p95 <150ms, error rate <0.5%, 100% schema-validerade svar
 */
import { callMicroMood, shutdownPyBridgePool } from "../backend/ai/py_bridge.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// -------------------- Test Cases (20 fall) -------------------- //

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
      const response = await callMicroMood(
        testCase.text,
        testCase.lang,
        `test_${Date.now()}_${i}`
      );
      
      const latency = Date.now() - start;
      latencies.push(latency);
      
      // Validate schema
      if (!response || typeof response.ok !== "boolean") {
        throw new Error("Invalid response schema");
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
        scoreMatch = response.score === testCase.expected.score;
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
    const icon = r.status.includes("PASS") ? "✅" : "❌";
    console.log(`  ${i + 1}. ${icon} ${r.case} (${r.latency}ms)`);
    if (r.error) {
      console.log(`     Error: ${r.error}`);
    }
    if (r.expected) {
      console.log(`     Expected: ${JSON.stringify(r.expected)}`);
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

  await shutdownPyBridgePool();

  if (!kpiPass || failCount > 0) {
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

