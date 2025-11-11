import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { enqueue } from "@/lib/adminJobs";

export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const url = new URL(req.url);
  let percent = url.searchParams.get("percent");
  if (!percent) {
    try {
      const body = await req.json();
      percent = body?.percent ?? body?.delta ?? body?.value;
      console.log("[API] /canary/enable body", body);
    } catch {
      console.log("[API] /canary/enable no JSON body");
    }
  }
  if (!percent) {
    percent = process.env.CANARY_PERCENT || "5";
  }

  console.log("[API] /canary/enable -> percent", percent);
  const jobId = enqueue("canary_toggle", { percent });
  console.log("[API] /canary/enable enqueued", jobId);
  return NextResponse.json({ jobId });
}
