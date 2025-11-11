import React from "react";

export function MetricCard({
  title,
  items,
}: {
  title: string;
  items: {
    label: string;
    value: string;
    hint?: string;
    ok?: boolean;
    warn?: boolean;
    fail?: boolean;
  }[];
}) {
  return (
    <div className="rounded-2xl shadow-sm border p-4 bg-white">
      <h3 className="text-lg font-semibold mb-3">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item, idx) => {
          const badgeClass = item.fail
            ? "bg-red-50 text-red-700"
            : item.warn
            ? "bg-amber-50 text-amber-700"
            : "bg-emerald-50 text-emerald-700";
          return (
            <div key={idx} className="flex items-start justify-between rounded-xl border p-3">
              <div>
                <div className="text-sm text-gray-500">{item.label}</div>
                {item.hint && <div className="text-xs text-gray-400">{item.hint}</div>}
              </div>
              <div className={`ml-3 text-sm font-mono px-2 py-1 rounded ${badgeClass}`}>{item.value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
