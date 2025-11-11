#!/usr/bin/env node
/**
 * Apply SI Proposals
 * PR6: SI-loop scaffold
 * 
 * Applies proposals to golden files
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function loadJsonl(p) {
  if (!fs.existsSync(p)) {
    return [];
  }
  
  return fs.readFileSync(p, "utf-8")
    .split("\n")
    .filter(l => l.trim())
    .map(l => JSON.parse(l));
}

function getExistingIds(goldenPath) {
  if (!fs.existsSync(goldenPath)) {
    return new Set();
  }
  
  const lines = loadJsonl(goldenPath);
  return new Set(lines.map(l => l.case_id || l.id).filter(Boolean));
}

function appendToJsonl(goldenPath, item) {
  const dir = path.dirname(goldenPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Dedupe: check if case_id already exists
  const existingIds = getExistingIds(goldenPath);
  const itemId = item.case_id || item.id;
  
  if (existingIds.has(itemId)) {
    console.log(`[Apply SI] Skipping duplicate case_id: ${itemId}`);
    return false;
  }
  
  // Append
  fs.appendFileSync(goldenPath, JSON.stringify(item) + "\n");
  console.log(`[Apply SI] Added ${itemId} to ${goldenPath}`);
  return true;
}

function main() {
  console.log("[Apply SI] Applying proposals...");
  
  const proposalsPath = path.join(ROOT, "reports", "si", "proposals.jsonl");
  
  if (!fs.existsSync(proposalsPath)) {
    console.log("[Apply SI] No proposals found");
    return;
  }
  
  const proposals = loadJsonl(proposalsPath);
  
  if (!proposals.length) {
    console.log("[Apply SI] No proposals to apply");
    return;
  }
  
  let applied = 0;
  let skipped = 0;
  
  for (const prop of proposals) {
    const proposal = prop.proposal;
    
    if (!proposal || !proposal.golden_path) {
      console.warn("[Apply SI] Invalid proposal, skipping");
      skipped++;
      continue;
    }
    
    if (proposal.action !== "append") {
      console.log(`[Apply SI] Action ${proposal.action} not supported`);
      skipped++;
      continue;
    }
    
    const goldenPath = path.join(ROOT, proposal.golden_path);
    const item = proposal.item;
    
    if (!item) {
      console.warn("[Apply SI] No item in proposal");
      skipped++;
      continue;
    }
    
    const success = appendToJsonl(goldenPath, item);
    
    if (success) {
      applied++;
    } else {
      skipped++;
    }
  }
  
  console.log(`[Apply SI] Applied ${applied} proposals, skipped ${skipped}`);
}

main();

