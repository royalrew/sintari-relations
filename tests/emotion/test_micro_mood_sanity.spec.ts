/**
 * Micro-Mood Sanity Tests
 * Steg 91: Brain First Plan - Quick validation
 * 
 * Basic sanity checks for improved micro_mood.py
 */

import { callMicroMood, shutdownPyBridgePool } from "@/backend/ai/py_bridge";

// Helper function to call detector and return level
async function det(text: string, lang: "sv" | "en" | "auto"): Promise<string> {
  const result = await callMicroMood(text, lang);
  if (!result.ok) {
    throw new Error(`Detection failed: ${result.error || "Unknown error"}`);
  }
  return (result.level || "neutral").toLowerCase();
}

const cases = [
  { t: "Jag känner mig trygg och uppskattad ❤️", exp: "plus", lang: "sv" },
  { t: "Vi bråkar ibland om städning men älskar varandra", exp: "light", lang: "sv" },
  { t: "Jag känner mig hopplös och värdelös 💔", exp: "red", lang: "sv" },
  { t: "We feel safe and close ❤️", exp: "plus", lang: "en" },
  { t: "It's mostly fine, small annoyances", exp: "light", lang: "en" },
  { t: "I feel trapped and worthless 💔", exp: "red", lang: "en" },
  // New cases from requirements
  { t: "Vi snäser ibland, inte hela världen.", exp: "light", lang: "sv" },
  { t: "We get a bit tense about chores.", exp: "light", lang: "en" },
  { t: "Jag känner mig trygg och uppskattad ❤️", exp: "plus", lang: "sv" },
  { t: "We feel safe and close ❤️", exp: "plus", lang: "en" },
  { t: "Jag orkar inte mer, allt känns hopplöst 💔", exp: "red", lang: "sv" },
  { t: "He says it never happened; I feel trapped.", exp: "red", lang: "en" },
  { t: "Nothing special going on; we're steady.", exp: "neutral", lang: "en" },
  { t: "Relationen känns stabil och vardaglig.", exp: "neutral", lang: "sv" },
];

describe("Micro-Mood Sanity", () => {
  // Cleanup after all tests
  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500)); // Give workers time to finish
    shutdownPyBridgePool();
    await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for processes to exit
  });

  test("basic mood detection", async () => {
    // Test only first case to check if bridge works
    const c = cases[0];
    
    console.log(`[Sanity] Testing: "${c.t.substring(0, 50)}..."`);
    
    const timeout = 3000; // 3 seconds max per call
    
    const r = await Promise.race([
      callMicroMood(c.t, c.lang as "sv" | "en" | "auto"),
      new Promise<any>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
      ),
    ]).catch((e) => {
      console.error(`[Sanity] Error:`, e);
      return { ok: false, error: e.message };
    });

    expect(r).toBeDefined();
    expect(r.ok).toBe(true);
    
    if (r.ok) {
      const detected = (r.level || "neutral").toLowerCase();
      console.log(`[Sanity] Detected: ${detected}, Expected: ${c.exp}`);
      expect(["neutral", "light", "plus", "red", "RED"].includes(detected)).toBe(true);
    } else {
      console.warn(`[Sanity] Call failed:`, r.error);
    }
  }, 10000); // 10 second total timeout

  // New specific test cases
  test("light via mild negativity (tension)", async () => {
    expect(await det("Vi snäser ibland, inte hela världen.", "sv")).toBe("light");
    expect(await det("We get a bit tense about chores.", "en")).toBe("light");
  }, 15000);

  test("plus via evidence floor", async () => {
    expect(await det("Jag känner mig trygg och uppskattad ❤️", "sv")).toBe("plus");
    expect(await det("We feel safe and close ❤️", "en")).toBe("plus");
  }, 15000);

  test("RED hard rules", async () => {
    expect(await det("Jag orkar inte mer, allt känns hopplöst 💔", "sv")).toBe("red");
    expect(await det("He says it never happened; I feel trapped.", "en")).toBe("red");
  }, 15000);

  test("neutral anchors", async () => {
    expect(await det("Nothing special going on; we're steady.", "en")).toBe("neutral");
    expect(await det("Relationen känns stabil och vardaglig.", "sv")).toBe("neutral");
  }, 15000);
});

