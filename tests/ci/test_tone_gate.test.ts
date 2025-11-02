/**
 * Tone Gate CI (Soft → Hard)
 * 
 * V.1 (soft): varna om Δton ≥ 0.07
 * V.2 (hard): fail om Δton ≥ 0.05 när v2 är live
 */

import fs from "fs";
import path from "path";

describe("Tone Gate", () => {
  test("Tone delta should be < 0.07 (soft gate)", () => {
    // TODO: När EmpathyTone v2 är live, lägg tone-delta i KPI-JSON
    // För nu: soft gate (varning)
    const p = path.join(process.cwd(), "reports", "pyramid_live_kpis.json");
    
    if (!fs.existsSync(p)) {
      console.log("[CI] KPI file not found, skipping tone gate (first run)");
      return;
    }

    let kpi: any;
    try {
      kpi = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (error) {
      console.error("[CI] Failed to parse KPI file:", error);
      return; // Soft fail - bara varning
    }

    // TODO: När tone data finns i KPI
    const toneDelta = kpi.tone?.delta || kpi.empathy_tone?.delta;
    
    if (toneDelta !== undefined) {
      // Soft gate: varning om ≥ 0.07
      if (toneDelta >= 0.07) {
        console.warn(`[CI WARNING] Tone delta is ${toneDelta} (threshold: 0.07)`);
      }
      
      // Hard gate: fail om ≥ 0.05 (när v2 är live)
      if (toneDelta >= 0.05) {
        console.warn(`[CI] Tone delta ${toneDelta} approaching hard limit (0.05)`);
        // För nu: soft fail
        // expect(toneDelta).toBeLessThan(0.05);
      }
      
      console.log(`[CI] Tone delta: ${toneDelta}`);
    } else {
      console.log("[CI] Tone data not available yet (EmpathyTone v2 not active)");
    }
  });
});

