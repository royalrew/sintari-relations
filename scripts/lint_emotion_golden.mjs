#!/usr/bin/env node
/**
 * Emotion Golden Linter
 * Steg 99: Brain First Plan - Golden Test Validation
 * 
 * Validates golden test file integrity:
 * - Unique IDs
 * - No empty texts
 * - Valid languages (sv/en)
 * - Valid expected levels (neutral/light/plus/RED)
 * - Balanced distribution (50 SV/50 EN, 25 per level)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

// Try both sintari-relations/tests and root/tests
let GOLDEN = path.join(root, "tests", "golden", "emotion", "micro_mood_golden.jsonl");
if (!fs.existsSync(GOLDEN)) {
  // Try from project root
  GOLDEN = path.join(root, "..", "tests", "golden", "emotion", "micro_mood_golden.jsonl");
}
// Accept both "red" and "RED" (normalize to uppercase for validation)
const ALLOWED_LEVELS = new Set(["neutral", "light", "plus", "red", "RED"]);
const ALLOWED_LANGS = new Set(["sv", "en"]);

function die(msg) {
  console.error("Golden Lint ❌", msg);
  process.exit(1);
}

function warn(msg) {
  console.warn("Golden Lint ⚠️", msg);
}

if (!fs.existsSync(GOLDEN)) {
  die(`Saknar fil: ${GOLDEN}`);
}

const lines = fs.readFileSync(GOLDEN, "utf8").split("\n").filter(Boolean);

if (lines.length === 0) {
  die("Filen är tom.");
}

const ids = new Set();
const seenText = new Set();
const countsByLevel = { neutral: 0, light: 0, plus: 0, RED: 0 };
const countsByLang = { sv: 0, en: 0 };

for (let i = 0; i < lines.length; i++) {
  let row;
  try {
    row = JSON.parse(lines[i]);
  } catch (e) {
    die(`Rad ${i + 1}: Ogiltig JSON: ${e.message}`);
  }

  const { id, lang, text, expected } = row;

  // Schema validation
  if (!id || typeof id !== "string") {
    die(`Rad ${i + 1}: Saknar giltigt 'id'.`);
  }
  if (!lang || !ALLOWED_LANGS.has(lang)) {
    die(`Rad ${i + 1}: Ogiltigt 'lang' (${lang}). Måste vara 'sv' eller 'en'.`);
  }
  if (!text || typeof text !== "string" || !text.trim()) {
    die(`Rad ${i + 1}: Tom 'text'.`);
  }
  // Normalize "red" to "RED" for consistency
  const normalizedExpected = expected.toLowerCase() === "red" ? "RED" : expected;
  if (!expected || !ALLOWED_LEVELS.has(expected.toLowerCase())) {
    die(`Rad ${i + 1}: Ogiltigt 'expected' (${expected}). Måste vara neutral/light/plus/red/RED.`);
  }
  
  // Use normalized for counting
  const countKey = normalizedExpected;

  // Unique IDs
  if (ids.has(id)) {
    die(`Dubblett-id: ${id} (rad ${i + 1})`);
  }
  ids.add(id);

  // (Optional) Warning for exact text duplicates
  const tkey = text.trim().toLowerCase();
  if (seenText.has(tkey)) {
    warn(`Text-dubblett (varning): "${text.slice(0, 60)}..." (rad ${i + 1})`);
  }
  seenText.add(tkey);

  countsByLevel[countKey]++;
  countsByLang[lang]++;
}

// Balance requirements
const total = lines.length;
if (total !== 100) {
  die(`Totalt antal rader måste vara 100 (nu ${total}).`);
}

// Check balance (strict: must be exactly 25 per level)
for (const lvl of Object.keys(countsByLevel)) {
  const count = countsByLevel[lvl];
  if (count !== 25) {
    warn(`Nivån '${lvl}' är ${count} (rekommenderat: exakt 25).`);
    // Allow small deviation (24-26) but warn
    if (count < 24 || count > 26) {
      die(`Nivån '${lvl}' måste vara ca 25 (nu ${count}, avvikelse för stor).`);
    }
  }
}

if (countsByLang.sv !== 50 || countsByLang.en !== 50) {
  die(
    `Språkbalans måste vara 50/50 (sv=${countsByLang.sv}, en=${countsByLang.en}).`
  );
}

// Success
console.log("Golden Lint ✅ OK");
console.log(`  Total: ${total} testfall`);
console.log(`  Språk: SV=${countsByLang.sv}, EN=${countsByLang.en}`);
console.log(`  Nivåer: neutral=${countsByLevel.neutral}, light=${countsByLevel.light}, plus=${countsByLevel.plus}, RED=${countsByLevel.RED}`);
process.exit(0);

