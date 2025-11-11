import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { enqueue } from "@/lib/adminJobs";

const ALLOWED_STYLES = new Set(["warm", "neutral", "coach"]);
const ALLOWED_LEVELS = new Set(["brief", "standard", "deep"]);

export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  let payload: any = {};
  try {
    payload = await req.json();
  } catch (err) {
    payload = {};
  }

  const rawStyle = typeof payload?.style === "string" ? payload.style.toLowerCase() : undefined;
  const rawLevel = typeof payload?.level === "string" ? payload.level.toLowerCase() : undefined;

  const style = rawStyle && ALLOWED_STYLES.has(rawStyle) ? rawStyle : undefined;
  const level = rawLevel && ALLOWED_LEVELS.has(rawLevel) ? rawLevel : undefined;

  const options: Record<string, string> = {};
  if (style) options.EXPLAIN_STYLE = style;
  if (level) options.EXPLAIN_LEVEL = level;

  const jobId = enqueue("explain", Object.keys(options).length ? options : undefined);
  return NextResponse.json({ jobId });
}
