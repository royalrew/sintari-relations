"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import P95Stat from "@/components/metrics/P95Stat";
import { p95 } from "@/lib/metrics/p95";
import { useStyleAlarms } from "@/lib/hooks/useStyleAlarms";

type LiveEntry = {
  style?: { tone_delta?: number; echo_ratio?: number };
  honesty?: {
    active?: boolean;
    reasons?: string[];
    rate?: number;
    repair_accept_rate?: number;
    no_advice?: boolean;
    repair_accepted?: boolean;
  };
  kpi?: { explain?: { no_advice?: number | boolean } };
};

type LiveResponse = {
  entries: LiveEntry[];
};

export default function HonestyPanel() {
  const [data, setData] = useState<LiveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        const res = await fetch("/api/live_kpi", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as LiveResponse;
        setData(body);
      } catch (err: any) {
        setError(String(err?.message || err));
      } finally {
        setLoading(false);
      }
    };

    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, []);

  const events = data?.entries ?? [];
  const { warn, error: alarm } = useStyleAlarms(events);

  if (loading) {
    return (
      <Card className="p-4">
        <div className="text-lg font-semibold">Honesty Insights</div>
        <div className="text-sm text-muted-foreground mt-2">Laddar...</div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-4 border-destructive border">
        <div className="text-lg font-semibold">Honesty Insights</div>
        <div className="text-sm text-destructive mt-2">{error ?? "Inga data"}</div>
      </Card>
    );
  }

  const toneP95 = p95(events.map((entry) => entry.style?.tone_delta ?? 0));
  const echoP95 = p95(events.map((entry) => entry.style?.echo_ratio ?? 0));

  const honestyRates = events
    .map((entry) => entry.honesty?.rate)
    .filter((value): value is number => typeof value === "number" && !Number.isNaN(value));
  const repairRates = events
    .map((entry) => entry.honesty?.repair_accept_rate)
    .filter((value): value is number => typeof value === "number" && !Number.isNaN(value));

  const honestyRateP95 = honestyRates.length ? p95(honestyRates) : 0;
  const repairRateP95 = repairRates.length ? p95(repairRates) : 0;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Honesty Insights (Last 200)</div>
        {alarm ? (
          <Badge variant="destructive">Policy breach</Badge>
        ) : warn ? (
          <Badge variant="secondary">Varning</Badge>
        ) : (
          <Badge variant="outline">Stabilt</Badge>
        )}
      </div>

      {alarm && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Honesty är aktiv men no_advice flaggas som falsk i senaste svaret. Kontrollera policyn omedelbart.
        </div>
      )}
      {!alarm && warn && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Gul varning: honesty.rate under 10% eller tone drift nära gränsen. Granska regressionerna.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <P95Stat label="p95 Tone drift" value={toneP95} warn={0.04} danger={0.05} direction="high" />
        <P95Stat label="p95 Echo ratio" value={echoP95} warn={0.03} danger={0.05} direction="high" />
        <P95Stat label="Honesty rate" value={honestyRateP95} warn={0.10} danger={0.08} direction="low" />
        <P95Stat label="Repair accept" value={repairRateP95} warn={0.50} danger={0.45} direction="low" />
      </div>
    </Card>
  );
}

