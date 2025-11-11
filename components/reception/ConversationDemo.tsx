"use client";

import { useEffect, useRef, useState } from "react";
import { Chip, ChipRow } from "@/components/ui/Chip";
import {
  useTypingDetector,
  useIdleThresholds,
  usePageVisibility,
  useElapsedSince,
  useQuestionBudget,
  detectEmotionCurve,
  summaryCurve,
  EmotionCurve,
} from "@/lib/reception/hooks";

type Turn = { role: "user" | "assistant"; text: string; ts: number };

function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`rounded-2xl border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-purple-200 ${props.className || ""}`}
    />
  );
}

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold 
      bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg transition
      hover:from-purple-700 hover:to-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500 active:scale-[.98] ${props.className || ""}`}
    />
  );
}

export default function ConversationDemo() {
  const [turns, setTurns] = useState<Turn[]>([
    { role: "assistant", text: "Välkommen. Skriv fritt – jag lyssnar.", ts: Date.now() },
  ]);
  const [input, setInput] = useState("");
  const lastUser = [...turns].reverse().find((t) => t.role === "user");
  const lastUserAgo = useElapsedSince(lastUser?.ts);
  const { isTyping, onType } = useTypingDetector(2000);
  const idle = useIdleThresholds({ soft: 20_000, med: 45_000, long: 180_000 });
  const visible = usePageVisibility();
  const qb = useQuestionBudget({ cooldownMs: 15000 });

  // Emotion curve tracking (klientside demo)
  const [curveHistory, setCurveHistory] = useState<EmotionCurve[]>([]);
  const curveSummary = summaryCurve(curveHistory);

  const lastSoftPingRef = useRef(0);

  function add(role: "user" | "assistant", text: string) {
    setTurns((t) => [...t, { role, text, ts: Date.now() }]);
  }

  // Tystnadsping utan krav
  useEffect(() => {
    const cool = 30000;
    const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
    const should =
      visible &&
      !isTyping &&
      idle.level === "soft" &&
      lastUserAgo >= 20000 &&
      Date.now() - lastSoftPingRef.current > cool &&
      lastTurn?.role === "user";

    if (should) {
      add("assistant", "Ingen stress. Jag finns kvar här.");
      lastSoftPingRef.current = Date.now();
    }
  }, [visible, isTyping, idle.level, lastUserAgo, turns]);

  function mirrorTone() {
    switch (curveSummary) {
      case "down":
        return "Det där låter tungt. Jag är kvar här med dig.";
      case "flare":
        return "Vi tar det lugnt ett ögonblick. Jag är kvar här.";
      case "up":
        return "Skönt att du sätter ord på det.";
      default:
        return "Jag hör dig.";
    }
  }

  function softQuestion(userText: string) {
    if (!qb.canAsk()) return null;
    qb.markAsked();

    if (userText.length < 12) return "Vill du sätta lite fler ord på det, eller ska vi hålla det kort?";
    if (/vet inte|ingen aning/i.test(userText)) return "Helt okej att inte veta. Vill du skriva några nyckelord?";
    return "Vill du skriva fritt en stund till, eller vill du att jag föreslår en väg?";
  }

  function onSend() {
    const v = input.trim();
    if (!v) return;
    setInput("");
    add("user", v);

    // emotions
    const c = detectEmotionCurve(v);
    setCurveHistory((h) => [...h, c]);

    // svar
    const parts = [mirrorTone()];
    const q = softQuestion(v);
    if (q) parts.push(q);
    add("assistant", parts.join(" "));
  }

  // Chip-handlers
  function onChip(id: string) {
    if (id === "free") add("assistant", "Vi kan bara sitta en stund – helt okej.");
    if (id === "suggest") add("assistant", "Vill du att jag öppnar Coach, Par-läge eller HR/Team? Du bestämmer.");
    if (id === "pause") add("assistant", "Okej. Jag är kvar. Du behöver inte svara än.");
    if (id === "breathe") add("assistant", "Vi tar två lugna andetag tillsammans.");
  }

  // Avsluta tur → nästa tur får fråga
  useEffect(() => {
    if (turns.length > 0) {
      qb.nextTurn(); /* efter varje render anses turen klar */
    }
  }, [turns.length]);

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-extrabold text-gray-900">Conversation Demo</h3>
        <span className="text-xs text-gray-500">
          Kurva: <span className="font-semibold">{curveSummary}</span>
        </span>
      </div>

      <div role="log" aria-live="polite" aria-relevant="additions" className="mt-4 space-y-3">
        {turns.map((t, i) => (
          <div
            key={i}
            className={`max-w-[90%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
              t.role === "assistant"
                ? "ml-auto bg-gradient-to-r from-purple-100 to-blue-100"
                : "bg-white shadow"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>

      <ChipRow className="mt-4">
        <Chip onClick={() => onChip("free")}>Skriv fritt</Chip>
        <Chip variant="outline" onClick={() => onChip("suggest")}>
          Föreslå väg
        </Chip>
        <Chip variant="neutral" onClick={() => onChip("pause")}>
          Pausa lite
        </Chip>
        <Chip variant="success" onClick={() => onChip("breathe")}>
          Andas en stund
        </Chip>
      </ChipRow>

      <div className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
          }}
          onInput={() => onType()}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Skriv några ord…"
          className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
        />
        <Button onClick={onSend}>Skicka</Button>
      </div>

      <p className="mt-2 text-[11px] text-gray-500">
        Idle: {idle.level} · Sista användarsvar: {Math.round(lastUserAgo / 1000)}s
      </p>
    </Card>
  );
}

