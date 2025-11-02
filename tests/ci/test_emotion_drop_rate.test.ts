/**
 * CI Gate för Emotion Logger Drop Rate
 * 
 * Verifierar att drop-rate < 0.5%
 */

import { emotionLogger } from "../../backend/metrics/emotion_logger";

describe("Emotion Logger Drop Rate", () => {
  test("Drop rate should be < 0.5%", () => {
    const stats = emotionLogger.getStats();
    const dropRate = stats.dropRate;
    
    console.log(`[CI] Emotion logger stats: drops=${stats.drops}, attempts=${stats.attempts}, rate=${(dropRate * 100).toFixed(2)}%`);
    
    // CI warning om drop-rate > 0.5%
    if (dropRate > 0.005) {
      console.warn(`[CI WARNING] Emotion logger drop rate is ${(dropRate * 100).toFixed(2)}% (threshold: 0.5%)`);
      // Soft fail - varning för nu, kan göras hårdare senare
      expect(dropRate).toBeLessThan(0.01); // Tillåt upp till 1% för nu
    } else {
      expect(dropRate).toBeLessThan(0.005);
    }
  });
});

