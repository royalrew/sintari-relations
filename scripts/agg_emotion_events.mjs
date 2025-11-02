#!/usr/bin/env node
/**
 * Emotion Events Aggregator - Uppdaterar KPI-JSON med emotion-statistik
 * Steg 99: Brain First Plan - Uplift Telemetry
 * 
 * Läser emotion_events/*.jsonl (sista 24h) och uppdaterar reports/pyramid_live_kpis.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, "..");
const evDir = path.join(root, "reports", "emotion_events");
const kpiFile = path.join(root, "reports", "pyramid_live_kpis.json");
const lockFile = path.join(root, "reports", ".agg.lock");

// Lock management: prevent parallel aggregations
function acquireLock() {
  if (fs.existsSync(lockFile)) {
    const lockData = JSON.parse(fs.readFileSync(lockFile, "utf8"));
    const age = Date.now() - lockData.timestamp;
    // If lock is older than 60 seconds, assume crashed and remove it
    if (age > 60000) {
      fs.unlinkSync(lockFile);
      console.error("[Agg] Removed stale lock file");
    } else {
      throw new Error(`Aggregation already running (PID ${lockData.pid})`);
    }
  }
  
  fs.writeFileSync(lockFile, JSON.stringify({
    pid: process.pid,
    timestamp: Date.now(),
  }));
}

function releaseLock() {
  if (fs.existsSync(lockFile)) {
    fs.unlinkSync(lockFile);
  }
}

function readLast24h() {
  if (!fs.existsSync(evDir)) return [];
  
  const now = new Date();
  const d0 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const days = new Set([
    now.toISOString().slice(0, 10),
    d0.toISOString().slice(0, 10)
  ]);

  let rows = [];
  for (const d of Array.from(days)) {
    const f = path.join(evDir, `${d}.jsonl`);
    if (!fs.existsSync(f)) continue;
    
    const data = fs.readFileSync(f, "utf8").split("\n").filter(Boolean);
    for (const line of data) {
      try {
        const e = JSON.parse(line);
        const ts = new Date(e.ts);
        if (ts >= d0 && ts <= now) {
          rows.push(e);
        }
      } catch (err) {
        // Skip invalid lines
      }
    }
  }
  return rows;
}

function pXX(nums, p) {
  if (nums.length === 0) return 0;
  const a = nums.slice().sort((x, y) => x - y);
  const idx = Math.ceil((p / 100) * a.length) - 1;
  return a[Math.max(0, Math.min(a.length - 1, idx))];
}

function sha1(s) {
  return createHash("sha1").update(s).digest("hex");
}

function main() {
  const ev = readLast24h();
  
  const counts = { neutral: 0, light: 0, plus: 0, red: 0 };
  const latencies = [];
  const svScores = [];
  const enScores = [];
  
  for (const e of ev) {
    const level = e.level.toLowerCase();
    counts[level] = (counts[level] ?? 0) + 1;
    latencies.push(e.latency_ms || 0);
    
    if (e.lang === "sv") {
      svScores.push(e.score || 0);
    } else if (e.lang === "en") {
      enScores.push(e.score || 0);
    }
  }

  const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const sv_en_gap = Math.abs(mean(svScores) - mean(enScores));

  const emotion = {
    window: "24h",
    events: ev.length,
    counts_by_level: counts,
    p50_latency_ms: Math.round(pXX(latencies, 50)),
    p95_latency_ms: Math.round(pXX(latencies, 95)),
    red_rate: ev.length ? +(counts["red"] / ev.length).toFixed(3) : 0,
    sv_en_gap: +sv_en_gap.toFixed(3),
    generated_utc: new Date().toISOString()
  };

  // Patch KPI file
  let kpi = {};
  if (fs.existsSync(kpiFile)) {
    try {
      kpi = JSON.parse(fs.readFileSync(kpiFile, "utf8"));
    } catch (err) {
      console.warn(`[Agg] Failed to read existing KPI file: ${err.message}`);
    }
  }

  kpi.emotion = emotion;
  const out = JSON.stringify(kpi, null, 2);
  
  // Atomic write
  fs.writeFileSync(kpiFile + ".tmp", out);
  fs.renameSync(kpiFile + ".tmp", kpiFile);

  // Fingerprint
  const fp = sha1(out);
  console.log(
    `Emotion KPI updated. events=${ev.length} p95=${emotion.p95_latency_ms}ms gap=${emotion.sv_en_gap.toFixed(3)} sha1=${fp}`
  );
}

// Main execution with lock
try {
  acquireLock();
  main();
  releaseLock();
} catch (error) {
  releaseLock();
  console.error(`[Agg] Error: ${error.message}`);
  process.exit(1);
}

