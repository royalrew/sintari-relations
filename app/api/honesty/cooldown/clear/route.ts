import { NextRequest, NextResponse } from "next/server";

import { cooldown } from "@/lib/server/cooldown";

type Body = {
  key?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const key = String(body?.key ?? "").trim();
    if (!key) {
      return new NextResponse("key required", { status: 400 });
    }
    cooldown.clear(key);
    return NextResponse.json({ ok: true });
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }
}

