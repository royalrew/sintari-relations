import { useMemo } from "react";
import { p95 } from "@/lib/metrics/p95";

type EventLike = {
  style?: { tone_delta?: number };
  honesty?: { active?: boolean };
  kpi?: { explain?: { no_advice?: number | boolean } };
};

export function useStyleAlarms(events: EventLike[]) {
  return useMemo(() => {
    if (!events.length) {
      return { warn: false, error: false };
    }

    const honestyActive = events.filter((ev) => ev.honesty?.active);
    const honestyRate = honestyActive.length / events.length;
    const toneValues = events.map((ev) => ev.style?.tone_delta ?? 0);
    const toneP95 = p95(toneValues);
    const last = events[events.length - 1];

    const warn = honestyRate < 0.10 || toneP95 >= 0.05;
    const lastNoAdviceRaw = last?.kpi?.explain?.no_advice;
    const lastNoAdvice =
      typeof lastNoAdviceRaw === "number"
        ? lastNoAdviceRaw
        : typeof lastNoAdviceRaw === "boolean"
        ? (lastNoAdviceRaw ? 1 : 0)
        : 1;
    const error = Boolean(last?.honesty?.active) && lastNoAdvice < 1;

    return { warn, error };
  }, [events]);
}
