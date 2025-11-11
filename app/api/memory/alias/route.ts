import { NextRequest, NextResponse } from "next/server";
import { SubjectCore } from "@/lib/memory/subject_memory";

export async function POST(req: NextRequest) {
  try {
    const { subjectId, alias } = await req.json();
    if (!subjectId || !alias) {
      return NextResponse.json({ error: "subjectId och alias krävs" }, { status: 400 });
    }

    await SubjectCore.addAlias(subjectId, alias);
    await SubjectCore.touch(subjectId);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "server error" }, { status: 500 });
  }
}
