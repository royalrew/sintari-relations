import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { enqueue } from "@/lib/adminJobs";

export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  const jobId = enqueue("all");
  return NextResponse.json({ jobId });
}

