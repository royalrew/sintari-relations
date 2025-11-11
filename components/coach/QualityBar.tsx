"use client";

export function QualityBar({
  score01,           // 0..1
  label,             // t.ex. "Analyskvalitet"
  showTicks = true,
}: {
  score01: number;
  label?: string;
  showTicks?: boolean;
}) {
  const clamped = Math.max(0, Math.min(1, score01));
  // Färg: röd (0deg) → gul (60deg) → grön (120deg). HSL för mjuk övergång.
  const hue = 120 * clamped;                // 0..120
  const widthPct = Math.max(6, Math.round(clamped * 100)); // aldrig 0% visuellt

  // Diskret färg-klass för fallback (server-render/No-JS flash)
  const fallback =
    clamped >= 0.8 ? "bg-emerald-500" :
    clamped >= 0.5 ? "bg-amber-500" :
    "bg-rose-500";

  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 flex items-end justify-between">
          <div className="text-sm font-semibold text-gray-900">{label}</div>
          <div className="text-xs text-gray-600">{Math.round(clamped * 10)}/10</div>
        </div>
      )}

      <div
        role="progressbar"
        aria-label={label || "Kvalitet"}
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={Math.round(clamped * 10)}
        className="relative h-3 w-full overflow-hidden rounded-full bg-gray-100"
      >
        {/* Track tick marks */}
        {showTicks && (
          <div className="pointer-events-none absolute inset-0 opacity-40">
            <div className="grid h-full w-full grid-cols-10">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="border-r border-white/70" />
              ))}
            </div>
          </div>
        )}

        {/* Färgfyllnad (HSL inline för mjuk gradient i realtid) */}
        <div
          className={`h-full ${fallback} transition-[width] duration-300 ease-out`}
          style={{
            width: `${widthPct}%`,
            backgroundColor: `hsl(${hue}deg 85% 45%)`,
          }}
        />

        {/* Subtil gloss/ljus */}
        <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/50" />
      </div>

      {/* Legend: Röd–Gul–Grön (valfritt) */}
      <div className="mt-1 flex items-center justify-between text-[10px] text-gray-500">
        <span>Behöver mer</span>
        <span>På gång</span>
        <span>Redo</span>
      </div>
    </div>
  );
}

