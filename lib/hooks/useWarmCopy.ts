import { useMemo, useRef } from "react";

import { buildGreeting, pickFarewell } from "@/lib/copy/warm_sv";

export type WarmCtx = {
  name?: string;
  isReturn?: boolean;
  tod?: "morgon" | "eftermiddag" | "kväll";
  mode?: "personal" | "hr";
  risk?: "SAFE" | "RED";
};

export function useWarmCopy(baseCtx: WarmCtx = {}) {
  const turnRef = useRef(1);
  const lastInterjectionAtRef = useRef<number | null>(null);

  const ctx = useMemo(
    () => ({
      ...baseCtx,
      turn: turnRef.current,
      lastInterjectionAt: lastInterjectionAtRef.current ?? undefined,
    }),
    [baseCtx, turnRef.current, lastInterjectionAtRef.current],
  );

  function greeting() {
    const text = buildGreeting(ctx);
    if (text.includes("…") || text.includes("...")) {
      lastInterjectionAtRef.current = turnRef.current;
    }
    turnRef.current += 1;
    return text;
  }

  function farewell() {
    return pickFarewell(ctx);
  }

  return { greeting, farewell, turn: () => turnRef.current };
}
