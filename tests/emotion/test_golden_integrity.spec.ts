/**
 * Golden Integrity Test
 * Steg 99: Brain First Plan - CI Validation
 * 
 * Validates golden test file structure and balance
 */

import fs from "fs";
import path from "path";

// Try both sintari-relations/tests and root/tests
let GOLDEN = path.join(
  process.cwd(),
  "tests",
  "golden",
  "emotion",
  "micro_mood_golden.jsonl"
);
if (!fs.existsSync(GOLDEN)) {
  GOLDEN = path.join(
    process.cwd(),
    "..",
    "tests",
    "golden",
    "emotion",
    "micro_mood_golden.jsonl"
  );
}
// Accept both "red" and "RED" (normalize for validation)
const ALLOWED_LEVELS = new Set(["neutral", "light", "plus", "red", "RED"]);
const ALLOWED_LANGS = new Set(["sv", "en"]);

type Row = {
  id: string;
  lang: "sv" | "en";
  text: string;
  expected: "neutral" | "light" | "plus" | "RED";
  source?: string;
  reviewed_by?: string;
  reviewed_at?: string;
};

describe("Golden Integrity & Balance", () => {
  test("Golden file exists and is valid", () => {
    expect(fs.existsSync(GOLDEN)).toBe(true);
  });

  test("Golden file has exactly 100 test cases", () => {
    if (!fs.existsSync(GOLDEN)) {
      console.log("[CI] Golden file not found, skipping integrity test");
      return;
    }

    const lines = fs.readFileSync(GOLDEN, "utf8").trim().split("\n").filter(Boolean);
    expect(lines.length).toBe(100);
  });

  test("All rows are valid JSON with required fields", () => {
    if (!fs.existsSync(GOLDEN)) {
      return;
    }

    const lines = fs.readFileSync(GOLDEN, "utf8").trim().split("\n").filter(Boolean);

    lines.forEach((ln, i) => {
      let r: Row;
      try {
        r = JSON.parse(ln) as Row;
      } catch (e) {
        throw new Error(`Rad ${i + 1}: Ogiltig JSON: ${e instanceof Error ? e.message : String(e)}`);
      }

      expect(typeof r.id).toBe("string");
      expect(r.id.length).toBeGreaterThan(0);
      expect(ALLOWED_LANGS.has(r.lang)).toBe(true);
      expect(typeof r.text).toBe("string");
      expect(r.text.trim().length).toBeGreaterThan(0);
      // Normalize "red" to "RED" for validation
      const normalizedExpected = r.expected.toLowerCase() === "red" ? "RED" : r.expected;
      expect(ALLOWED_LEVELS.has(normalizedExpected.toLowerCase()) || ALLOWED_LEVELS.has(normalizedExpected)).toBe(true);
    });
  });

  test("All IDs are unique", () => {
    if (!fs.existsSync(GOLDEN)) {
      return;
    }

    const lines = fs.readFileSync(GOLDEN, "utf8").trim().split("\n").filter(Boolean);
    const ids = new Set<string>();

    lines.forEach((ln, i) => {
      const r = JSON.parse(ln) as Row;
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
    });

    expect(ids.size).toBe(100);
  });

  test("Language balance: 50 SV / 50 EN", () => {
    if (!fs.existsSync(GOLDEN)) {
      return;
    }

    const lines = fs.readFileSync(GOLDEN, "utf8").trim().split("\n").filter(Boolean);
    const countsByLang: Record<string, number> = { sv: 0, en: 0 };

    lines.forEach((ln) => {
      const r = JSON.parse(ln) as Row;
      countsByLang[r.lang]++;
    });

    expect(countsByLang.sv).toBe(50);
    expect(countsByLang.en).toBe(50);
  });

  test("Level balance: ~25 per level (neutral/light/plus/RED)", () => {
    if (!fs.existsSync(GOLDEN)) {
      return;
    }

    const lines = fs.readFileSync(GOLDEN, "utf8").trim().split("\n").filter(Boolean);
    const countsByLevel: Record<string, number> = {
      neutral: 0,
      light: 0,
      plus: 0,
      RED: 0,
    };

    lines.forEach((ln) => {
      const r = JSON.parse(ln) as Row;
      // Normalize "red" to "RED"
      const key = r.expected.toLowerCase() === "red" ? "RED" : r.expected;
      countsByLevel[key]++;
    });

    // Allow 24-26 per level (balanced around 25)
    expect(countsByLevel.neutral).toBeGreaterThanOrEqual(24);
    expect(countsByLevel.neutral).toBeLessThanOrEqual(26);
    expect(countsByLevel.light).toBeGreaterThanOrEqual(24);
    expect(countsByLevel.light).toBeLessThanOrEqual(26);
    expect(countsByLevel.plus).toBeGreaterThanOrEqual(24);
    expect(countsByLevel.plus).toBeLessThanOrEqual(26);
    expect(countsByLevel.RED).toBeGreaterThanOrEqual(24);
    expect(countsByLevel.RED).toBeLessThanOrEqual(26);
    
    // Total must still be 100
    const total = countsByLevel.neutral + countsByLevel.light + countsByLevel.plus + countsByLevel.RED;
    expect(total).toBe(100);
  });

  test("No empty texts", () => {
    if (!fs.existsSync(GOLDEN)) {
      return;
    }

    const lines = fs.readFileSync(GOLDEN, "utf8").trim().split("\n").filter(Boolean);

    lines.forEach((ln, i) => {
      const r = JSON.parse(ln) as Row;
      expect(r.text.trim().length).toBeGreaterThan(0);
    });
  });
});

