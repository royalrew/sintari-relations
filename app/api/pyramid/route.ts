import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // No ISR, always fresh
export const revalidate = 0;

export async function GET() {
  try {
    const reportsDir = path.join(process.cwd(), "reports");
    const kpiFile = path.join(reportsDir, "pyramid_live_kpis.json");
    
    try {
      const buf = await readFile(kpiFile, "utf-8");
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    } catch (fileErr: any) {
      if (fileErr.code === "ENOENT") {
        return NextResponse.json(
          { 
            error: "KPI file not found. Run: python scripts/metrics/pyramid_report.py reports/pyramid_live.jsonl",
            path: kpiFile 
          },
          { 
            status: 404,
            headers: { "Cache-Control": "no-store" },
          }
        );
      }
      throw fileErr;
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message || err) },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}

