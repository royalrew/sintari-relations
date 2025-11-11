import { describe, expect, test } from "@jest/globals";

import { CooldownTTL } from "@/lib/server/cooldown";

describe("CooldownTTL ping", () => {
  test("suppresses within ttl window", () => {
    const ttl = new CooldownTTL(10_000);
    const key = "user:subject";
    const first = ttl.ping(key, 1_000);
    expect(first.suppressed).toBe(false);
    const second = ttl.ping(key, 1_500);
    expect(second.suppressed).toBe(true);
    expect(second.ttlRemainingMs).toBeGreaterThan(0);
  });
});

