import { describe, test, expect } from "@jest/globals";

/**
 * Golden-tester för Reception-policy
 * Säkerställer att receptionisten aldrig känns "krävande"
 */

// Mock implementation av composeReply (förenklad)
function composeReply(ctx: any, msg: string): { text: string; asked: boolean } {
  const userTurns = ctx.turns?.filter((t: any) => t.role === "user").length || 0;
  const askedInRow = ctx.askedInRow || 0;
  const timeSinceLastAsk = ctx.lastAskedAt ? Date.now() - ctx.lastAskedAt : Infinity;
  
  let text = "Jag är med dig.";
  let asked = false;
  
  // Max 1 fråga varannan tur
  if (userTurns > 0 && userTurns % 2 === 0 && timeSinceLastAsk > 15000 && askedInRow < 1) {
    if (msg.length < 12) {
      text += " Vill du sätta lite fler ord på det?";
      asked = true;
    }
  }
  
  return { text, asked };
}

// Mock implementation av shouldRewrite
function shouldRewrite(prev: string[], cand: string, threshold = 0.6): boolean {
  const tok = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
  
  for (const p of prev) {
    const A = tok(p);
    const B = tok(cand);
    const inter = [...A].filter((x) => B.has(x)).length;
    const jac = inter / (A.size + B.size - inter || 1);
    if (jac >= threshold) return true;
  }
  return false;
}

describe("Reception Policy Tests", () => {
  test("max 1 fråga varannan tur", () => {
    const ctx: any = {
      mode: "lagom",
      turns: [{ role: "user", text: "Jag är stressad men vet inte riktigt." }],
      askedInRow: 0,
      engagement: 0,
    };

    const r1 = composeReply(ctx, "Jag är stressad men vet inte riktigt.");
    const questionCount = (r1.text.match(/\?/g) || []).length;
    expect(questionCount).toBeLessThanOrEqual(1);

    const ctx2 = {
      ...ctx,
      askedInRow: 1,
      lastAskedAt: Date.now() - 1000, // Nyligen frågat
    };

    const r2 = composeReply(ctx2, "Fortfarande osäker.");
    expect(r2.text.includes("?")).toBe(false);
  });

  test("anti-repeat triggers rewrite on near-duplicate", () => {
    const prev = ["Jag är med dig. Jag hör dig."];
    const cand = "Jag är med dig, jag hör dig.";
    expect(shouldRewrite(prev, cand, 0.5)).toBe(true);
  });

  test("anti-repeat does not trigger on different content", () => {
    const prev = ["Jag är med dig. Jag hör dig."];
    const cand = "Vad vill du prata om idag?";
    expect(shouldRewrite(prev, cand, 0.5)).toBe(false);
  });

  test("no double questions in consecutive replies", () => {
    const ctx1: any = {
      turns: [{ role: "user", text: "Hej" }],
      askedInRow: 0,
      lastAskedAt: 0,
    };

    const r1 = composeReply(ctx1, "Hej");
    const ctx2 = {
      ...ctx1,
      askedInRow: r1.asked ? 1 : 0,
      lastAskedAt: r1.asked ? Date.now() : 0,
      turns: [...ctx1.turns, { role: "assistant", text: r1.text }, { role: "user", text: "Fortfarande osäker" }],
    };

    const r2 = composeReply(ctx2, "Fortfarande osäker");
    expect(r2.asked).toBe(false);
  });
});

