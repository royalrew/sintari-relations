import useSWR from "swr";
import type { AdminAgg, Thresholds } from "@/lib/metrics/aggregateStyle";

type AdminMetricsResponse = {
  agg: AdminAgg;
  thresholds: Thresholds;
  status: { level: "ok" | "warn" | "fail"; warn: string[]; fail: string[] };
  hours: number;
  updatedAt: string;
};

const fetcher = async (url: string): Promise<AdminMetricsResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
};

export function useAdminMetrics(hours = 24, refreshMs = 30_000) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<AdminMetricsResponse>(
    `/api/admin/metrics?hours=${hours}`,
    fetcher,
    {
      refreshInterval: refreshMs,
      revalidateOnFocus: true,
    },
  );

  return {
    data,
    error,
    isLoading,
    isValidating,
    refresh: () => mutate(undefined, { revalidate: true }),
  };
}

