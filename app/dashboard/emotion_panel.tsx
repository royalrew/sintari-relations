"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

type EmotionData = {
  window: string;
  events: number;
  counts_by_level: {
    neutral: number;
    light: number;
    plus: number;
    red: number;
  };
  p50_latency_ms: number;
  p95_latency_ms: number;
  red_rate: number;
  sv_en_gap: number;
  generated_utc: string;
};

const fetcher = async (url: string): Promise<EmotionData | null> => {
  try {
    // Force no cache, add timestamp to bust cache
    const timestamp = Date.now();
    const res = await fetch(`${url}?t=${timestamp}`, { 
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
    });
    if (!res.ok) {
      console.warn(`[EmotionPanel] API returned ${res.status}`);
      return null;
    }
    const data = await res.json();
    console.log(`[EmotionPanel] Fetched data:`, data);
    return data;
  } catch (error) {
    console.error("[EmotionPanel] Fetcher error:", error);
    return null;
  }
};

export default function EmotionPanel() {
  const [data, setData] = useState<EmotionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // First, trigger aggregation if needed (quick check)
        // Then fetch summary
        const result = await fetcher("/api/emotion/summary");
        setData(result);
        setLoading(false);
        
        if (result) {
          console.log("[EmotionPanel] Loaded data:", result);
        }
      } catch (error) {
        console.error("[EmotionPanel] Fetch error:", error);
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000); // 1 min refresh (was 5 min)

    return () => clearInterval(interval);
  }, []);

  // Smart refresh: check if aggregation is running, handle debounce, auto-update
  const refreshData = async () => {
    if (refreshing) {
      // Already refreshing - show message
      setRefreshStatus("Uppdaterar redan...");
      return;
    }

    setRefreshing(true);
    setRefreshStatus("Kör aggregation...");
    setLoading(true);

    try {
      // Step 1: Trigger aggregation
      const aggRes = await fetch("/api/emotion/aggregate", { cache: "no-store" });
      const aggData = await aggRes.json();

      if (aggData.running) {
        // Aggregation already in progress - use last known data
        setRefreshStatus("Körs redan, använder senaste data...");
        if (aggData.stats) {
          setData(aggData.stats);
        }
        // Poll for completion
        await pollForCompletion();
      } else if (aggData.ok) {
        // Aggregation started/completed
        setRefreshStatus("Uppdaterar data...");
        console.log("[EmotionPanel] Aggregation completed:", aggData.stats);
        
        // Wait for file to be written
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Fetch fresh data
        const result = await fetcher("/api/emotion/summary");
        setData(result);
        
        if (result) {
          setRefreshStatus(`✅ ${result.events} events uppdaterade`);
          console.log("[EmotionPanel] Refreshed data:", result);
          
          // Clear status message after 2 seconds
          setTimeout(() => setRefreshStatus(null), 2000);
        }
      } else {
        setRefreshStatus("❌ Fel vid aggregation");
        console.warn("[EmotionPanel] Aggregation failed:", aggData.error);
        setTimeout(() => setRefreshStatus(null), 3000);
      }
    } catch (error) {
      setRefreshStatus("❌ Nätverksfel");
      console.error("[EmotionPanel] Refresh error:", error);
      setTimeout(() => setRefreshStatus(null), 3000);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Poll for aggregation completion (when already running)
  const pollForCompletion = async () => {
    let attempts = 0;
    const maxAttempts = 10; // 10 attempts * 500ms = 5 seconds max

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const aggRes = await fetch("/api/emotion/aggregate", { cache: "no-store" });
      const aggData = await aggRes.json();

      if (!aggData.running) {
        // Aggregation completed
        setRefreshStatus("Uppdaterar data...");
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const result = await fetcher("/api/emotion/summary");
        setData(result);
        
        if (result) {
          setRefreshStatus(`✅ ${result.events} events uppdaterade`);
          setTimeout(() => setRefreshStatus(null), 2000);
        }
        return;
      }

      attempts++;
    }

    // Timeout - use last known data
    setRefreshStatus("Timeout, visar senaste data");
    const result = await fetcher("/api/emotion/summary");
    setData(result);
    setTimeout(() => setRefreshStatus(null), 2000);
  };

  if (loading) {
    return (
      <Card className="p-4 border rounded-2xl">
        <div className="text-lg font-semibold">Micro-Mood Live (24h)</div>
        <div className="text-sm text-muted-foreground mt-2">
          Laddar...
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="p-4 border rounded-2xl">
        <div className="text-lg font-semibold">Micro-Mood Live (24h)</div>
        <div className="text-sm text-muted-foreground mt-2">
          Inga data ännu
        </div>
      </Card>
    );
  }

  const c = data.counts_by_level || { neutral: 0, light: 0, plus: 0, red: 0 };

  return (
    <Card className="p-4 border rounded-2xl space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Micro-Mood Live (24h)</div>
        <div className="flex items-center gap-2">
          {refreshStatus && (
            <span className="text-xs text-muted-foreground animate-pulse">
              {refreshStatus}
            </span>
          )}
          <button
            onClick={refreshData}
            disabled={loading || refreshing}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={refreshing ? "Uppdaterar..." : "Uppdatera data"}
          >
            {refreshing ? (
              <span className="animate-spin">⏳</span>
            ) : (
              "🔄"
            )}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Events" value={data.events.toString()} />
        <Stat label="p95 latency" value={`${data.p95_latency_ms} ms`} />
        <Stat label="RED rate" value={`${(data.red_rate * 100).toFixed(1)} %`} />
        <Stat label="SV/EN gap" value={data.sv_en_gap.toFixed(3)} />
      </div>
      <div className="text-sm opacity-70 mt-2">
        Neutral: {c.neutral} • Light: {c.light} • Plus: {c.plus} • RED: {c.red}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl shadow-sm bg-white">
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-base font-medium">{value}</div>
    </div>
  );
}

