import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";

import { requireAdmin } from "@/lib/auth";
import { enqueue } from "@/lib/adminJobs";

async function getCurrentPercent(): Promise<number> {
  const statePath = join(process.cwd(), "reports", "si", "canary_state.json");
  try {
    const raw = await fs.readFile(statePath, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.percent === "number") return parsed.percent;
  } catch {
    // ignore
  }
  if (process.env.CANARY_PERCENT) {
    const val = Number(process.env.CANARY_PERCENT);
    if (!Number.isNaN(val)) return val;
  }
  return 0;
}

export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const url = new URL(req.url);
  let deltaStr = url.searchParams.get("delta") ?? url.searchParams.get("percent") ?? "5";
  try {
    const body = await req.json();
    if (body?.delta) deltaStr = String(body.delta);
    else if (body?.percent) deltaStr = String(body.percent);
  } catch {
    // ignore body parse if not provided
  }

  const delta = Math.max(0, Number(deltaStr) || 0);
  const current = await getCurrentPercent();
  const next = Math.min(25, current + delta);

  const jobId = enqueue("canary_toggle", { percent: String(next) });
  return NextResponse.json({ jobId, current, next });
}
