import { NextRequest, NextResponse } from "next/server";
import { goalRepo } from "@/lib/memory/subject_goals";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { goal_id, goal_text, progress, constraints, cadence, due_ts, owner, blockers } = body ?? {};

    if (!goal_id || typeof goal_id !== "string") {
      return NextResponse.json({ error: "goal_id krävs" }, { status: 400 });
    }

    const existing = await goalRepo.get(goal_id);
    if (!existing) {
      return NextResponse.json({ error: "Mål saknas" }, { status: 404 });
    }

    let updated = existing;

    if (typeof goal_text === "string" && goal_text.trim().length > 0 && goal_text.trim() !== existing.goal_text) {
      updated = await goalRepo.updateText(goal_id, goal_text);
    }

    if (typeof progress === "number") {
      updated = await goalRepo.setProgress(goal_id, progress);
    }

    if (constraints && typeof constraints === "object") {
      updated = await goalRepo.setConstraints(goal_id, constraints as Record<string, string | number | boolean>);
    }

    if (cadence && ["daily", "weekly", "biweekly", "monthly"].includes(cadence)) {
      updated = await goalRepo.setCadence(goal_id, cadence as "daily" | "weekly" | "biweekly" | "monthly");
    }

    if (typeof due_ts === "string" || due_ts === null) {
      updated = await goalRepo.setDueTs(goal_id, due_ts ?? undefined);
    }

    if (typeof owner === "string" || owner === null) {
      updated = await goalRepo.setOwner(goal_id, owner ?? undefined);
    }

    if (Array.isArray(blockers)) {
      const filtered = blockers
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0);
      updated = await goalRepo.setBlockers(goal_id, filtered);
    }

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "server error" }, { status: 500 });
  }
}

