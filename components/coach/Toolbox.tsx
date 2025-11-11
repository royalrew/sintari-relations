"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export type ToolKey = "breathing60" | "threeThings" | "iMessage" | "pauseMode";

export type ToolboxProps = {
  onStart: (tool: ToolKey) => void;
};

const TOOLS: { key: ToolKey; title: string; subtitle: string; bullets: string[]; emoji: string }[] = [
  {
    key: "breathing60",
    title: "60s Andningsankare",
    subtitle: "Reglera nervsystemet snabbt.",
    bullets: ["In 4s • Håll 2s • Ut 6–8s", "3 repetitioner", "Landa kroppen först"],
    emoji: "🌬️",
  },
  {
    key: "threeThings",
    title: "3 saker jag bär på",
    subtitle: "Sortera det röriga.",
    bullets: ["Vad känns tungt?", "Vad önskar du istället?", "Litet steg dit"],
    emoji: "🧭",
  },
  {
    key: "iMessage",
    title: "Jag-budskap",
    subtitle: "Säg det utan skuld.",
    bullets: ['"När X hände… jag kände Y… för att Z… jag skulle vilja A."'],
    emoji: "🗣️",
  },
  {
    key: "pauseMode",
    title: "Tryggt paus-läge",
    subtitle: "Pausa bråk, inte relationen.",
    bullets: ['"Jag vill ta en paus för att kunna lyssna bättre. Tillbaka om 10 min."'],
    emoji: "⏸️",
  },
];

function Card({ className = "", ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={`group relative rounded-2xl border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-purple-200 ${className}`}
    />
  );
}

export function Toolbox({ onStart }: ToolboxProps) {
  const [openKey, setOpenKey] = useState<ToolKey | null>(null);

  return (
    <section aria-label="Verktyg" className="py-6">
      <div className="mb-3">
        <h3 className="text-lg font-extrabold tracking-tight text-gray-900">Verktygslåda (mini)</h3>
        <p className="text-sm text-gray-600">Små, trygga verktyg som tar 1 minut och höjer upplevelsen.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <Card key={t.key} className={openKey === t.key ? "ring-2 ring-purple-200" : ""}>
            <div className="flex items-start gap-3">
              <div className="text-xl">{t.emoji}</div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-base font-semibold text-gray-900">{t.title}</h4>
                  <button
                    onClick={() => setOpenKey(openKey === t.key ? null : t.key)}
                    className="text-xs rounded-lg px-2 py-1 text-gray-600 hover:bg-purple-50"
                  >
                    {openKey === t.key ? "Dölj" : "Visa"}
                  </button>
                </div>
                <p className="mt-0.5 text-sm text-gray-600">{t.subtitle}</p>
                {openKey === t.key && (
                  <ul className="mt-2 space-y-1 text-sm text-gray-700">
                    {t.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span>•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => onStart(t.key)} size="sm">
                    Starta
                  </Button>
                  <Button variant="outline" onClick={() => onStart(t.key)} size="sm">
                    Guidning i chatten
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

