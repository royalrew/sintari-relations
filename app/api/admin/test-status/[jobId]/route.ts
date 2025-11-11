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
  console.log(`[API] /test-status jobId=${jobId}`);
  const job = getJob(jobId);
  if (!job) {
    console.warn(`[API] /test-status not found for ${jobId}`);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const response: any = {
    status: job.status,
    progress: job.progress,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
  };

  // If job is completed or failed, include results directly
  if (job.status === "completed" || job.status === "failed") {
    const duration_ms =
      job.startedAt && job.finishedAt
        ? new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()
        : 0;

    response.results = {
      tests: job.tests,
      metrics: job.metrics,
      summary: {
        total: job.tests.length,
        passed: job.tests.filter((t) => t.status === "passed").length,
        failed: job.tests.filter((t) => t.status === "failed").length,
        duration_ms,
      },
      raw: job.raw,
    };
  }

  return NextResponse.json(response);
}
