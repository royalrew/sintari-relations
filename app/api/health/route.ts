import { NextResponse } from "next/server";

export const runtime = "edge"; // snabbt & billigt

export async function GET() {
  try {
    const health = {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "v0.1",
      service: process.env.NEXT_PUBLIC_APP_NAME ?? "Sintari Relations API",
      environment: process.env.NODE_ENV ?? "development",
      uptime: process.uptime?.() ?? "unknown",
      // Deployment info
      deployment: {
        platform: process.env.VERCEL ? "vercel" : "local",
        region: process.env.VERCEL_REGION ?? "local",
      }
    };

    return NextResponse.json(health);
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        error: "Health check failed",
      },
      { status: 500 }
    );
  }
}

