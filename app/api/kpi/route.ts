import { NextResponse } from "next/server";
import { loadKPI } from "@/lib/kpi";
import { unstable_cache } from "next/cache";

export const runtime = "nodejs";

const getKPI = unstable_cache(
  async () => loadKPI(),
  ["kpi-cache"],
  { 
    tags: ["kpi"],
    revalidate: 60 // Revalidate every 60 seconds
  }
);

export async function GET() {
  try {
    const data = await getKPI();
    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
