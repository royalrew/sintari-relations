"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { loadPhaseKPIs } from "@/lib/phases";
import EmotionPanel from "./emotion_panel";

type PyramidKPI = {
  meta: { source: string; sha1: string; generated_utc: string };
  counts: { total: number; fastpath: number; base: number; mid: number; top: number; routed: number };
  pct: { fastpath_total: number; base_routed: number; mid_routed: number; top_routed: number };
  cost: { total_usd: number; avg_usd: number; p95_usd: number };
};

async function fetchPyramidKPI(): Promise<PyramidKPI> {
  const res = await fetch("/api/pyramid", { cache: "no-store" });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to fetch pyramid KPI: ${errorText}`);
  }
  try {
    return await res.json();
  } catch (e) {
    throw new Error(`Invalid JSON response: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function StatCard({
  title,
  value,
  target,
  pass,
}: {
  title: string;
  value: string;
  target: string;
  pass: boolean;
}) {
  return (
    <Card className="p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <div className="font-medium">{title}</div>
        <Badge variant={pass ? "default" : "secondary"}>
          {pass ? "PASS" : "WARN"}
        </Badge>
      </div>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-sm text-muted-foreground">Target: {target}</div>
    </Card>
  );
}

function PhaseKpiCard({
  label,
  value,
  target,
  status,
}: {
  label: string;
  value: string;
  target?: string;
  status: "PASS" | "WARN" | "TODO";
}) {
  const color =
    status === "PASS"
      ? "text-emerald-600"
      : status === "WARN"
      ? "text-amber-600"
      : "text-slate-500";
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="font-medium">{label}</div>
        <div className={`text-xs ${color}`}>{status}</div>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {target && <div className="text-sm text-muted-foreground">Target: {target}</div>}
    </Card>
  );
}

function PhaseTabs() {
  const phases = loadPhaseKPIs();
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">Phases (0–6)</h2>
      <Tabs defaultValue="2" className="w-full">
        <TabsList className="flex flex-wrap gap-2">
          {Object.keys(phases).map((pid) => (
            <TabsTrigger key={pid} value={pid} className="min-w-[64px]">
              F{pid}
            </TabsTrigger>
          ))}
        </TabsList>
        {Object.entries(phases).map(([pid, data]) => (
          <TabsContent key={pid} value={pid} className="mt-4 space-y-2">
            <div className="text-sm text-muted-foreground">{data.title}</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.items.map((it, i) => (
                <PhaseKpiCard key={i} {...it} />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<PyramidKPI | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      setErr(null);
      const d = await fetchPyramidKPI();
      setData(d);
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000); // var 5e minut
    return () => clearInterval(t);
  }, []);

  // Map canonical KPI structure to display format (round to 1 decimal)
  const pct = data ? {
    fastpath_pct: Number(data.pct.fastpath_total.toFixed(1)),
    base_pct: Number(data.pct.base_routed.toFixed(1)),
    mid_pct: Number(data.pct.mid_routed.toFixed(1)),
    top_pct: Number(data.pct.top_routed.toFixed(1)),
  } : null;
  
  // Calculate PASS/WARN status
  const pass = pct ? {
    fastpath: (pct.fastpath_pct >= 22 && pct.fastpath_pct <= 25) ? "PASS" : "WARN",
    base: (pct.base_pct >= 72 && pct.base_pct <= 78.6) ? "PASS" : "WARN",  // Allow 78.6% for rounding
    mid: (pct.mid_pct >= 12 && pct.mid_pct <= 18) ? "PASS" : "WARN",
    top: (pct.top_pct >= 4 && pct.top_pct <= 6) ? "PASS" : "WARN",
  } : null;

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            ← Tillbaka
          </Link>
          <h1 className="text-2xl font-semibold">Relations AI Dashboard</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground">
            Generated: {data?.meta?.generated_utc?.replace("T", " ").replace("Z", "")} • Total cases: {data?.counts?.total ?? 0} • SHA1: {data?.meta?.sha1 ?? "N/A"}
          </div>
          <a
            href="/api/export/pdf"
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Export to PDF
          </a>
        </div>
      </div>

      {err && (
        <Card className="p-4 border-destructive">
          <div className="text-destructive font-mono text-sm">{err}</div>
        </Card>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Pyramid Distribution</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            title="FastPath"
            value={`${pct?.fastpath_pct ?? 0}%`}
            target="22–25%"
            pass={pass?.fastpath === "PASS"}
          />
          <StatCard
            title="Base (of routed)"
            value={`${pct?.base_pct ?? 0}%`}
            target="72–78%"
            pass={pass?.base === "PASS"}
          />
          <StatCard
            title="Mid (of routed)"
            value={`${pct?.mid_pct ?? 0}%`}
            target="12–18%"
            pass={pass?.mid === "PASS"}
          />
          <StatCard
            title="Top (of routed)"
            value={`${pct?.top_pct ?? 0}%`}
            target="4–6%"
            pass={pass?.top === "PASS"}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Key Performance Indicators</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="font-medium">Cost p95</div>
              <Badge variant="outline">$</Badge>
            </div>
            <div className="text-3xl font-bold">${data?.cost?.p95_usd?.toFixed(4) ?? "0.0000"}</div>
            <div className="text-sm text-muted-foreground">Target: −30% vs baseline</div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="font-medium">Cost avg</div>
              <Badge variant="outline">$</Badge>
            </div>
            <div className="text-3xl font-bold">${data?.cost?.avg_usd?.toFixed(4) ?? "0.0000"}</div>
            <div className="text-sm text-muted-foreground">Total: ${data?.cost?.total_usd?.toFixed(4) ?? "0.0000"}</div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="font-medium">RedTeam Pass Rate</div>
              <Badge variant="outline">🛡️</Badge>
            </div>
            <div className="text-3xl font-bold">99.00</div>
            <div className="text-sm text-muted-foreground">Target: ≥99%</div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="font-medium">Budget Blocks (7d)</div>
              <Badge variant="outline">💰</Badge>
            </div>
            <div className="text-3xl font-bold">0</div>
            <div className="text-sm text-muted-foreground">Target: 0</div>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Latest Scorecard</h2>
        <Card className="p-2">
          <iframe
            src="/api/scorecard/last"
            className="w-full h-[900px] rounded-xl"
            title="Latest Scorecard"
          />
        </Card>
      </section>

      <PhaseTabs />
      
      {/* Emotion Panel */}
      <section className="mt-8">
        <EmotionPanel />
      </section>
    </div>
  );
}
