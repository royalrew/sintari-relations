import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getJob } from "@/lib/adminJobs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  
  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const duration_ms =
    job.startedAt && job.finishedAt
      ? new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()
      : 0;

  return NextResponse.json({
    tests: job.tests,
    metrics: job.metrics,
    summary: {
      total: job.tests.length,
      passed: job.tests.filter((t) => t.status === "passed").length,
      failed: job.tests.filter((t) => t.status === "failed").length,
      duration_ms,
    },
    raw: job.raw,
  });
}

