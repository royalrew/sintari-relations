import { composeHonestReply } from "@/lib/policy/honesty_reply";

describe("composeHonestReply", () => {
  it("builds Swedish honest reply with missing facets", () => {
    const result = composeHonestReply("", {
      locale: "sv",
      missingFacets: ["när det hände", "vad partnern sa"],
      reasons: ["memory_miss"],
    });

    expect(result.usedInterjection).toBe(false);
    expect(result.text).toMatch(/när det hände/);
    expect(result.text).toMatch(/vad partnern sa/);
    expect((result.text.match(/\?/g) || []).length).toBe(1);
    expect(result.text.toLowerCase()).not.toContain("råd");
  });

  it("builds English HR variant without advice", () => {
    const result = composeHonestReply("", {
      locale: "en",
      mode: "hr",
      missingFacets: [],
      suggestedProbe: "what changed recently",
    });

    expect(result.text).toMatch(/work/i);
    expect(result.text).toMatch(/what changed recently/i);
    expect((result.text.match(/\?/g) || []).length).toBe(1);
    expect(result.text.toLowerCase()).not.toContain("advice");
  });

  it("prefers RED opener when risk is RED", () => {
    const result = composeHonestReply("", {
      locale: "sv",
      risk: "RED",
    });

    expect(result.text.toLowerCase()).toMatch(/allvarligt|tungt/);
    expect(result.usedInterjection).toBe(false);
  });
});
