import { describe, expect, test } from "@jest/globals";

import { CooldownTTL } from "@/lib/server/cooldown";

describe("CooldownTTL.clear", () => {
  test("clear resets key", () => {
    const store = new CooldownTTL(10_000);
    const key = "u1:s1:x";
    store.ping(key, 1_000);
    const suppressed = store.ping(key, 1_500);
    expect(suppressed.suppressed).toBe(true);
    store.clear(key);
    const after = store.ping(key, 2_000);
    expect(after.suppressed).toBe(false);
  });
});

