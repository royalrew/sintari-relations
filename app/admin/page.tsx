'use client';

import { useAdminMetrics } from "@/lib/hooks/useAdminMetrics";
import { WarningBanner } from "@/components/admin/WarningBanner";
import { DashboardPanels } from "@/components/admin/DashboardPanels";
import AdminControls from "./AdminControls";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  const { data, error, isLoading, isValidating, refresh } = useAdminMetrics(24, 20_000);
  const agg = data?.agg;
  const thresholds = data?.thresholds;
  const status = data?.status;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <section className="space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Admin · Kvalitet & Drift</h1>
            <p className="text-xs text-muted-foreground">
              Live-telemetri från worldclass_live.norm.jsonl (fönster: {data?.hours ?? 24}h)
            </p>
          </div>
          <button
            className="rounded-xl border px-3 py-1.5 text-sm hover:shadow disabled:cursor-wait disabled:opacity-60"
            onClick={async () => {
              await refresh();
            }}
            disabled={isLoading || isValidating}
          >
            {isLoading || isValidating ? "Uppdaterar…" : "Uppdatera"}
          </button>
        </div>

        {status && (
          <WarningBanner
            level={status.level}
            warnings={status.warn}
            failures={status.fail}
            updatedAt={data?.updatedAt}
          />
        )}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {String(error)}
          </div>
        ) : (
          <DashboardPanels agg={agg} thresholds={thresholds} loading={isLoading} />
        )}

        <div className="text-xs text-muted-foreground">
          Uppdaterad: {data?.updatedAt ?? "—"}
        </div>
      </section>

      <AdminControls />
    </div>
  );
}
