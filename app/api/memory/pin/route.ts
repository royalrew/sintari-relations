import { NextRequest, NextResponse } from "next/server";
import { SubjectCore } from "@/lib/memory/subject_memory";

export async function POST(req: NextRequest) {
  try {
    const { name, subjectId } = await req.json();
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name krävs" }, { status: 400 });
    }

    let sid = typeof subjectId === "string" ? subjectId : undefined;
    let prevPrimary: string | undefined;

    if (!sid) {
      const existing = await SubjectCore.findByName(name);
      if (existing) {
        sid = existing.subject_id;
      } else {
        const created = await SubjectCore.create(name);
        sid = created.subject_id;
      }
    } else {
      const existing = await SubjectCore.get(sid);
      if (existing) {
        prevPrimary = existing.primary_name;
      }
    }

    await SubjectCore.pinAsPrimary(sid!, name);
    await SubjectCore.touch(sid!);

    return NextResponse.json({ subjectId: sid, prevPrimary });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "server error" }, { status: 500 });
  }
}
