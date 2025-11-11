import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { enqueue } from "@/lib/adminJobs";

export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  let percent = "0";
  try {
    const body = await req.json();
    if (body?.percent !== undefined) percent = String(body.percent);
  } catch {
    // ignore
  }

  const jobId = enqueue("canary_toggle", { percent });
  return NextResponse.json({ jobId });
}
