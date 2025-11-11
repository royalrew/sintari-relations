import fs from "fs";
import path from "path";

const WORLDCLASS_PATH = process.env.WORLDCLASS_LIVE_PATH
  ? path.resolve(process.env.WORLDCLASS_LIVE_PATH)
  : path.join(process.cwd(), "reports", "worldclass_live.jsonl");

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function logExplainTelemetry(runId: string, explainOut: Record<string, any>) {
  if (!runId) runId = "unknown";
  const kpis = {
    "explain.coverage": explainOut?.why && explainOut?.patterns?.length ? 1.0 : 0.0,
    "explain.patterns_len": Array.isArray(explainOut?.patterns) ? explainOut.patterns.length : 0,
    "explain.has_evidence": explainOut?.evidence && explainOut.evidence.length > 0 ? 1.0 : 0.0,
    "explain.no_advice": explainOut?.no_advice ? 1.0 : 0.0,
    "explain.style": explainOut?.style ?? "warm",
    "explain.level": explainOut?.level ?? "standard",
  };

  const record = {
    ts: new Date().toISOString(),
    run_id: runId,
    kpi: kpis,
    details: {
      why: explainOut?.why ?? null,
      patterns: Array.isArray(explainOut?.patterns) ? explainOut.patterns : [],
      reflection: explainOut?.reflection ?? null,
      evidence: Array.isArray(explainOut?.evidence) ? explainOut.evidence : [],
    },
  };

  ensureDir(WORLDCLASS_PATH);
  fs.appendFileSync(WORLDCLASS_PATH, JSON.stringify(record) + "\n", "utf8");
}
