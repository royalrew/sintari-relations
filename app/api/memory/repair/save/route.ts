import { NextRequest, NextResponse } from "next/server";
import { quickRepair } from "@/lib/memory/quick_repair";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subject_id, text, when_ts } = body ?? {};
    if (!subject_id || typeof subject_id !== "string") {
      return NextResponse.json({ error: "subject_id krävs" }, { status: 400 });
    }
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "text krävs" }, { status: 400 });
    }
    const record = quickRepair.saveFacet({
      subject_id,
      text,
      when_ts: typeof when_ts === "number" ? when_ts : null,
    });
    return NextResponse.json(record);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "server error" }, { status: 500 });
  }
}

