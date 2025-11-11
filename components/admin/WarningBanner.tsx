import React from "react";

type WarningBannerProps = {
  level?: "ok" | "warn" | "fail";
  warnings?: string[];
  failures?: string[];
  updatedAt?: string;
};

export function WarningBanner({ level = "ok", warnings = [], failures = [], updatedAt }: WarningBannerProps) {
  if (failures.length > 0 || level === "fail") {
    return (
      <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
        <strong>Gate-fail upptäckt.</strong> Canary backoff aktiverad (kontrollera nightly-loggar).
        {!!failures.length && (
          <div className="mt-1 text-sm opacity-80">Fail: {failures.join(", ")}</div>
        )}
        {updatedAt && <div className="mt-1 text-xs text-red-700/70">Senast uppdaterad: {updatedAt}</div>}
      </div>
    );
  }

  if (warnings.length > 0 || level === "warn") {
    return (
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
        <strong>Nära gränsen.</strong> Kvaliteten ligger nära SLO:erna — följ upp inom 24h.
        {!!warnings.length && (
          <div className="mt-1 text-sm opacity-80">Warn: {warnings.join(", ")}</div>
        )}
        {updatedAt && <div className="mt-1 text-xs text-amber-700/70">Senast uppdaterad: {updatedAt}</div>}
      </div>
    );
  }

  return null;
}
