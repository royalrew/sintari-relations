import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

export type JobKind = "emotion" | "memory" | "all" | "smoke" | "explain" | "si_nightly" | "si_apply" | "canary_toggle" | "promote_canary" | "logrotate_live";
export type JobStatus = "queued" | "running" | "completed" | "failed";

export type JobRecord = {
  id: string;
  kind: JobKind;
  cmd: string;
  args: string[];
  status: JobStatus;
  progress: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  raw: string;
  metrics: Record<string, number>;
  tests: Array<{ name: string; status: "passed" | "failed"; duration_ms?: number; log?: string }>;
  options?: Record<string, string>;
};

const DATA_DIR = join(process.cwd(), "data");
const JOB_FILE = join(DATA_DIR, "admin_jobs.json");

function ensureStore() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!existsSync(JOB_FILE)) {
    writeFileSync(JOB_FILE, "[]", "utf8");
  }
}

function loadJobsFromDisk(): JobRecord[] {
  try {
    ensureStore();
    const txt = readFileSync(JOB_FILE, "utf8").trim();
    if (!txt) return [];
    const parsed = JSON.parse(txt);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      id: item.id ?? randomUUID(),
      kind: item.kind as JobKind,
      cmd: item.cmd ?? "",
      args: Array.isArray(item.args) ? item.args : [],
      status: (item.status as JobStatus) ?? "queued",
      progress: typeof item.progress === "number" ? item.progress : 0,
      startedAt: item.startedAt,
      finishedAt: item.finishedAt,
      error: item.error,
      raw: typeof item.raw === "string" ? item.raw : "",
      metrics: item.metrics ?? {},
      tests: Array.isArray(item.tests) ? item.tests : [],
      options: item.options ?? {},
    })) as JobRecord[];
  } catch (err) {
    console.warn("[JOB] loadJobsFromDisk error", err);
    return [];
  }
}

function persistJobs() {
  try {
    ensureStore();
    writeFileSync(JOB_FILE, JSON.stringify(QUEUE, null, 2), "utf8");
  } catch (err) {
    console.error("[JOB] persistJobs error", err);
  }
}

const QUEUE: JobRecord[] = loadJobsFromDisk();
let RUNNING = false;

function commandFor(kind: JobKind, payload?: any): { cmd: string; args: string[] } {
  const rootDir = process.cwd();
  // Add --capture=no to avoid stdin/stderr issues on Windows
  const pytestBaseArgs = ["-v", "--tb=short", "--capture=no"];
  switch (kind) {
    case "emotion":
      return { cmd: "pytest", args: ["tests/worldclass/test_emotion_suite.py", ...pytestBaseArgs] };
    case "memory":
      return { cmd: "pytest", args: ["tests/worldclass/test_memory_suite.py", "-v", "--tb=short", "--capture=no"] };
    case "explain":
      return { cmd: "pytest", args: ["tests/worldclass/test_explain_suite.py", "-q", "--capture=no"] };
    case "si_nightly":
      return { cmd: "python", args: ["agents/self_improve/si_core.py", "--count", "50", "--out", "reports/si/nightly_local.jsonl"] };
    case "si_apply":
      return { cmd: "node", args: ["scripts/si/apply_si_proposals.mjs", "--in", "reports/si/forlag_dev.json"] };
    case "canary_toggle":
      return { cmd: "node", args: ["scripts/si/canary_toggle.mjs", String(payload?.percent ?? 0)] };
    case "promote_canary":
      return { cmd: "node", args: ["scripts/release/promote_canary.mjs"] };
    case "logrotate_live":
      return { cmd: "python", args: ["scripts/metrics/rotate_worldclass_log.py", "--file", "reports/worldclass_live.jsonl", "--max-mb", String(payload?.maxMb ?? 50)] };
    case "all":
      // For Windows, we'll run them sequentially
      return { cmd: "pytest", args: ["tests/worldclass/test_emotion_suite.py", "tests/worldclass/test_memory_suite.py", ...pytestBaseArgs] };
    case "smoke":
      return { cmd: "python", args: ["tests/memory/test_memory_smoke.py"] };
  }
}

export function enqueue(kind: JobKind, options?: Record<string, string>) {
  const { cmd, args } = commandFor(kind, options);
  const job: JobRecord = {
    id: randomUUID(),
    kind,
    cmd,
    args,
    status: "queued",
    progress: 0,
    raw: "",
    metrics: {},
    tests: [],
    options,
  };
  console.log(`[JOB] enqueue ${job.kind} -> ${job.id}`, { args, options });
  QUEUE.push(job);
  persistJobs();
  tick();
  return job.id;
}

export function getJob(id: string) {
  const job = QUEUE.find((j) => j.id === id);
  if (!job) {
    console.warn(`[JOB] getJob miss for ${id}. Queue length=${QUEUE.length}`);
  }
  return job;
}

async function run(job: JobRecord) {
  job.status = "running";
  job.startedAt = new Date().toISOString();
  persistJobs();

  const rootDir = process.cwd();
  
  // First, collect all test names if it's a pytest command
  let allTestNames: string[] = [];
  if (job.cmd === "pytest") {
    try {
      // Remove verbose flags and add collect-only, but keep --capture=no
      const collectArgs = job.args
        .filter(a => !a.startsWith("-v") && a !== "--tb=short" && a !== "--tb=long")
        .concat(["--collect-only", "--capture=no"]);
      
      const collectChild = spawn(job.cmd, collectArgs, {
        cwd: rootDir,
        shell: false,
        env: { ...process.env, ...(job.options ?? {}) },
        stdio: ["ignore", "pipe", "pipe"], // Explicitly ignore stdin
      });
      
      let collectOutput = "";
      collectChild.stdout.on("data", (buf) => {
        collectOutput += buf.toString();
      });
      collectChild.stderr.on("data", (buf) => {
        collectOutput += buf.toString();
      });
      
      await new Promise<void>((resolve) => {
        collectChild.on("close", () => resolve());
      });
      
      // Extract test names from collect output
      // Format: "<Module tests/path.py>" or "  <Function test_name>" or "tests/path.py::test_name"
      const testNameRegex = /(?:<Function|::)([^\s>]+)/g;
      let match;
      const seen = new Set<string>();
      while ((match = testNameRegex.exec(collectOutput)) !== null) {
        const testName = match[1];
        // Filter out non-test names (like module names)
        if (testName.startsWith("test_") && !seen.has(testName)) {
          seen.add(testName);
          allTestNames.push(testName);
        }
      }
      
      // Also try the simpler format: "tests/path.py::test_name"
      const simpleRegex = /[^\s]+::([^\s]+)/g;
      while ((match = simpleRegex.exec(collectOutput)) !== null) {
        const testName = match[1];
        if (testName.startsWith("test_") && !seen.has(testName)) {
          seen.add(testName);
          allTestNames.push(testName);
        }
      }
    } catch (e) {
      // Ignore if collection fails
      console.warn("Failed to collect test names:", e);
    }
  }
  
  const child = spawn(job.cmd, job.args, {
    cwd: rootDir,
    shell: false,
    env: { ...process.env, ...(job.options ?? {}) },
    stdio: ["ignore", "pipe", "pipe"], // Explicitly ignore stdin to avoid Windows issues
  });

  child.stdout.on("data", (buf) => {
    const s = buf.toString();
    job.raw += s;
    job.progress = Math.min(99, job.progress + 2); // heuristisk progress
  });

  child.stderr.on("data", (buf) => {
    const s = buf.toString();
    job.raw += s;
  });

  let exitCode = 0;
  let spawnError = false;
  await new Promise<void>((resolve) => {
    child.on("close", (code) => {
      exitCode = code || 0;
      resolve();
    });
    child.on("error", (err) => {
      job.error = String(err.message || err);
      job.status = "failed";
      spawnError = true;
      resolve();
    });
  });

  if (job.kind === "smoke" || job.kind === "si_apply" || job.kind === "canary_toggle" || job.kind === "promote_canary" || job.kind === "logrotate_live") {
    job.finishedAt = new Date().toISOString();
    job.progress = 100;
    job.tests = [
      {
        name:
          job.kind === "smoke"
            ? "tests/memory/test_memory_smoke.py"
            : job.kind === "si_apply"
            ? "scripts/si/apply_si_proposals.mjs"
            : job.kind === "canary_toggle"
            ? "scripts/si/canary_toggle.mjs"
            : job.kind === "promote_canary"
            ? "scripts/release/promote_canary.mjs"
            : "scripts/metrics/rotate_worldclass_log.py",
        status: exitCode === 0 ? "passed" : "failed",
        log: job.raw.trim() || undefined,
      },
    ];
    job.metrics = {};
    if (exitCode === 0) {
      job.status = "completed";
    } else {
      job.error = job.error || `Process exited with code ${exitCode}`;
      job.status = "failed";
    }
    persistJobs();
    return;
  }

  // Parsning av resultat/metrics
  job.tests = parseTests(job.raw, allTestNames);
  job.metrics = parseMetrics(job.raw, job.kind);

  job.finishedAt = new Date().toISOString();
  job.progress = 100;
  
  // If we got an error during spawn, bail out early
  if (spawnError) {
    persistJobs();
    return;
  }
  
  // Check if we have any output at all (pytest should produce output)
  if (!job.raw.trim() && exitCode !== 0) {
    job.error = `Process exited with code ${exitCode} but produced no output. Check if pytest is installed and test files exist.`;
    job.status = "failed";
    persistJobs();
    return;
  }
  
  // If we have tests parsed, use their status
  if (job.tests.length > 0) {
    const hasFail = job.tests.some((t) => t.status === "failed");
    // Completed even if some tests failed (that's normal)
    job.status = "completed";
    // But add a note if there were failures
    if (hasFail && exitCode !== 0) {
      const failedCount = job.tests.filter((t) => t.status === "failed").length;
      job.error = `${failedCount} test(s) failed. See results below for details.`;
    }
  } else {
    // No tests parsed - might be a real error
    if (exitCode !== 0) {
      job.error = `Process exited with code ${exitCode}. Output: ${job.raw.substring(0, 500)}`;
      job.status = "failed";
    } else {
      job.status = "completed";
    }
  }
  persistJobs();
}

function parseTests(raw: string, allTestNames: string[] = []) {
  const tests: JobRecord["tests"] = [];
  const seenTests = new Set<string>();
  
  // Method 1: Parse from FAILED blocks (most reliable for failed tests)
  // Format: "FAILED tests/path.py::test_name - AssertionError: ..."
  const failedRegex = /FAILED\s+[^\s]+::([^\s]+)/g;
  let match;
  while ((match = failedRegex.exec(raw)) !== null) {
    const testName = match[1];
    if (!seenTests.has(testName)) {
      seenTests.add(testName);
      // Extract error message if available
      const errorMatch = raw.match(new RegExp(`FAILED\s+[^\s]+::${testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\n]*\n([^\n]+)`, 'm'));
      const errorMsg = errorMatch ? errorMatch[1].trim() : undefined;
      tests.push({ name: testName, status: "failed", log: errorMsg });
    }
  }
  
  // Also parse DEBUG output for metrics
  const debugRegex = /\[DEBUG\]\s+([^\n]+)/g;
  const debugLogs: string[] = [];
  while ((match = debugRegex.exec(raw)) !== null) {
    debugLogs.push(match[1]);
  }
  
  // Add debug logs to failed tests
  if (debugLogs.length > 0) {
    for (const test of tests) {
      if (test.status === "failed" && !test.log) {
        test.log = debugLogs.join("\n");
      }
    }
  }
  
  // Method 2: Parse from test collection line (e.g., "tests/path.py::test_name PASSED")
  // This catches both passed and failed tests
  const testLineRegex = /(?:tests|\.py)[^\s]*::([^\s]+)\s+(PASSED|FAILED)/gi;
  while ((match = testLineRegex.exec(raw)) !== null) {
    const testName = match[1];
    const status = match[2].toLowerCase() as "passed" | "failed";
    
    // Update if exists, or add if new
    const existing = tests.find(t => t.name === testName);
    if (existing) {
      existing.status = status;
    } else if (!seenTests.has(testName)) {
      seenTests.add(testName);
      tests.push({ name: testName, status });
    }
  }
  
  // Method 3: If we have all test names from collection, use them
  // Mark all collected tests as passed, then update failed ones
  if (allTestNames.length > 0) {
    for (const testName of allTestNames) {
      if (!seenTests.has(testName)) {
        seenTests.add(testName);
        // Default to passed, will be updated if found in failed list
        tests.push({ name: testName, status: "passed" });
      }
    }
    
    // Update any that were marked as failed
    for (const test of tests) {
      if (raw.includes(`FAILED`) && raw.includes(`::${test.name}`)) {
        const failedMatch = raw.match(new RegExp(`FAILED\s+[^\s]+::${test.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'));
        if (failedMatch) {
          test.status = "failed";
        }
      }
    }
  }
  
  // Method 4: Parse from summary line (e.g., "2 failed, 7 passed in 9.61s")
  const summaryMatch = raw.match(/(\d+)\s+failed[,\s]+(\d+)\s+passed/i) || 
                        raw.match(/(\d+)\s+passed[,\s]+(\d+)\s+failed/i);
  
  if (summaryMatch) {
    const failedCount = parseInt(summaryMatch[1] || summaryMatch[2] || "0");
    const passedCount = parseInt(summaryMatch[2] || summaryMatch[1] || "0");
    const totalExpected = failedCount + passedCount;
    
    const currentFailed = tests.filter(t => t.status === "failed").length;
    const currentPassed = tests.filter(t => t.status === "passed").length;
    
    // If we're missing tests and don't have all names from collection,
    // try to extract from FAILED sections
    if (currentFailed < failedCount && tests.length < totalExpected) {
      const failedBlocks = raw.split(/FAILED\s+/);
      for (const block of failedBlocks.slice(1)) {
        const testMatch = block.match(/^[^\s]+::([^\s]+)/m);
        if (testMatch) {
          const testName = testMatch[1];
          if (!seenTests.has(testName)) {
            seenTests.add(testName);
            tests.push({ name: testName, status: "failed" });
          }
        }
      }
    }
    
    // If we still don't have all tests, create placeholder entries
    // This ensures the summary count matches
    while (tests.length < totalExpected) {
      const testName = `test_${tests.length + 1}`;
      if (!seenTests.has(testName)) {
        seenTests.add(testName);
        // Default to passed if we already have all failed ones
        const status = currentFailed + tests.filter(t => t.status === "failed").length < failedCount ? "failed" : "passed";
        tests.push({ name: testName, status });
      } else {
        break; // Avoid infinite loop
      }
    }
  }
  
  return tests;
}

function parseMetrics(raw: string, kind: JobKind): Record<string, number> {
  const metrics: Record<string, number> = {};
  
  // Try to load from report files first
  try {
    if (kind === "emotion") {
      const { readFileSync, existsSync } = require("fs");
      const reportPath = join(process.cwd(), "reports", "emotion_golden_report.json");
      if (existsSync(reportPath)) {
        const report = JSON.parse(readFileSync(reportPath, "utf-8"));
        if (report.red_recall !== undefined) metrics.RED_recall = report.red_recall;
        if (report.red_fp_rate !== undefined) metrics.RED_FP_rate = report.red_fp_rate;
        if (report.plus_precision !== undefined) metrics.PLUS_precision = report.plus_precision;
        if (report.light_rate !== undefined) metrics.LIGHT_rate = report.light_rate;
        if (report.sv_en_gap !== undefined) metrics.SV_EN_gap = report.sv_en_gap;
        if (report.accuracy !== undefined) metrics.accuracy = report.accuracy;
      }
    } else if (kind === "memory") {
      const { readFileSync, existsSync } = require("fs");
      const reportPath = join(process.cwd(), "reports", "memory_eval_report.json");
      if (existsSync(reportPath)) {
        const report = JSON.parse(readFileSync(reportPath, "utf-8"));
        if (report.metrics) {
          Object.assign(metrics, report.metrics);
        }
      }
    }
  } catch (e) {
    // Ignore file read errors, fall back to regex parsing
  }
  
  // Fallback: regex parsing from raw output
  const regexps: Record<string, RegExp> = {
    RED_recall: /RED_recall\s*[:=]\s*([0-9]*\.?[0-9]+)/i,
    RED_FP_rate: /RED_FP_rate\s*[:=]\s*([0-9]*\.?[0-9]+)/i,
    PLUS_precision: /PLUS_precision\s*[:=]\s*([0-9]*\.?[0-9]+)/i,
    LIGHT_rate: /LIGHT_rate\s*[:=]\s*([0-9]*\.?[0-9]+)/i,
    HitAt3: /Hit@?3\s*[:=]\s*([0-9]*\.?[0-9]+)/i,
    MRR: /MRR\s*[:=]\s*([0-9]*\.?[0-9]+)/i,
    p95_latency_ms: /p95\s*latency\s*[:=]\s*([0-9]*\.?[0-9]+)/i,
  };
  
  for (const [k, r] of Object.entries(regexps)) {
    if (!metrics[k]) {
      const m = raw.match(r);
      if (m) metrics[k] = Number(m[1]);
    }
  }
  
  return metrics;
}

async function tick() {
  if (RUNNING) return;
  const next = QUEUE.find((j) => j.status === "queued");
  if (!next) return;
  
  RUNNING = true;
  try {
    await run(next);
  } catch (e: any) {
    next.error = String(e?.message || e);
    next.status = "failed";
    next.finishedAt = new Date().toISOString();
    persistJobs();
  } finally {
    RUNNING = false;
    // kör ev nästa
    setTimeout(() => tick(), 0);
  }
}

// Resume any queued jobs on module load
setTimeout(() => tick(), 0);

