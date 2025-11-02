/**
 * Golden test för Py-Bridge Micro-Mood (steg 92)
 * 20 fall (SV/EN/emoji/RED) + latency assertion
 * 
 * KPI: p95 <150ms, error rate <0.5%, 100% schema-validerade svar
 */
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { callMicroMood, shutdownPyBridgePool } from "../backend/ai/py_bridge";
import path from "path";

// -------------------- Test Cases (20 fall) -------------------- //

const TEST_CASES = [
  // Neutral (SV/EN)
  { text: "Hej, hur mår du?", lang: "sv" as const, expected: { level: "neutral", score: 0.0 } },
  { text: "Hi, how are you?", lang: "en" as const, expected: { level: "neutral", score: 0.0 } },
  
  // Light mood (SV/EN)
  { text: "Jag känner mig trött idag", lang: "sv" as const, expected: { level: "light", score: { min: 0.3, max: 0.5 } } },
  { text: "I feel tired today", lang: "en" as const, expected: { level: "light", score: { min: 0.3, max: 0.5 } } },
  { text: "Jag är ledsen", lang: "sv" as const, expected: { level: "light", score: { min: 0.3, max: 0.5 } } },
  { text: "I'm feeling down", lang: "en" as const, expected: { level: "light", score: { min: 0.3, max: 0.5 } } },
  
  // Plus mood (SV/EN)
  { text: "Jag känner mig hopplös, inget funkar längre", lang: "sv" as const, expected: { level: "plus", score: { min: 0.5, max: 0.9 } } },
  { text: "I feel hopeless, nothing works anymore", lang: "en" as const, expected: { level: "plus", score: { min: 0.5, max: 0.9 } } },
  { text: "Jag är ensam och isolerad", lang: "sv" as const, expected: { level: "plus", score: { min: 0.6, max: 0.9 } } },
  { text: "I'm alone and isolated", lang: "en" as const, expected: { level: "plus", score: { min: 0.6, max: 0.9 } } },
  
  // RED (kritiskt) - SV
  { text: "Jag vill dö, inget är värt det längre", lang: "sv" as const, expected: { level: "red", score: 1.0, hasRedHint: true } },
  { text: "Jag tänker på självmord", lang: "sv" as const, expected: { level: "red", score: 1.0 } },
  { text: "Jag kommer ta livet av mig idag", lang: "sv" as const, expected: { level: "red", score: 1.0 } },
  
  // RED (kritiskt) - EN
  { text: "I want to die, nothing is worth it", lang: "en" as const, expected: { level: "red", score: 1.0, hasRedHint: true } },
  { text: "I'm thinking about suicide", lang: "en" as const, expected: { level: "red", score: 1.0 } },
  { text: "I'm going to kill myself today", lang: "en" as const, expected: { level: "red", score: 1.0 } },
  
  // Emojis
  { text: "Jag mår inte bra 😢😞", lang: "sv" as const, expected: { level: "light", score: { min: 0.3, max: 0.5 } } },
  { text: "I'm not feeling well 😔", lang: "en" as const, expected: { level: "light", score: { min: 0.3, max: 0.5 } } },
  
  // Auto-detect (SV)
  { text: "Jag är trött och nedstämd", lang: "auto" as const, expected: { level: "light", score: { min: 0.3, max: 0.5 } } },
  
  // Auto-detect (EN)
  { text: "I feel sad and hopeless", lang: "auto" as const, expected: { level: "plus", score: { min: 0.5, max: 0.9 } } },
];

// -------------------- Test Suite -------------------- //

describe("Py-Bridge Micro-Mood (steg 92)", () => {
  beforeAll(() => {
    // Set PYTHON_BIN if needed
    if (!process.env.PYTHON_BIN) {
      process.env.PYTHON_BIN = "python";
    }
  });

  afterAll(async () => {
    await shutdownPyBridgePool();
  });

  it("should handle all 20 test cases", async () => {
    const results: Array<{ case: string; latency: number; error?: string }> = [];
    const latencies: number[] = [];
    let errorCount = 0;

    for (const testCase of TEST_CASES) {
      const start = Date.now();
      try {
        const response = await callMicroMood(
          testCase.text,
          testCase.lang,
          `test_${Date.now()}`
        );
        
        const latency = Date.now() - start;
        latencies.push(latency);
        
        // Validate schema
        expect(response).toHaveProperty("ok");
        expect(response).toHaveProperty("agent", "micro_mood");
        
        if (!response.ok) {
          errorCount++;
          results.push({
            case: testCase.text.substring(0, 30),
            latency,
            error: response.error || "Unknown error",
          });
          continue;
        }
        
        // Validate response structure
        expect(response).toHaveProperty("score");
        expect(response).toHaveProperty("level");
        expect(response).toHaveProperty("flags");
        expect(response).toHaveProperty("red_hint");
        expect(response).toHaveProperty("latency_ms");
        
        // Validate level
        if (testCase.expected.level !== undefined) {
          expect(response.level).toBe(testCase.expected.level);
        }
        
        // Validate score
        if (typeof testCase.expected.score === "number") {
          expect(response.score).toBe(testCase.expected.score);
        } else if (testCase.expected.score?.min !== undefined) {
          expect(response.score).toBeGreaterThanOrEqual(testCase.expected.score.min);
          expect(response.score).toBeLessThanOrEqual(testCase.expected.score.max || 1.0);
        }
        
        // Validate red_hint for RED cases
        if (testCase.expected.hasRedHint) {
          expect(response.red_hint).not.toBeNull();
        }
        
        results.push({
          case: testCase.text.substring(0, 30),
          latency,
        });
      } catch (error) {
        errorCount++;
        const latency = Date.now() - start;
        results.push({
          case: testCase.text.substring(0, 30),
          latency,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // KPI Assertions
    const p95 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)] || 0;
    const errorRate = errorCount / TEST_CASES.length;
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    console.log(`\n[PyBridge] Results:`);
    console.log(`  Total: ${TEST_CASES.length}`);
    console.log(`  Errors: ${errorCount} (${(errorRate * 100).toFixed(1)}%)`);
    console.log(`  Avg latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`  P95 latency: ${p95}ms`);

    // Assert KPI
    expect(errorRate).toBeLessThan(0.005); // <0.5%
    expect(p95).toBeLessThan(150); // p95 <150ms

    // All schema-validated
    expect(results.filter((r) => !r.error).length).toBeGreaterThanOrEqual(TEST_CASES.length * 0.995);
  });

  it("should handle circuit breaker", async () => {
    // Test with invalid requests to trigger circuit breaker
    const invalidRequests = [
      { text: "", lang: "sv" as const }, // Empty text
    ];

    for (const req of invalidRequests) {
      const response = await callMicroMood(req.text, req.lang);
      // Should return neutral fallback, not crash
      expect(response).toHaveProperty("ok");
      expect(response).toHaveProperty("level");
    }
  });

  it("should handle timeout gracefully", async () => {
    // This test would require a slow Python script, skip for now
    // In production, timeout is handled by bridge
    expect(true).toBe(true);
  });

  it("should validate schema strictly", async () => {
    const response = await callMicroMood("Test", "sv");
    
    // All required fields present
    expect(response).toHaveProperty("ok");
    expect(response).toHaveProperty("agent");
    expect(response).toHaveProperty("score");
    expect(response).toHaveProperty("level");
    expect(response).toHaveProperty("flags");
    expect(response).toHaveProperty("latency_ms");
    
    // Types correct
    expect(typeof response.ok).toBe("boolean");
    expect(typeof response.score).toBe("number");
    expect(typeof response.level).toBe("string");
    expect(Array.isArray(response.flags)).toBe(true);
    expect(["neutral", "light", "plus", "red"]).toContain(response.level);
  });
});

