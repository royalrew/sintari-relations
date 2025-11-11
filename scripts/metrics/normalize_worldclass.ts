#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import { createInterface } from "readline";

type AnyObj = Record<string, any>;

const ISO_RX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function toIso(ts: string | number | undefined): string {
  if (typeof ts === "number") {
    const ms = ts > 2_000_000_000 ? ts : ts * 1000;
    return new Date(ms).toISOString();
  }
  if (!ts) return new Date().toISOString();
  const s = String(ts);
  if (ISO_RX.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return new Date(s).toISOString();
  const n = Number(s);
  if (!Number.isNaN(n)) {
    const ms = n > 2_000_000_000 ? n : n * 1000;
    return new Date(ms).toISOString();
  }
  return new Date(s).toISOString();
}

function snakeKey(k: string) {
  return k
    .replace(/[@]/g, "_at_")
    .replace(/[.]/g, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

function snakeKeysDeep(val: any): any {
  if (Array.isArray(val)) return val.map(snakeKeysDeep);
  if (val && typeof val === "object") {
    const out: AnyObj = {};
    for (const [k, v] of Object.entries(val)) out[snakeKey(k)] = snakeKeysDeep(v);
    return out;
  }
  return val;
}

function cosine(a: number[], b: number[]) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

type SessionState = {
  lastTone?: number[];
  recentKeys: Map<string, number>;
  lastTs?: number; // For monotonic timestamp check
  eventCount: number; // For per-session window limit
};

function p95(nums: number[]) {
  if (!nums.length) return 0;
  const arr = nums.slice().sort((a, b) => a - b);
  const idx = Math.floor(0.95 * (arr.length - 1));
  return arr[idx];
}

function parseArgs() {
  const args = new Map<string, string | boolean>();
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith("--")) {
      const key = arg.replace(/^--/, "").replace(/-/g, "_");
      if (i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--")) {
        args.set(key, process.argv[i + 1]);
        i++;
      } else {
        args.set(key, true);
      }
    } else if (arg.startsWith("-")) {
      const key = arg.replace(/^-/, "");
      if (i + 1 < process.argv.length && !process.argv[i + 1].startsWith("-")) {
        args.set(key, process.argv[i + 1]);
        i++;
      } else {
        args.set(key, true);
      }
    }
  }
  return {
    input: (args.get("i") || args.get("in") || "reports/worldclass_live.jsonl") as string,
    output: (args.get("o") || args.get("out") || "reports/worldclass_live.norm.jsonl") as string,
    dedupeWindowSec: Number(args.get("dedupe_sec") || 900), // 15 min default
    enforceMonotonic: args.has("enforce_monotonic") || args.has("enforce-monotonic"),
    sessionWindowLimit: Number(args.get("session_window_limit") || 50),
  };
}

const { input, output, dedupeWindowSec, enforceMonotonic, sessionWindowLimit } = parseArgs();
fs.mkdirSync(path.dirname(output), { recursive: true });

if (!fs.existsSync(input)) {
  console.log(`[normalize_worldclass] Input file not found: ${input}, creating empty output`);
  fs.writeFileSync(output, "", "utf-8");
  process.exit(0);
}

const rl = createInterface({
  input: fs.createReadStream(input, { encoding: "utf-8" }),
  crlfDelay: Infinity,
});

const sessionMap = new Map<string, SessionState>();
const outStream = fs.createWriteStream(output, { encoding: "utf-8" });
const toneDeltas: number[] = [];
let kept = 0;
let skipped = 0;

function shouldKeep(
  state: SessionState,
  key: string,
  tsMs: number,
  enforceMonotonic: boolean
): { keep: boolean; reason?: string } {
  // Per-session window limit
  if (state.eventCount >= sessionWindowLimit) {
    return { keep: false, reason: "session_window_limit" };
  }

  // Monotonic timestamp check
  if (enforceMonotonic && state.lastTs !== undefined && tsMs < state.lastTs) {
    return { keep: false, reason: "non_monotonic_ts" };
  }

  // TTL-based dedupe
  const cutoff = tsMs - dedupeWindowSec * 1000;
  for (const [k, t] of Array.from(state.recentKeys.entries())) {
    if (t < cutoff) state.recentKeys.delete(k);
  }
  if (state.recentKeys.has(key)) {
    return { keep: false, reason: "duplicate_key" };
  }

  state.recentKeys.set(key, tsMs);
  state.lastTs = tsMs;
  state.eventCount += 1;
  return { keep: true };
}

(async () => {
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    let ev: AnyObj;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }

    ev = snakeKeysDeep(ev);
    ev.ts = toIso(ev.ts);
    const tsMs = Date.parse(ev.ts);

    ev.session_id ||= ev.seed?.session_id || ev.run_id || "unknown";
    if (ev.seed && typeof ev.seed === "object") ev.seed_id = ev.seed_id || ev.seed.id;

    if (ev.kpi && typeof ev.kpi === "object") {
      if (!ev.kpi.explain) {
        const src = ev.kpi;
        ev.kpi.explain = {
          coverage: src.explain_coverage ?? src.coverage ?? ev.explain?.coverage ?? 0,
          has_evidence: src.explain_has_evidence ?? src.has_evidence ?? ev.explain?.has_evidence ?? 0,
          no_advice: src.explain_no_advice ?? src.no_advice ?? ev.explain?.no_advice ?? 0,
          level: src.explain_level ?? ev.explain?.level,
          style: src.explain_style ?? ev.explain?.style,
        };
      }
      if (!ev.kpi.memory) {
        const src = ev.kpi;
        ev.kpi.memory = {
          mrr: src.memory_mrr ?? src.mrr ?? 0,
          hit_at_3: src.memory_hit_at_3 ?? src.hit_at_3 ?? src["memory_hit@3"] ?? 0,
        };
      }
    }

    const sess = String(ev.session_id);
    const state = sessionMap.get(sess) ?? {
      lastTone: undefined,
      recentKeys: new Map(),
      lastTs: undefined,
      eventCount: 0,
    };
    const vec = Array.isArray(ev.tone) ? ev.tone : ev.tone?.vec;
    if (Array.isArray(vec)) {
      if (Array.isArray(state.lastTone)) {
        const cos = cosine(state.lastTone, vec);
        const delta = 1 - cos;
        toneDeltas.push(delta);
        ev.tone = { vec, delta };
      } else {
        ev.tone = { vec, delta: ev.tone?.delta ?? 0 };
      }
      state.lastTone = vec;
    }

    const dedupeKey = `${ev.run_id || ""}|${ev.seed_id || ""}`;
    const keepResult = shouldKeep(state, dedupeKey, tsMs, enforceMonotonic);
    if (!keepResult.keep) {
      skipped += 1;
      if (keepResult.reason) {
        ev.skipped_reason = keepResult.reason;
        // Log skipped events for revision
        outStream.write(JSON.stringify(ev) + "\n");
      }
      continue;
    }

    sessionMap.set(sess, state);

    ev.style = {
      likability_proxy: ev.style?.likability_proxy ?? 0,
      empathy_score: ev.style?.empathy_score ?? 0,
      question_count: ev.style?.question_count ?? 0,
      echo_ratio: ev.style?.echo_ratio ?? 0,
      tone_delta: ev.tone?.delta ?? ev.style?.tone_delta ?? 0,
    };

    outStream.write(JSON.stringify(ev) + "\n");
    kept += 1;
  }
  outStream.end();
  const td95 = p95(toneDeltas);
  console.log(`[normalize_worldclass] kept=${kept} skipped=${skipped} tone_delta_p95=${td95.toFixed(4)} -> ${output}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
