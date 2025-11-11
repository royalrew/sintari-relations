import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

const SUMMARY_PATH = path.resolve(process.cwd(), "reports/telemetry_budget_summary.json");

export async function POST() {
  try {
    if (fs.existsSync(SUMMARY_PATH)) {
      fs.rmSync(SUMMARY_PATH);
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

