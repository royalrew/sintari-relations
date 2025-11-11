import { describe, expect, test } from "@jest/globals";
import { cooldownActive, facetsKey } from "@/lib/memory/need_more_ctx_util";

describe("need_more_ctx_util", () => {
  test("facetsKey sorts and normalises facets", () => {
    const key = facetsKey("s1", [" B ", "a", ""]);
    expect(key).toBe("s1:a|b");
  });

  test("cooldownActive respects window", () => {
    const now = 10_000;
    expect(cooldownActive(now, null, 6_000)).toBe(false);
    expect(cooldownActive(now, 9_500, 6_000)).toBe(true);
    expect(cooldownActive(now, 1_000, 2_000)).toBe(false);
    expect(cooldownActive(now, -100_000, 1_000)).toBe(false);
  });
});

