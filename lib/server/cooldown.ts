type Entry = {
  expiresAt: number;
};

export class CooldownTTL {
  private store = new Map<string, Entry>();

  constructor(private readonly defaultTtlMs = 10 * 60 * 1000) {}

  ping(key: string, now: number, ttlMs = this.defaultTtlMs) {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt > now) {
      return { suppressed: true, ttlRemainingMs: entry.expiresAt - now };
    }
    this.store.set(key, { expiresAt: now + ttlMs });
    return { suppressed: false, ttlRemainingMs: ttlMs };
  }

  clear(key: string) {
    this.store.delete(key);
  }

  reset() {
    this.store.clear();
  }
}

export const cooldown = new CooldownTTL();

