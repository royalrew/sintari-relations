import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * API endpoint för att köra emotion events aggregator manuellt
 * GET /api/emotion/aggregate
 */
export async function GET() {
  try {
    const lockFile = path.join(process.cwd(), "reports", ".agg.lock");
    
    // Check if aggregation is already running
    if (fs.existsSync(lockFile)) {
      try {
        const lockData = JSON.parse(fs.readFileSync(lockFile, "utf8"));
        const age = Date.now() - lockData.timestamp;
        
        // If lock is fresh (less than 60s), return "running" status
        if (age < 60000) {
          // Return last known KPI with running flag
          const kpiFile = path.join(process.cwd(), "reports", "pyramid_live_kpis.json");
          let emotion = null;
          if (fs.existsSync(kpiFile)) {
            try {
              const kpi = JSON.parse(fs.readFileSync(kpiFile, "utf8"));
              emotion = kpi.emotion ?? null;
            } catch {}
          }
          
          return NextResponse.json({
            ok: true,
            running: true,
            message: "Aggregation already in progress",
            stats: emotion,
          }, {
            headers: { "Cache-Control": "no-store" },
          });
        } else {
          // Stale lock - remove it
          fs.unlinkSync(lockFile);
        }
      } catch (lockError) {
        // Lock file corrupted - remove it
        try { fs.unlinkSync(lockFile); } catch {}
      }
    }
    
    const scriptPath = path.join(process.cwd(), "scripts", "agg_emotion_events.mjs");
    
    return new Promise((resolve) => {
      const proc = spawn("node", [scriptPath], {
        cwd: process.cwd(),
        env: { ...process.env },
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      proc.on("close", (code) => {
        if (code === 0) {
          // Parse output to extract stats
          const match = stdout.match(/events=(\d+)\s+p95=(\d+)ms\s+gap=([\d.]+)/);
          resolve(
            NextResponse.json(
              {
                ok: true,
                message: "Aggregation completed",
                stats: match
                  ? {
                      events: parseInt(match[1]),
                      p95_latency_ms: parseInt(match[2]),
                      sv_en_gap: parseFloat(match[3]),
                    }
                  : null,
                output: stdout.trim(),
              },
              {
                headers: {
                  "Cache-Control": "no-store",
                },
              }
            )
          );
        } else {
          resolve(
            NextResponse.json(
              {
                ok: false,
                error: "Aggregation failed",
                stderr: stderr.trim(),
              },
              { status: 500 }
            )
          );
        }
      });

      proc.on("error", (error) => {
        resolve(
          NextResponse.json(
            {
              ok: false,
              error: error.message,
            },
            { status: 500 }
          )
        );
      });
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

