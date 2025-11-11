import { NextResponse } from "next/server";
import fs from "node:fs";

import { requireAdmin } from "@/lib/auth";
import { enqueue } from "@/lib/adminJobs";

function eligible(): { ok: boolean; reason?: string } {
  try {
    const raw = fs.readFileSync("reports/si/canary_state.json", "utf8");
    const state = JSON.parse(raw);
    const now = Math.floor(Date.now() / 1000);
    const age = now - (state.last_action_ts ?? 0);
    if ((state.percent ?? 0) < 5) return { ok: false, reason: "canary < 5%" };
    if ((state.passes_in_row ?? 0) < 2) return { ok: false, reason: "< 2 raka PASS" };
    if (age < 24 * 60 * 60) return { ok: false, reason: "< 24h sedan senaste ändring" };
    if ((state.fails_in_row ?? 0) > 0) return { ok: false, reason: "nyligen FAIL" };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "saknar state" };
  }
}

export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const gate = eligible();
  if (!gate.ok) {
    return NextResponse.json({ error: "Not eligible", reason: gate.reason }, { status: 412 });
  }

  const jobId = enqueue("promote_canary", {});
  return NextResponse.json({ jobId });
}
