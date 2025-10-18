"use client";

export function DisclaimerBanner() {
  return (
    <div className="mt-4 p-3 text-sm rounded-lg border bg-yellow-50 border-yellow-100 text-yellow-900">
      🔎 Detta är AI-genererade reflektioner, inte terapi eller rådgivning. Använd med samtycke.
      <a className="underline ml-2" href="/legal/ethics" target="_blank" rel="noreferrer">
        Läs policyn
      </a>
      .
    </div>
  );
}

