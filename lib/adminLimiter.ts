// Minimal i-minnet: 1 jobb/minut per hemlighet
const lastRun: Record<string, number> = {};

export function ensureRate(secret: string) {
  const now = Date.now();
  const last = lastRun[secret] || 0;
  if (now - last < 60_000) {
    return { ok: false as const, retryInMs: 60_000 - (now - last) };
  }
  lastRun[secret] = now;
  return { ok: true as const };
}

