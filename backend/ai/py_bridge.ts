/**
 * Py-Bridge - Robust Node.js↔Python bridge för agent-calls
 * Steg 92: Brain First Plan - Emotion Core
 * 
 * Features:
 * - Pool av worker-processer (2-4 workers)
 * - Circuit-breaker vid fel
 * - Per-call timeout (750ms)
 * - Schema-validering (Zod)
 * - Auto-respawn vid crash
 * 
 * Protokoll: JSONL över stdin/stdout (line-framed)
 */

import { spawn, ChildProcess } from "child_process";
import { z } from "zod";
import path from "path";
import fs from "fs";
import { promisify } from "util";
import { emotionLogger } from "../metrics/emotion_logger";

// -------------------- Request/Response Schemas -------------------- //

const MicroMoodRequestSchema = z.object({
  agent: z.literal("micro_mood"),
  version: z.string().optional(),
  text: z.string(),
  lang: z.enum(["sv", "en", "auto"]).default("auto"),
  trace_id: z.string().optional(),
});

const MicroMoodResponseSchema = z.object({
  ok: z.boolean(),
  agent: z.literal("micro_mood"),
  score: z.number().min(0).max(1).optional(),
  level: z.enum(["neutral", "light", "plus", "red"]).optional(),
  flags: z.array(z.string()).optional(),
  red_hint: z.string().nullable().optional(),
  latency_ms: z.number().optional(),
  error: z.string().optional(),
});

type MicroMoodRequest = z.infer<typeof MicroMoodRequestSchema>;
type MicroMoodResponse = z.infer<typeof MicroMoodResponseSchema>;

// -------------------- Bridge Configuration -------------------- //

interface BridgeConfig {
  agentName: string;
  pythonScript: string;
  poolSize: number;
  callTimeoutMs: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
}

// Helper: Resolve agent path with priority order (local submodule → monorepo → ENV override)
function resolveAgent(relPath: string): string {
  const cwd = process.cwd();
  
  const candidates = [
    // 1) Lokal submodule (./agents/)
    path.join(cwd, "agents", relPath),
    // 2) Monorepo-fallback (../agents/)
    path.join(cwd, "..", "agents", relPath),
    // 3) Valfritt: miljövariabel för specialdeploy
    process.env.AGENTS_ROOT ? path.join(process.env.AGENTS_ROOT, relPath) : "",
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      return path.resolve(p);
    }
  }
  
  // Error with all candidates tried
  throw new Error(
    `Agent not found: ${relPath}\n` +
    `Checked locations:\n${candidates.map(c => `  - ${c}`).join("\n")}`
  );
}

// Lazy config factory to resolve paths at runtime (not module load time)
function getDefaultConfig(): BridgeConfig {
  return {
    agentName: "micro_mood",
    pythonScript: resolveAgent(path.join("emotion", "micro_mood.py")),
    poolSize: 2, // 2-4 workers enligt spec
    callTimeoutMs: 750, // Per-call timeout
    circuitBreakerThreshold: 5, // 5 fel → circuit open
    circuitBreakerResetMs: 30000, // 30s innan reset
  };
}

const DEFAULT_CONFIG = getDefaultConfig();

// -------------------- Circuit Breaker -------------------- //

class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private isOpen = false;

  constructor(
    private threshold: number,
    private resetMs: number
  ) {}

  recordSuccess() {
    this.failures = 0;
    this.isOpen = false;
  }

  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.threshold) {
      this.isOpen = true;
    }
  }

  canAttempt(): boolean {
    if (!this.isOpen) return true;
    
    // Check if reset time has passed
    if (Date.now() - this.lastFailureTime >= this.resetMs) {
      this.isOpen = false;
      this.failures = 0;
      return true;
    }
    
    return false;
  }

  getState(): "closed" | "open" | "half-open" {
    if (!this.isOpen) return "closed";
    if (Date.now() - this.lastFailureTime >= this.resetMs) return "half-open";
    return "open";
  }
}

// -------------------- Worker Pool -------------------- //

interface Worker {
  process: ChildProcess;
  busy: boolean;
  pending: Array<{
    request: string;
    requestData: MicroMoodRequest; // Store for logging
    resolve: (response: MicroMoodResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>;
  stderrBuffer: string;
  crashCount: number;
}

class PyBridgePool {
  private workers: Worker[] = [];
  private circuitBreaker: CircuitBreaker;
  private config: BridgeConfig;

  constructor(config: BridgeConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.circuitBreaker = new CircuitBreaker(
      config.circuitBreakerThreshold,
      config.circuitBreakerResetMs
    );

    // Spawn initial workers
    for (let i = 0; i < config.poolSize; i++) {
      this.spawnWorker();
    }
  }

  private spawnWorker(): Worker {
    const pythonBin = process.env.PYTHON_BIN || "python";
    // Re-resolve path at runtime in case cwd changed
    let scriptPath = this.config.pythonScript;
    try {
      scriptPath = resolveAgent(path.join("emotion", "micro_mood.py"));
    } catch (e) {
      // Fallback to config path if resolve fails
      console.warn(`[PyBridge] Failed to re-resolve agent path, using config: ${scriptPath}`);
    }
    
    const worker: Worker = {
      process: spawn(pythonBin, [scriptPath], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUNBUFFERED: "1",
        },
      }),
      busy: false,
      pending: [],
      stderrBuffer: "",
      crashCount: 0,
    };

    let lineBuffer = "";

    // stdout: JSONL responses
    worker.process.stdout?.on("data", (chunk: Buffer) => {
      lineBuffer += chunk.toString("utf-8");
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const response: MicroMoodResponse = JSON.parse(line);
          const pending = worker.pending.shift();
          
          if (pending) {
            clearTimeout(pending.timeout);
            pending.resolve(response);
            this.circuitBreaker.recordSuccess();
          }
        } catch (e) {
          console.error(`[PyBridge] Failed to parse response: ${line}`, e);
        }
      }
    });

    // stderr: errors + logs
    worker.process.stderr?.on("data", (chunk: Buffer) => {
      worker.stderrBuffer += chunk.toString("utf-8");
    });

    // Process exit: auto-respawn if crashed
    worker.process.on("exit", (code) => {
      worker.crashCount++;
      
      if (code !== 0 && code !== null) {
        console.warn(`[PyBridge] Worker crashed (exit ${code}), respawning...`);
        
        // Reject all pending requests
        for (const pending of worker.pending) {
          clearTimeout(pending.timeout);
          pending.reject(new Error(`Worker crashed (exit ${code})`));
        }
        worker.pending = [];
        
        // Respawn after short delay
        setTimeout(() => {
          const idx = this.workers.indexOf(worker);
          if (idx >= 0) {
            this.workers[idx] = this.spawnWorker();
          }
        }, 1000);
      }
    });

    this.workers.push(worker);
    return worker;
  }

  async call(request: MicroMoodRequest): Promise<MicroMoodResponse> {
    // Validate request
    const validated = MicroMoodRequestSchema.parse(request);

    // Circuit breaker check
    if (!this.circuitBreaker.canAttempt()) {
      const state = this.circuitBreaker.getState();
      console.warn(`[PyBridge] Circuit breaker ${state}, returning neutral fallback`);
      return {
        ok: false,
        agent: "micro_mood",
        error: "Circuit breaker open",
        score: 0.0,
        level: "neutral",
      };
    }

    // Find available worker
    const worker = this.workers.find(w => !w.busy && w.process.pid);
    
    if (!worker) {
      // All workers busy, use first available
      const available = this.workers[0];
      if (available && available.process.pid) {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            const idx = available.pending.findIndex(p => p.request === JSON.stringify(validated));
            if (idx >= 0) {
              available.pending.splice(idx, 1);
            }
            this.circuitBreaker.recordFailure();
            resolve({
              ok: false,
              agent: "micro_mood",
              error: `Timeout (>${this.config.callTimeoutMs}ms)`,
              score: 0.0,
              level: "neutral",
            });
          }, this.config.callTimeoutMs);

          available.pending.push({
            request: JSON.stringify(validated),
            requestData: validated,
            resolve,
            reject,
            timeout,
          });

          if (available.process.stdin?.writable) {
            available.process.stdin.write(JSON.stringify(validated) + "\n");
          }
        });
      }
      
      // Fallback if no workers
      return {
        ok: false,
        agent: "micro_mood",
        error: "No available workers",
        score: 0.0,
        level: "neutral",
      };
    }

    // Send request
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const idx = worker.pending.findIndex(p => p.request === JSON.stringify(validated));
        if (idx >= 0) {
          worker.pending.splice(idx, 1);
        }
        this.circuitBreaker.recordFailure();
        resolve({
          ok: false,
          agent: "micro_mood",
          error: `Timeout (>${this.config.callTimeoutMs}ms)`,
          score: 0.0,
          level: "neutral",
        });
      }, this.config.callTimeoutMs);

      worker.pending.push({
        request: JSON.stringify(validated),
        requestData: validated,
        resolve: (response: MicroMoodResponse) => {
          clearTimeout(timeout);
          
          if (!response.ok) {
            this.circuitBreaker.recordFailure();
          }
          
          // Log emotion event
          if (response.ok && response.score !== undefined && response.level) {
            try {
              const event = {
                ts: new Date().toISOString(),
                trace_id: validated.trace_id,
                agent: "micro_mood" as const,
                level: ((response.level === "red" ? "red" : response.level) || "neutral") as "neutral" | "light" | "plus" | "red",
                score: response.score || 0.0,
                lang: ((validated.lang === "auto" ? "sv" : validated.lang) || "sv") as "sv" | "en",
                len_chars: validated.text.length,
                latency_ms: response.latency_ms || 0,
              };
              
              emotionLogger.log(event);
            } catch (err: unknown) {
              // emotionLogger.log() is fail-safe, but catch any type errors
              console.error("[PyBridge] Failed to log emotion event", err);
            }
          }
          
          resolve(response);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          this.circuitBreaker.recordFailure();
          
          // Return fallback neutral response
          resolve({
            ok: false,
            agent: "micro_mood",
            error: error.message || "Unknown error",
            score: 0.0,
            level: "neutral",
          });
        },
        timeout,
      });

      if (worker.process.stdin?.writable) {
        worker.process.stdin.write(JSON.stringify(validated) + "\n");
      } else {
        clearTimeout(timeout);
        const idx = worker.pending.findIndex(p => p.request === JSON.stringify(validated));
        if (idx >= 0) {
          worker.pending.splice(idx, 1);
        }
        reject(new Error("Worker stdin not writable"));
      }
    });
  }
}

// -------------------- Singleton Pool -------------------- //

let poolInstance: PyBridgePool | null = null;

function getPyBridgePool(): PyBridgePool {
  if (!poolInstance) {
    // Create config at pool creation time (runtime), not module load
    const config = getDefaultConfig();
    poolInstance = new PyBridgePool(config);
  }
  return poolInstance;
}

// -------------------- Public API -------------------- //

/**
 * Call micro_mood agent via Python bridge
 */
export async function callMicroMood(
  text: string,
  lang: "sv" | "en" | "auto" = "auto",
  traceId?: string
): Promise<MicroMoodResponse> {
  const pool = getPyBridgePool();
  return pool.call({
    agent: "micro_mood",
    text,
    lang,
    trace_id: traceId,
  });
}
