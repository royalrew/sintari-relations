import { useEffect, useRef, useState } from "react";

/** Global klocka (1 Hz) – återanvänds av andra hooks */
export function useTickerHz(hz = 1) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000 / hz);
    return () => clearInterval(iv);
  }, [hz]);

  return now;
}

/** Millisekunder sedan senaste user-aktivitet i inputen */
export function useTypingDetector({ idleMs = 2000 } = {}) {
  const [isTyping, setTyping] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  function onType() {
    setTyping(true);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setTyping(false), idleMs);
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { isTyping, onType };
}

/** Idle (användaren rör inte sida/tangentbord/mus/scroll) */
export function useIdleThresholds(thresholds = { soft: 20_000, med: 45_000, long: 180_000 }) {
  const [lastActiveAt, setLastActiveAt] = useState(Date.now());
  const now = useTickerHz(1);

  useEffect(() => {
    const bump = () => setLastActiveAt(Date.now());

    const opts = { passive: true } as AddEventListenerOptions;

    window.addEventListener("pointerdown", bump, opts);
    window.addEventListener("keydown", bump, opts);
    window.addEventListener("scroll", bump, opts);
    window.addEventListener("mousemove", bump, opts);

    return () => {
      window.removeEventListener("pointerdown", bump, opts);
      window.removeEventListener("keydown", bump, opts);
      window.removeEventListener("scroll", bump, opts);
      window.removeEventListener("mousemove", bump, opts);
    };
  }, []);

  const idle = now - lastActiveAt;
  return {
    idleMs: idle,
    level:
      idle >= thresholds.long
        ? "long"
        : idle >= thresholds.med
        ? "med"
        : idle >= thresholds.soft
        ? "soft"
        : ("none" as "none" | "soft" | "med" | "long"),
    touch: () => null,
  };
}

/** Page visibility (flik i bakgrunden?) */
export function usePageVisibility() {
  const [visible, setVisible] = useState(
    typeof document === "undefined" ? true : document.visibilityState === "visible"
  );

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === "visible");

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    window.addEventListener("blur", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      window.removeEventListener("blur", onVis);
    };
  }, []);

  return visible;
}

/** Tid sedan senaste USER-meddelande i tråden */
export function useElapsedSince(lastTs?: number | null) {
  const now = useTickerHz(1);
  return lastTs ? now - lastTs : 0;
}

