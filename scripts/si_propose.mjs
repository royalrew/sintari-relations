#!/usr/bin/env node
/**
 * SI Propose - Self-Improvement Proposal Generator
 * PR6: SI-loop scaffold
 * 
 * Generates proposals from memory/emotion misses
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

async function runPython(script, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("python", [script, ...args], {
      cwd: ROOT,
      stdio: "inherit",
    });
    
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Python script exited with code ${code}`));
      }
    });
  });
}

async function main() {
  console.log("[SI Propose] Starting proposal generation...");
  
  const proposalsPath = path.join(ROOT, "reports", "si", "proposals.jsonl");
  
  // Ensure output directory exists
  const proposalsDir = path.dirname(proposalsPath);
  if (!fs.existsSync(proposalsDir)) {
    fs.mkdirSync(proposalsDir, { recursive: true });
  }
  
  // Clear existing proposals
  if (fs.existsSync(proposalsPath)) {
    fs.writeFileSync(proposalsPath, "");
  }
  
  let memoryCount = 0;
  let emotionCount = 0;
  
  try {
    // Generate memory proposals
    const memoryMissPath = path.join(ROOT, "runs", "memory", "misses.jsonl");
    
    if (fs.existsSync(memoryMissPath)) {
      console.log("[SI Propose] Generating memory proposals...");
      await runPython("agents/self_improve/si_memory_plan.py", [
        memoryMissPath,
        proposalsPath,
        "5"
      ]);
      
      // Count memory proposals
      const lines = fs.readFileSync(proposalsPath, "utf-8")
        .split("\n")
        .filter(l => l.trim());
      memoryCount = lines.filter(l => {
        try {
          return JSON.parse(l).area === "memory";
        } catch {
          return false;
        }
      }).length;
    } else {
      console.log("[SI Propose] No memory misses found, skipping");
    }
  } catch (error) {
    console.warn(`[SI Propose] Memory proposal failed: ${error.message}`);
  }
  
  try {
    // Generate emotion proposals
    const emotionEvalPath = path.join(ROOT, "reports", "emotion_golden_report.json");
    
    if (fs.existsSync(emotionEvalPath)) {
      console.log("[SI Propose] Generating emotion proposals...");
      await runPython("agents/self_improve/si_emotion_plan.py", [
        emotionEvalPath,
        proposalsPath,
        "5"
      ]);
      
      // Count emotion proposals
      const lines = fs.readFileSync(proposalsPath, "utf-8")
        .split("\n")
        .filter(l => l.trim());
      emotionCount = lines.filter(l => {
        try {
          return JSON.parse(l).area === "emotion";
        } catch {
          return false;
        }
      }).length;
    } else {
      console.log("[SI Propose] No emotion eval found, skipping");
    }
  } catch (error) {
    console.warn(`[SI Propose] Emotion proposal failed: ${error.message}`);
  }
  
  const total = memoryCount + emotionCount;
  console.log(`[SI Propose] Generated ${total} proposals (memory: ${memoryCount}, emotion: ${emotionCount})`);
  
  // Log telemetry
  try {
    await runPython("backend/metrics/worldclass_live.py", [
      "si",
      total.toString(),
      memoryCount.toString(),
      emotionCount.toString()
    ]);
  } catch (error) {
    console.warn(`[SI Propose] Telemetry logging failed: ${error.message}`);
  }
  
  if (total === 0) {
    console.log("[SI Propose] No proposals generated");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[SI Propose] Fatal error:", error);
  process.exit(1);
});

