import { promises as fs } from "fs";
import path from "path";

export type NormRow = {
  ts: string;
  session_id: string;
  run_id?: string;
  seed_id?: string;
  kpi?: { explain?: any; memory?: any };
  style?: { likability_proxy?: number; echo_ratio?: number; tone_delta?: number };
  honesty?: {
    active?: number | boolean;
    no_advice?: number | boolean;
    repair_accepted?: number | boolean;
    reasons?: string[];
  };
  lang?: { expected?: string; detected?: string };
  subject_ctx?: { hit?: boolean; confidence?: number };
  goals?: {
    created?: number;
    updated?: number;
    progress_delta?: number;
    coach_ok?: number;
    coach_block?: number;
  };
  repair?: {
    prompt_shown?: number;
    completed?: number;
    time_to_complete_ms?: number;
  };
  reception?: {
    handoff?: number;
    summary_opt_in?: number;
    honesty_prompt?: number;
    repair_completion_ms?: number;
  };
  coach?: {
    goal_first_set?: number;
    goal_session_start?: number;
    goal_progress?: number;
    ctx_hit?: number;
  };
  couples?: {
    handoff?: number;
    repair_accept?: number;
  };
};

export async function readNormJsonl(filePath = "reports/worldclass_live.norm.jsonl"): Promise<NormRow[]> {
  try {
    const abs = path.resolve(process.cwd(), filePath);
    const buf = await fs.readFile(abs, "utf8");
    return buf
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((row): row is NormRow => !!row);
  } catch {
    return [];
  }
}

export async function readCanaryLog(filePath = "reports/si/canary_drift_log.jsonl") {
  try {
    const abs = path.resolve(process.cwd(), filePath);
    const buf = await fs.readFile(abs, "utf8");
    return buf
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}
