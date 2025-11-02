/**
 * Emotion Logger - Append-only JSONL logger för Micro-Mood events
 * Steg 99: Brain First Plan - Uplift Telemetry
 * 
 * Loggar alla emotion-detection events till reports/emotion_events/YYYY-MM-DD.jsonl
 */

import fs from "fs";
import path from "path";
import { z } from "zod";

export const EmotionEvent = z.object({
  ts: z.string(),           // ISO UTC
  trace_id: z.string().optional(),
  agent: z.literal("micro_mood"),
  level: z.enum(["neutral", "light", "plus", "red"]), // Note: "red" (lowercase) in schema, "RED" displayed
  score: z.number().min(0).max(1),
  lang: z.enum(["sv", "en"]),
  len_chars: z.number().int().nonnegative(),
  route_tier: z.enum(["fastpath", "base", "mid", "top"]).optional(),
  latency_ms: z.number().int().nonnegative(),
});

export type EmotionEvent = z.infer<typeof EmotionEvent>;

function ensureDir(p: string) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

export class EmotionLogger {
  // Fix path: Next.js process.cwd() kan vara .next eller annat
  // Använd absolut path baserat på project root
  private getDir(): string {
    const cwd = process.cwd();
    // Om vi är i sintari-relations, använd cwd direkt
    if (cwd.includes("sintari-relations")) {
      return path.join(cwd, "reports", "emotion_events");
    }
    // Annars försök hitta sintari-relations
    const possible = [
      path.join(cwd, "sintari-relations", "reports", "emotion_events"),
      path.join(cwd, "reports", "emotion_events"),
      path.join(cwd, "..", "sintari-relations", "reports", "emotion_events"),
    ];
    for (const p of possible) {
      if (fs.existsSync(path.dirname(p))) {
        return p;
      }
    }
    // Fallback
    return path.join(cwd, "reports", "emotion_events");
  }
  
  private currentDate = "";
  private stream: fs.WriteStream | null = null;
  private dropCount = 0; // Track dropped events
  private totalAttempts = 0; // Track total logging attempts

  private rotateIfNeeded() {
    const d = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    if (d !== this.currentDate) {
      this.currentDate = d;
      const dir = this.getDir();
      ensureDir(dir);
      
      if (this.stream) {
        this.stream.end();
      }
      
      const file = path.join(dir, `${this.currentDate}.jsonl`);
      try {
        this.stream = fs.createWriteStream(file, { flags: "a", encoding: "utf8" });
        console.log(`[EmotionLogger] Opened log file: ${file}`);
      } catch (error) {
        console.error(`[EmotionLogger] Failed to open log file: ${file}`, error);
        this.stream = null;
      }
    }
  }

  log(ev: EmotionEvent) {
    // fail-safe, non-blocking
    this.totalAttempts++;
    try {
      const parsed = EmotionEvent.parse(ev);
      
      // Ensure stream is initialized (rotateIfNeeded creates it)
      this.rotateIfNeeded();
      
      if (this.stream && this.stream.writable) {
        const line = JSON.stringify(parsed) + "\n";
        const written = this.stream.write(line);
        if (!written) {
          // Buffer full - wait for drain (rare case)
          this.stream.once("drain", () => {
            // Continue logging
          });
        }
        
        // Debug: log first few events
        if (this.totalAttempts <= 3) {
          console.log(`[EmotionLogger] ✅ Logged event #${this.totalAttempts}: ${parsed.level} (${parsed.score}) to ${this.currentDate}.jsonl`);
        }
      } else {
        this.dropCount++;
        if (this.totalAttempts <= 5) {
          console.warn(`[EmotionLogger] ⚠️ Stream not available (attempt ${this.totalAttempts}). Dir: ${this.getDir()}`);
        }
      }
    } catch (error) {
      // Swallow errors to prevent crashes
      this.dropCount++;
      if (this.totalAttempts <= 5) {
        console.error(`[EmotionLogger] ❌ Failed to log event #${this.totalAttempts}:`, error);
      }
    }
  }
  
  getDropRate(): number {
    if (this.totalAttempts === 0) return 0;
    return this.dropCount / this.totalAttempts;
  }
  
  getStats(): { drops: number; attempts: number; dropRate: number } {
    return {
      drops: this.dropCount,
      attempts: this.totalAttempts,
      dropRate: this.getDropRate(),
    };
  }
  
  resetStats() {
    this.dropCount = 0;
    this.totalAttempts = 0;
  }

  shutdown() {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
  }
}

export const emotionLogger = new EmotionLogger();

