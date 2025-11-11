import { describe, expect, test } from "@jest/globals";
import { quickRepair } from "@/lib/memory/quick_repair";

describe("quick_repair", () => {
  test("save/list/remove", () => {
    const subject = "s1";
    const record = quickRepair.saveFacet({ subject_id: subject, text: "Hon ringde igår" });
    expect(record.fact_id).toBeTruthy();
    const listed = quickRepair.list(subject);
    expect(listed.length).toBe(1);
    const removed = quickRepair.remove(subject, record.fact_id);
    expect(removed).toBe(true);
    expect(quickRepair.list(subject).length).toBe(0);
  });
});

