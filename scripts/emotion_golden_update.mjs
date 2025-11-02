#!/usr/bin/env node
/**
 * Emotion Golden Update Script
 * Steg 99: Brain First Plan - HITL Golden Updates
 * 
 * Proposes safe updates to golden test cases (adjacent levels only)
 * Never downgrades RED → other levels
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const mode = args.includes("--apply") ? "apply" : "propose";
const approvedByMatch = args.find((a) => a.startsWith("--approved-by="));
const approvedBy = approvedByMatch ? approvedByMatch.split("=")[1] : null;

// Try both sintari-relations/tests and root/tests
let golden = path.join(root, "tests", "golden", "emotion", "micro_mood_golden.jsonl");
if (!fs.existsSync(golden)) {
  golden = path.join(root, "..", "tests", "golden", "emotion", "micro_mood_golden.jsonl");
}
const report = path.join(root, "reports", "emotion_golden_report.json");
const diffOut = path.join(root, "reports", "emotion_golden_proposed.diff.json");
const changelog = path.join(root, "docs", "EMOTION_GOLDEN_CHANGELOG.md");

if (!fs.existsSync(report)) {
  console.error("[Update] Missing report. Run eval first: node scripts/emotion_golden_eval.mjs");
  process.exit(1);
}

const rep = JSON.parse(fs.readFileSync(report, "utf8"));
const misses = rep.misses || [];

/**
 * Safe swap: only allow adjacent level changes
 * Never downgrade from RED
 */
const safeSwap = (exp, det) => {
  const order = ["neutral", "light", "plus", "red"];
  const a = order.indexOf(exp);
  const b = order.indexOf(det);

  // Never downgrade from RED
  if (exp === "red" && det !== "red") {
    return false;
  }

  // Only allow adjacent levels (neighbors)
  return Math.abs(a - b) === 1;
};

if (!fs.existsSync(golden)) {
  console.error(`[Update] Golden file not found: ${golden}`);
  process.exit(1);
}

const lines = fs.readFileSync(golden, "utf8").trim().split("\n");
const rows = lines.map((l) => JSON.parse(l));
const idMap = Object.fromEntries(rows.map((r) => [r.id, r]));

const proposals = [];

for (const m of misses) {
  const row = idMap[m.id];
  if (!row) continue;

  if (safeSwap(row.expected, m.detected)) {
    proposals.push({
      id: row.id,
      from: row.expected,
      to: m.detected,
      text: row.text.substring(0, 100), // Truncate
      lang: row.lang,
    });
  }
}

if (mode === "propose") {
  const proposalsDir = path.dirname(diffOut);
  if (!fs.existsSync(proposalsDir)) {
    fs.mkdirSync(proposalsDir, { recursive: true });
  }

  fs.writeFileSync(
    diffOut,
    JSON.stringify(
      {
        proposals,
        total_misses: misses.length,
        safe_proposals: proposals.length,
        generated_utc: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log(`[Update] Proposals → ${diffOut} (${proposals.length} safe proposals from ${misses.length} misses)`);
  process.exit(0);
}

if (mode === "apply") {
  if (!approvedBy) {
    console.error("[Update] --approved-by=<name> required for apply mode");
    process.exit(1);
  }

  const pset = new Set(proposals.map((p) => p.id));

  const updated = rows.map((r) => {
    if (!pset.has(r.id)) return r;

    const p = proposals.find((x) => x.id === r.id);
    return {
      ...r,
      expected: p.to,
      reviewed_by: approvedBy,
      reviewed_at: new Date().toISOString(),
      source: "update",
    };
  });

  // Ensure directory exists
  const goldenDir = path.dirname(golden);
  if (!fs.existsSync(goldenDir)) {
    fs.mkdirSync(goldenDir, { recursive: true });
  }

  fs.writeFileSync(
    golden,
    updated.map((r) => JSON.stringify(r)).join("\n") + "\n"
  );

  // Append to changelog
  const changelogDir = path.dirname(changelog);
  if (!fs.existsSync(changelogDir)) {
    fs.mkdirSync(changelogDir, { recursive: true });
  }

  const changelogEntry = `\n- ${new Date().toISOString()}: ${proposals.length} updates by ${approvedBy} (${proposals.map((p) => `${p.id}: ${p.from}→${p.to}`).join(", ")})`;
  fs.appendFileSync(changelog, changelogEntry);

  console.log(`[Update] Applied ${proposals.length} updates to golden.`);
  console.log(`[Update] Changelog updated: ${changelog}`);
}

