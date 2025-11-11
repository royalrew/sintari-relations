"use client";

import { useEffect, useRef, useState } from "react";
import type { ToolKey } from "./Toolbox";

export type GuideRunnerProps = {
  tool: ToolKey | null;
  stepIndex?: number;
  onStepChange?: (stepIndex: number) => void;
  onYield?: (assistantText: string) => void; // skicka varje steg till chatten
  onDone?: () => void;
};

type Step = { say: string; waitUser?: boolean };

const FLOWS: Record<ToolKey, Step[]> = {
  breathing60: [
    { say: "Vi gör ett kort andningsankare tillsammans. Säg 'redo' när du vill börja.", waitUser: true },
    { say: "Andas in 4… 3… 2… 1…", waitUser: false },
    { say: "Håll 2… 1…", waitUser: false },
    { say: "Andas ut långt 6… 5… 4… 3… 2… 1…", waitUser: false },
    { say: "Bra. Vi tar det två gånger till i din egen takt. Säg 'klar' när du vill gå vidare.", waitUser: true },
    { say: "Vad märker du i kroppen just nu, 1–2 ord räcker.", waitUser: true },
  ],
  threeThings: [
    { say: "Vi sorterar i tre delar. Först: vad känns tungt just nu?", waitUser: true },
    { say: "Tack. Om du fick önska, vad vill du ska finnas istället?", waitUser: true },
    { say: "Bra. Vad kan vara ett litet steg åt det hållet – något du kan göra inom 24h?", waitUser: true },
    { say: "Toppen. Vill du att jag sammanfattar det du skrev till en liten plan?", waitUser: true },
  ],
  iMessage: [
    { say: "Vi bygger ett kort jag-budskap. Kan du kort skriva vad som hände (X)?", waitUser: true },
    { say: "Tack. Vad kände du (Y)?", waitUser: true },
    { say: "Vad betyder det för dig (Z)?", waitUser: true },
    { say: "Vad skulle du vilja (A)?", waitUser: true },
    { say: "Vill du att jag sätter ihop en mening av det här?", waitUser: true },
  ],
  pauseMode: [
    { say: "Vi förbereder ett tryggt paus-läge. Vill du använda pausen i en pågående konflikt?", waitUser: true },
    { say: 'Säg detta: "Jag vill ta en paus för att kunna lyssna bättre. Jag är tillbaka om 10 minuter."', waitUser: false },
    { say: "Vill du att jag hjälper dig bestämma *när* du återkopplar och *hur* du öppnar sen?", waitUser: true },
  ],
};

export function GuideRunner({ tool, stepIndex: externalStepIndex, onStepChange, onYield, onDone }: GuideRunnerProps) {
  const [internalStepIndex, setInternalStepIndex] = useState(0);
  const [isWaitingForUser, setIsWaitingForUser] = useState(false);
  const startedRef = useRef(false);
  
  // Use external stepIndex if provided, otherwise use internal
  const stepIndex = externalStepIndex !== undefined ? externalStepIndex : internalStepIndex;
  const setStepIndex = onStepChange || setInternalStepIndex;

  useEffect(() => {
    if (!tool) return;

    // Ny guide startar
    setStepIndex(0);
    setIsWaitingForUser(false);
    startedRef.current = false;
  }, [tool, setStepIndex]);

  useEffect(() => {
    if (!tool) return;

    const steps = FLOWS[tool];
    if (!steps) return;
    const s = steps[stepIndex];
    if (!s) {
      // Sista steget passerat
      onDone?.();
      return;
    }

    onYield?.(s.say);
    setIsWaitingForUser(s.waitUser || false);

    // Om steget inte kräver användarsvar → auto-nästa efter liten delay
    if (!s.waitUser) {
      const tm = setTimeout(() => setStepIndex(stepIndex + 1), 1200);
      return () => clearTimeout(tm);
    }
  }, [tool, stepIndex, onYield, onDone, setStepIndex]);

  // Exponera en minimal UI-trigger för debugging
  if (!tool) return null;

  return (
    <div className="rounded-2xl border border-purple-100/70 bg-white/80 p-4 text-xs text-gray-500">
      Guidning aktiv: <span className="font-medium">{tool}</span>
      {isWaitingForUser && " • Väntar på ditt svar..."}
    </div>
  );
}

