import { NextRequest, NextResponse } from "next/server";

import { cooldown } from "@/lib/server/cooldown";

type Body = {
  key?: string;
  ttlMs?: number;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const key = String(body?.key ?? "").trim();
    if (!key) {
      return new NextResponse("key required", { status: 400 });
    }
    const ttlMs = typeof body?.ttlMs === "number" && Number.isFinite(body.ttlMs) ? body.ttlMs : undefined;
    const result = cooldown.ping(key, Date.now(), ttlMs);
    return NextResponse.json(result);
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }
}

