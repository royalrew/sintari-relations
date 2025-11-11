import { describe, expect, test } from "@jest/globals";
import { feelRepo } from "@/lib/memory/subject_feel";

describe("subject_feel repo", () => {
  test("set + clamp + get + remove", () => {
    const id = "subj-1";
    const rec = feelRepo.set(id, 7); // clamp → 5
    expect(rec.value).toBe(5);
    expect(feelRepo.get(id)?.value).toBe(5);

    const rec2 = feelRepo.set(id, 0); // clamp → 1
    expect(rec2.value).toBe(1);
    expect(feelRepo.get(id)?.value).toBe(1);

    expect(feelRepo.remove(id)).toBe(true);
    expect(feelRepo.get(id)).toBeNull();
  });
});

