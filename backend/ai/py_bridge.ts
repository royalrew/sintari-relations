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

// Helper: Find agents directory (supports both repo root and sintari-relations subdir)
function findAgentsDir(): string {
  const fs = require("fs");
  const cwd = process.cwd();
  
  // Try project root/agents first (if running from sintari-relations)
  const inParent = path.join(cwd, "..", "agents", "emotion", "micro_mood.py");
  if (fs.existsSync(inParent)) {
    return path.resolve(inParent);
  }
  
  // Try sintari-relations/agents
  const inSintari = path.join(cwd, "agents", "emotion", "micro_mood.py");
  if (fs.existsSync(inSintari)) {
    return path.resolve(inSintari);
  }
  
  // Try absolute from sintari-relations
  const absPath = path.resolve(__dirname, "..", "..", "..", "agents", "emotion", "micro_mood.py");
  if (fs.existsSync(absPath)) {
    return absPath;
  }
  
  // Default fallback (will error if doesn't exist)
  console.error(`[PyBridge] Cannot find micro_mood.py. Tried:`, {
    inParent,
    inSintari,
    absPath,
    cwd,
  });
  return inParent;
}

const DEFAULT_CONFIG: BridgeConfig = {
  agentName: "micro_mood",
  pythonScript: findAgentsDir(),
  poolSize: 2, // 2-4 workers enligt spec
  callTimeoutMs: 750, // Per-call timeout
  circuitBreakerThreshold: 5, // 5 fel → circuit open
  circuitBreakerResetMs: 30000, // 30s innan reset
};

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
    const fs = require("fs");
    const pythonBin = process.env.PYTHON_BIN || "python";
    const scriptPath = this.config.pythonScript;
    
    // Validate script exists
    if (!fs.existsSync(scriptPath)) {
      console.error(`[PyBridge] Script not found: ${scriptPath}`);
      throw new Error(`Python script not found: ${scriptPath}`);
    }

    // Use childProcess to avoid shadowing global process
    const childProcess = spawn(pythonBin, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { 
        ...process.env, 
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: "utf-8",
        LC_ALL: "C.UTF-8",
        LANG: "C.UTF-8",
      },
    });

    const worker: Worker = {
      process: childProcess,
      busy: false,
      pending: [],
      stderrBuffer: "",
      crashCount: 0,
    };

    // Handle stdout (JSONL responses)
    let buffer = "";
    childProcess.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line

      for (const line of lines) {
        if (line.trim()) {
          this.handleResponse(worker, line.trim());
        }
      }
    });

    // Handle stderr (errors/logs)
    childProcess.stderr?.on("data", (chunk: Buffer) => {
      worker.stderrBuffer += chunk.toString("utf-8");
      // If stderr contains errors, consider it a failure
      if (worker.stderrBuffer.length > 1000) {
        // Too much stderr → kill & respawn
        console.error(`[PyBridge] Excessive stderr from ${this.config.agentName}, respawning`);
        this.killAndRespawn(worker);
      }
    });

    // Handle process exit
    childProcess.on("exit", (code, signal) => {
      if (code !== 0 && code !== null) {
        console.error(`[PyBridge] Process exited with code ${code}, signal ${signal}`);
        worker.crashCount++;
        
        // Reject all pending requests
        for (const pending of worker.pending) {
          clearTimeout(pending.timeout);
          pending.reject(new Error(`Process crashed (code ${code})`));
        }
        worker.pending = [];

        // Respawn if not too many crashes
        if (worker.crashCount < 5) {
          setTimeout(() => this.killAndRespawn(worker), 1000);
        } else {
          console.error(`[PyBridge] Too many crashes, removing worker`);
          this.workers = this.workers.filter((w) => w !== worker);
        }
      }
    });

    // Handle process error
    childProcess.on("error", (error) => {
      console.error(`[PyBridge] Process error:`, error);
      this.circuitBreaker.recordFailure();
      
      for (const pending of worker.pending) {
        clearTimeout(pending.timeout);
        pending.reject(error);
      }
      worker.pending = [];
      
      this.killAndRespawn(worker);
    });

    this.workers.push(worker);
    return worker;
  }

  private handleResponse(worker: Worker, line: string) {
    if (worker.pending.length === 0) {
      console.warn(`[PyBridge] Received response but no pending requests`);
      return;
    }

    const pending = worker.pending.shift();
    if (!pending) return;

    clearTimeout(pending.timeout);

    try {
      const raw = JSON.parse(line);
      const response = MicroMoodResponseSchema.parse(raw);

      if (response.ok) {
        this.circuitBreaker.recordSuccess();
        
        // Log emotion event (non-blocking)
        try {
          const req = pending.requestData;
          const event = {
            ts: new Date().toISOString(),
            trace_id: req.trace_id,
            agent: "micro_mood" as const,
            level: ((response.level === "red" ? "red" : response.level) || "neutral") as "neutral" | "light" | "plus" | "red",
            score: response.score || 0.0,
            lang: ((req.lang === "auto" ? "sv" : req.lang) || "sv") as "sv" | "en",
            len_chars: req.text?.length || 0,
            route_tier: undefined as "fastpath" | "base" | "mid" | "top" | undefined,
            latency_ms: Math.round(response.latency_ms || 0),
          };
          emotionLogger.log(event);
          // Debug: log first few events
          if (emotionLogger.getStats().attempts <= 5) {
            console.log(`[PyBridge] Logged emotion event: ${event.level} (${event.score})`);
          }
        } catch (logError) {
          // Swallow logging errors
          console.error("[PyBridge] Failed to log emotion event:", logError);
        }
        
        pending.resolve(response);
      } else {
        this.circuitBreaker.recordFailure();
        // Return fallback neutral response
        pending.resolve({
          ok: false,
          agent: "micro_mood",
          error: response.error || "Unknown error",
          score: 0.0,
          level: "neutral",
          flags: [],
          red_hint: null,
        });
      }
    } catch (error) {
      this.circuitBreaker.recordFailure();
      console.error(`[PyBridge] Response parse error:`, error);
      pending.reject(
        new Error(`Invalid response schema: ${error instanceof Error ? error.message : String(error)}`)
      );
    }

    // Mark worker as not busy if no more pending
    if (worker.pending.length === 0) {
      worker.busy = false;
    }
  }

  private killAndRespawn(worker: Worker) {
    const index = this.workers.indexOf(worker);
    if (index === -1) return;

    try {
      worker.process.kill("SIGTERM");
    } catch (e) {
      // Ignore
    }

    // Remove old worker
    this.workers.splice(index, 1);

    // Spawn new worker
    setTimeout(() => {
      this.spawnWorker();
    }, 500);
  }

  async call(request: MicroMoodRequest): Promise<MicroMoodResponse> {
    // Validate request
    const validated = MicroMoodRequestSchema.parse(request);

    // Check circuit breaker
    if (!this.circuitBreaker.canAttempt()) {
      const state = this.circuitBreaker.getState();
      console.warn(`[PyBridge] Circuit breaker ${state}, returning neutral fallback`);
      return {
        ok: false,
        agent: "micro_mood",
        error: "Circuit breaker open",
        score: 0.0,
        level: "neutral",
        flags: [],
        red_hint: null,
      };
    }

    // Find available worker (round-robin)
    let worker = this.workers.find((w) => !w.busy && w.pending.length === 0);
    if (!worker) {
      // All busy, use least loaded
      worker = this.workers.reduce((min, w) =>
        w.pending.length < min.pending.length ? w : min
      );
    }

    if (!worker || !worker.process || worker.process.killed) {
      throw new Error("No available workers");
    }

    // Create request JSONL
    const requestJson = JSON.stringify({
      agent: this.config.agentName,
      version: "1.0",
      text: validated.text,
      lang: validated.lang,
      trace_id: validated.trace_id || `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });

    return new Promise<MicroMoodResponse>((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        const index = worker.pending.findIndex((p) => p.resolve === resolve);
        if (index !== -1) {
          worker.pending.splice(index, 1);
        }
        if (worker.pending.length === 0) {
          worker.busy = false;
        }
        
        this.circuitBreaker.recordFailure();
        resolve({
          ok: false,
          agent: "micro_mood",
          error: `Timeout (>${this.config.callTimeoutMs}ms)`,
          score: 0.0,
          level: "neutral",
          flags: [],
          red_hint: null,
        });
      }, this.config.callTimeoutMs);

      // Add to pending (store requestData for logging)
      worker.pending.push({ 
        request: requestJson, 
        requestData: validated,
        resolve, 
        reject, 
        timeout 
      });
      worker.busy = true;

      // Send request
      if (!worker.process.stdin?.writable) {
        clearTimeout(timeout);
        const index = worker.pending.findIndex((p) => p.resolve === resolve);
        if (index !== -1) {
          worker.pending.splice(index, 1);
        }
        reject(new Error("Process stdin not writable"));
        return;
      }

      worker.process.stdin.write(requestJson + "\n");
    });
  }

  shutdown() {
    for (const worker of this.workers) {
      try {
        worker.process.kill("SIGTERM");
      } catch (e) {
        // Ignore
      }
    }
    this.workers = [];
  }
}

// -------------------- Singleton Pool -------------------- //

let poolInstance: PyBridgePool | null = null;

export function getPyBridgePool(config?: Partial<BridgeConfig>): PyBridgePool {
  if (!poolInstance) {
    poolInstance = new PyBridgePool({
      ...DEFAULT_CONFIG,
      ...config,
    });
  }
  return poolInstance;
}

export function shutdownPyBridgePool() {
  if (poolInstance) {
    poolInstance.shutdown();
    poolInstance = null;
  }
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

// Export types
export type { MicroMoodRequest, MicroMoodResponse };

