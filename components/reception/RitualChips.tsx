"use client";

import { focusCls } from "./Reception";

/**
 * Tre närvaro-mikroverktyg (ritualer)
 * Visas som val, aldrig push
 */
export function RitualChips({ onSelect }: { onSelect: (type: "breathe" | "pause" | "ground") => void }) {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      <button
        onClick={() => onSelect("breathe")}
        className={`rounded-xl border border-purple-200 bg-white/80 px-3 py-1.5 text-sm text-purple-700 hover:bg-white transition ${focusCls}`}
      >
        Andas en stund
      </button>
      <button
        onClick={() => onSelect("pause")}
        className={`rounded-xl border border-gray-200 bg-white/80 px-3 py-1.5 text-sm text-gray-700 hover:border-purple-300 hover:bg-white transition ${focusCls}`}
      >
        Vi pausar lite
      </button>
      <button
        onClick={() => onSelect("ground")}
        className={`rounded-xl border border-gray-200 bg-white/80 px-3 py-1.5 text-sm text-gray-700 hover:border-purple-300 hover:bg-white transition ${focusCls}`}
      >
        Mark-kontakt
      </button>
    </div>
  );
}

/**
 * Genererar svar för ritualer
 */
export function runRitual(type: "breathe" | "pause" | "ground"): string {
  if (type === "breathe") return "Okej. Vi tar 2 lugna andetag. Ingen instruktion. Bara var här.";
  if (type === "pause") return "Jag är kvar här. Du behöver inte svara än.";
  if (type === "ground") return "Känn hur kroppen vilar mot stolen eller golvet. Ingen prestation.";
  return "";
}

