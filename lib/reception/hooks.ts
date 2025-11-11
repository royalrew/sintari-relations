import { useEffect, useRef, useState } from "react";

/** 1 Hz ticker (SSR-safe) */
export function useTickerHz(hz = 1) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), Math.max(16, 1000 / hz));
    return () => clearInterval(iv);
  }, [hz]);

  return now;
}

/** Millisekunder sedan given ts */
export function useElapsedSince(ts?: number | null) {
  const now = useTickerHz(1);
  return ts ? Math.max(0, now - ts) : 0;
}

/** Typdetektor för inputfält */
export function useTypingDetector(idleMs = 2000) {
  const [isTyping, setTyping] = useState(false);
  const ref = useRef<number | null>(null);

  function onType() {
    setTyping(true);
    if (ref.current) window.clearTimeout(ref.current);
    ref.current = window.setTimeout(() => setTyping(false), idleMs);
  }

  useEffect(() => () => {
    if (ref.current) window.clearTimeout(ref.current);
  }, []);

  return { isTyping, onType };
}

/** Idle-nivåer baserat på interaktion */
export function useIdleThresholds(thresholds = { soft: 20_000, med: 45_000, long: 180_000 }) {
  const [lastActiveAt, setLastActiveAt] = useState(() => Date.now());
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

  const level =
    idle >= thresholds.long ? "long" : idle >= thresholds.med ? "med" : idle >= thresholds.soft ? "soft" : "none";

  return { idleMs: idle, level } as const;
}

/** Fliksynlighet */
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

/** Frågebudget: max 1 fråga varannan tur + tids-cooldown */
export function useQuestionBudget({ cooldownMs = 15000 } = {}) {
  const askedAtRef = useRef<number | null>(null);
  const askedInPrevTurnRef = useRef(false);

  function canAsk() {
    const t = Date.now();
    const timeOk = !askedAtRef.current || t - askedAtRef.current >= cooldownMs;
    const turnOk = !askedInPrevTurnRef.current;
    return timeOk && turnOk;
  }

  function markAsked() {
    askedAtRef.current = Date.now();
    askedInPrevTurnRef.current = true;
  }

  function nextTurn() {
    askedInPrevTurnRef.current = false;
  }

  return { canAsk, markAsked, nextTurn } as const;
}

/** Emotionskurva (deterministisk, enkel) */
export type EmotionCurve = "up" | "down" | "hold" | "flare";

export function detectEmotionCurve(text: string): EmotionCurve {
  const t = text.toLowerCase();
  if (/(arg|förbann|skrik|alltid så här)/.test(t)) return "flare";
  if (/(trött|orkar inte|ledsen|inget spelar|uppgiven)/.test(t)) return "down";
  if (/(tack|hjälpte|lite bättre|skönt|okej)/.test(t)) return "up";
  return "hold";
}

export function summaryCurve(curves: EmotionCurve[]) {
  const last = curves.slice(-6);
  const score = last.reduce((n, c) => n + (c === "up" ? 1 : c === "down" ? -1 : 0), 0);
  const flare = last.includes("flare");
  if (flare) return "flare";
  if (score > 0) return "up";
  if (score < 0) return "down";
  return "hold";
}

