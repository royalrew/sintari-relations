import { NextRequest, NextResponse } from "next/server";
import { feelRepo } from "@/lib/memory/subject_feel";

type Params = { id: string };

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "subject_id krävs" }, { status: 400 });
  }

  const record = feelRepo.get(id);
  if (!record) {
    return NextResponse.json({ subject_id: id, value: null, updated_ts: null }, { status: 200 });
  }
  return NextResponse.json(record);
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "subject_id krävs" }, { status: 400 });
  }
  const removed = feelRepo.remove(id);
  return NextResponse.json({ ok: removed });
}

