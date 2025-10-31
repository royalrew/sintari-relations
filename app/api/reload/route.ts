import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== process.env.DASH_RELOAD_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // invalidera cache-taggar som dashboarden använder
  ["kpi", "scorecard", "pyramid"].forEach(t => revalidateTag(t));
  return NextResponse.json({ ok: true });
}

