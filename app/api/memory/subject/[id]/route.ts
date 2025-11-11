import { NextRequest, NextResponse } from "next/server";
import { SubjectCore } from "@/lib/memory/subject_memory";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const subject = await SubjectCore.get(params.id);
    if (!subject) {
      return NextResponse.json({ error: "Subject saknas" }, { status: 404 });
    }
    return NextResponse.json(subject);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "server error" }, { status: 500 });
  }
}
