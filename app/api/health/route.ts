import { NextResponse } from "next/server";

export const runtime = "edge"; // snabbt & billigt

export async function GET() {
  return NextResponse.json({
    status: "ok",
    time: new Date().toISOString(),
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "v0.1",
    service: "Sintari Relations API",
  });
}

