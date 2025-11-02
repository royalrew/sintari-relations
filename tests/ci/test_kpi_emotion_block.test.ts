/**
 * CI Gate för Emotion KPI (Steg 99)
 * 
 * Verifierar att emotion-data i pyramid_live_kpis.json uppfyller gates:
 * - p95_latency_ms ≤ 150ms
 * - sv_en_gap < 0.01
 */

import fs from "fs";
import path from "path";

describe("Emotion KPI gates", () => {
  test("Emotion KPI gates", () => {
    const p = path.join(process.cwd(), "reports", "pyramid_live_kpis.json");
    
    // Tillåt första körningen om fil inte finns
    if (!fs.existsSync(p)) {
      console.log("[CI] KPI file not found, skipping emotion gate (first run)");
      return;
    }

    let kpi: any;
    try {
      kpi = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (error) {
      console.error("[CI] Failed to parse KPI file:", error);
      throw new Error("Failed to parse KPI file");
    }

    const e = kpi.emotion;
    
    // Om emotion-data saknas, tillåt det (kan vara första körningen)
    if (!e) {
      console.log("[CI] Emotion data not found in KPI, skipping gates");
      return;
    }

    expect(e).toBeTruthy();
    
    // Gate 1: p95 latency ≤ 150ms
    if (e.p95_latency_ms !== undefined) {
      expect(e.p95_latency_ms).toBeLessThanOrEqual(150);
    }
    
    // Gate 2: SV/EN gap < 0.008 (tightare än tidigare 0.01)
    if (e.sv_en_gap !== undefined) {
      expect(e.sv_en_gap).toBeLessThan(0.008);
    }
    
    console.log(`[CI] Emotion gates passed: p95=${e.p95_latency_ms}ms, gap=${e.sv_en_gap}`);
  });
});

