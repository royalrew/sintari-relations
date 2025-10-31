import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import { getReportsDir } from "@/lib/kpi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // Always read fresh from file
export const revalidate = 0;

export async function GET() {
  const reportsDir = getReportsDir();
  const file = path.join(reportsDir, "scorecards", "last.html");
  try {
    const html = await fs.readFile(file, "utf-8");
    return new NextResponse(html, {
      status: 200,
      headers: { 
        "content-type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch {
    return new NextResponse(
      `<html><body><pre>Scorecard not found: ${file}</pre></body></html>`,
      {
        status: 404,
        headers: { "content-type": "text/html; charset=utf-8" },
      }
    );
  }
}

