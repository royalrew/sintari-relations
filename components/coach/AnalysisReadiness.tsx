"use client";

import { useMemo } from "react";
import { QualityBar } from "@/components/coach/QualityBar";

type Turn = { role: "user" | "assistant"; text: string; ts?: string };

type ReadinessResult = {
  score01: number;            // 0..1
  score10: number;            // 0..10
  label: "Låg" | "OK" | "Bra" | "Utmärkt";
  color: string;              // tailwind color class
  missing: string[];          // checklist som saknas
  present: string[];          // checklist som finns
};

const CHECKS = [
  { key: "känsla",  hint: "Hur känns det just nu? (t.ex. orolig, ledsen, arg)",  rx: /(orolig|stress|ångest|ledsen|arg|rädd|utmatt|trött|uppgiven)/i },
  { key: "händelse",hint: "Vad hände? (kort konkret beskrivning)",                 rx: /(igår|idag|i helgen|bråk|konflikt|sa|gjorde|kom hem|på jobbet|mötet|sms|meddelande)/i },
  { key: "mål",     hint: "Vad vill du uppnå? (t.ex. lugn, förståelse)",           rx: /(vill|målet|hoppar|önskar|skulle vilja|behöver|mål)/i },
  { key: "relation",hint: "Vem gäller det? (partner, kollega, vän, chef)",         rx: /(partner|make|sambo|kollega|chef|vän|barn|förälder)/i },
  { key: "steg",    hint: "Vad har du provat/kan prova? (1–2 micro-steg)",         rx: /(provat|testat|ska försöka|nästa steg|kan jag|skulle jag)/i },
] as const;

function estimateReadiness(turns: Turn[]): ReadinessResult {
  const userTurns = turns.filter(t => t.role === "user");

  const messageCount = userTurns.length;
  const totalChars = userTurns.reduce((n, t) => n + t.text.trim().length, 0);
  const uniqueWords = new Set(
    userTurns
      .flatMap(t => t.text.toLowerCase().split(/\W+/).filter(Boolean))
  ).size;

  // Facett-träffar
  const textBlob = userTurns.map(t => t.text).join(" ");
  const hits = CHECKS.filter(c => c.rx.test(textBlob)).map(c => c.key);
  const misses = CHECKS.map(c => c.key).filter(k => !hits.includes(k));

  // Heuristisk scoring (enkelt, billigt, förklaringbar):
  // - meddelanden: 0..1 (>=3 bra)
  const sMsgs = Math.min(messageCount / 3, 1);
  // - längd: 0..1 (>=400 tecken bra)
  const sLen  = Math.min(totalChars / 400, 1);
  // - variation: 0..1 (>=120 unika ord bra)
  const sVar  = Math.min(uniqueWords / 120, 1);
  // - facetter: 0..1 (3+ facetter bra, 5 utmärkt)
  const sFac  = Math.min(hits.length / 5, 1);

  // Viktning (känns bra i coach-kontext)
  const score01 = clamp(
    0.30 * sMsgs +
    0.25 * sLen  +
    0.20 * sVar  +
    0.25 * sFac, 0, 1
  );

  const score10 = Math.round(score01 * 10);
  const label   = score10 >= 9 ? "Utmärkt" : score10 >= 7 ? "Bra" : score10 >= 5 ? "OK" : "Låg";
  const color   = score10 >= 9 ? "bg-emerald-500" : score10 >= 7 ? "bg-blue-500" : score10 >= 5 ? "bg-amber-500" : "bg-rose-500";

  return { score01, score10, label, color, missing: misses, present: hits };
}

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

export function AnalysisReadiness({
  turns,
  onStartAnalysis,
  forceAllow = true,
}: {
  turns: Turn[];
  onStartAnalysis: () => void;            // koppla till din trigger
  forceAllow?: boolean;                   // om användaren får köra ändå
}) {
  const r = useMemo(() => estimateReadiness(turns), [turns]);

  const tipsMap: Record<string,string> = Object.fromEntries(
    CHECKS.map(c => [c.key, c.hint])
  );

  // Trösklar: < 0.5 → röd, 0.5–0.79 → gul, ≥ 0.8 → grön
  const shouldRecommendWait = r.score01 < 0.7; // rekommendera att skriva lite mer tills 7+/10

  return (
    <div className="rounded-2xl border border-purple-100/70 bg-white/80 p-5 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">Analyskvalitet</div>
          <div className="text-xs text-gray-600">Högre poäng → mer träffsäker analys</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-extrabold text-gray-900">{r.score10}/10</div>
          <div className="text-xs text-gray-600">{r.label}</div>
        </div>
      </div>

      {/* QualityBar med RYG-färgskala */}
      <div className="mt-3">
        <QualityBar score01={r.score01} showTicks={true} />
      </div>

      {/* Checklist: vad som saknas för 9–10/10 */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {CHECKS.map(c => {
          const ok = r.present.includes(c.key);
          return (
            <div
              key={c.key}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                ok
                  ? "border-emerald-100 bg-emerald-50/70 text-emerald-800"
                  : "border-gray-200 bg-white/70 text-gray-700 hover:border-purple-200"
              }`}
              title={tipsMap[c.key]}
            >
              <span aria-hidden>{ok ? "✅" : "…"}</span>
              <div>
                <div className="font-medium">{c.key}</div>
                {!ok && <div className="text-xs text-gray-500">{tipsMap[c.key]}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-col sm:flex-row gap-3">
        <button
          onClick={onStartAnalysis}
          disabled={shouldRecommendWait && !forceAllow}
          className={[
            "group inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500 active:scale-[.98]",
            shouldRecommendWait && !forceAllow
              ? "bg-gray-200 text-gray-500 cursor-not-allowed"
              : "bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-300/30 hover:from-purple-700 hover:to-blue-700"
          ].join(" ")}
          title={shouldRecommendWait && !forceAllow ? "Skriv lite mer för bättre analys" : "Starta analys"}
        >
          Starta analys
        </button>

        {/* "Kör ändå" – tydlig men mjuk */}
        {shouldRecommendWait && forceAllow && (
          <button
            onClick={onStartAnalysis}
            className="inline-flex items-center justify-center rounded-xl border border-purple-200 bg-white/90 px-5 py-3 text-sm font-semibold text-purple-700 transition hover:bg-white hover:shadow-md"
          >
            Kör ändå (jag vill se nu)
          </button>
        )}

        {/* Nudge-text */}
        {shouldRecommendWait && (
          <div className="sm:ml-auto text-xs text-gray-600 self-center">
            Tips: Beskriv kort <span className="font-medium">känsla</span>, <span className="font-medium">vad som hände</span> och <span className="font-medium">vad du önskar</span> – så når vi 9–10/10.
          </div>
        )}
      </div>
    </div>
  );
}

