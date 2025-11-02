import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const p = path.join(process.cwd(), "reports", "pyramid_live_kpis.json");
  
  if (!fs.existsSync(p)) {
    return NextResponse.json({ emotion: null }, { status: 200 });
  }
  
  try {
    const json = JSON.parse(fs.readFileSync(p, "utf8"));
    const emotion = json.emotion;
    
    // Auto-aggregate if emotion data is old (older than 2 minutes) or missing
    if (emotion && emotion.generated_utc) {
      const generated = new Date(emotion.generated_utc);
      const now = new Date();
      const ageMinutes = (now.getTime() - generated.getTime()) / 1000 / 60;
      
      // If data is older than 2 minutes, trigger aggregation in background
      if (ageMinutes > 2) {
        // Spawn aggregator in background (non-blocking)
        const scriptPath = path.join(process.cwd(), "scripts", "agg_emotion_events.mjs");
        spawn("node", [scriptPath], {
          cwd: process.cwd(),
          detached: true,
          stdio: "ignore",
        }).unref();
      }
    }
    
    return NextResponse.json(emotion ?? null, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[API] Failed to read emotion summary:", error);
    return NextResponse.json({ emotion: null }, { status: 200 });
  }
}

