import React from "react";

export default function P95Stat({
  label,
  value,
  warn,
  danger,
  suffix = "%",
  direction = "high",
}: {
  label: string;
  value: number;
  warn: number;
  danger: number;
  suffix?: string;
  direction?: "high" | "low";
}) {
  let color = "text-emerald-600";
  if (direction === "high") {
    if (value >= warn) color = "text-amber-600";
    if (value >= danger) color = "text-red-600";
  } else {
    if (value <= warn) color = "text-amber-600";
    if (value <= danger) color = "text-red-600";
  }

  return (
    <div className="p-4 rounded-2xl shadow bg-white">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>
        {(value * 100).toFixed(1)}{suffix}
      </div>
    </div>
  );
}
