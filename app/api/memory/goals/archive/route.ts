import { NextRequest, NextResponse } from "next/server";
import { goalRepo } from "@/lib/memory/subject_goals";

export async function POST(req: NextRequest) {
  try {
    const { goal_id } = await req.json();
    if (!goal_id || typeof goal_id !== "string") {
      return NextResponse.json({ error: "goal_id krävs" }, { status: 400 });
    }

    const updated = await goalRepo.archive(goal_id);
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "server error" }, { status: 500 });
  }
}

