import { NextRequest, NextResponse } from "next/server";
import { goalRepo } from "@/lib/memory/subject_goals";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get("subject");
    const includeArchived = searchParams.get("includeArchived") === "1";

    if (!subjectId) {
      return NextResponse.json({ error: "subject krävs" }, { status: 400 });
    }

    const goals = await goalRepo.listBySubject(subjectId, { includeArchived });
    return NextResponse.json({ goals });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "server error" }, { status: 500 });
  }
}

