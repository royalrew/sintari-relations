import { NextRequest, NextResponse } from "next/server";
import { goalRepo } from "@/lib/memory/subject_goals";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      subject_id,
      goal_text,
      created_by,
      progress,
      constraints,
      cadence,
      due_ts,
      owner,
      blockers,
    } = body ?? {};

    if (!subject_id || typeof subject_id !== "string") {
      return NextResponse.json({ error: "subject_id krävs" }, { status: 400 });
    }
    if (!goal_text || typeof goal_text !== "string") {
      return NextResponse.json({ error: "goal_text krävs" }, { status: 400 });
    }
    if (!created_by || typeof created_by !== "string") {
      return NextResponse.json({ error: "created_by krävs" }, { status: 400 });
    }

    const goal = await goalRepo.create({
      subject_id,
      goal_text,
      created_by,
      progress: typeof progress === "number" ? progress : undefined,
      constraints:
        constraints && typeof constraints === "object" ? (constraints as Record<string, any>) : undefined,
      cadence,
      due_ts,
      owner,
      blockers: Array.isArray(blockers) ? blockers : undefined,
    });

    return NextResponse.json(goal);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "server error" }, { status: 500 });
  }
}

