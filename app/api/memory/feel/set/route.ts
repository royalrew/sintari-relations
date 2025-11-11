import { NextRequest, NextResponse } from "next/server";
import { feelRepo } from "@/lib/memory/subject_feel";

export async function POST(req: NextRequest) {
  try {
    const { subject_id, value } = await req.json();
    if (!subject_id || typeof subject_id !== "string") {
      return NextResponse.json({ error: "subject_id krävs" }, { status: 400 });
    }
    if (typeof value !== "number") {
      return NextResponse.json({ error: "value krävs (1-5)" }, { status: 400 });
    }
    const record = feelRepo.set(subject_id, value);
    return NextResponse.json(record);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "server error" }, { status: 500 });
  }
}

