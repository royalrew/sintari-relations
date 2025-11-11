import { composeReply } from "@/copy/policy_reply";
import { resetInterjection } from "@/lib/state/interjection_store";

const baseSignals = {
  affect: "medium" as const,
  intent: "share" as const,
  specificity: "low" as const,
  risk: "SAFE" as const,
  mode: "personal" as const,
  turn: 4,
};

describe("policy_reply", () => {
  beforeEach(() => {
    resetInterjection();
  });

  test("short text does not echo user words", () => {
    const user = "Hej, jag tycker det är jobbigt.";
    const { text } = composeReply(user, { ...baseSignals, lastInterjectionAt: -10 }, { showInterjection: false });
    expect(text).not.toContain("jobbigt.");
  });

  test("reply ends with exactly one question", () => {
    const user = "Jag vet inte hur jag ska göra.";
    const { text } = composeReply(user, { ...baseSignals, lastInterjectionAt: -10 }, { showInterjection: false });
    const questionMarks = (text.match(/\?/g) || []).length;
    expect(questionMarks).toBe(1);
  });

  test("goodbye RED uses override", () => {
    const goodbye = composeReply("Hejdå", { ...baseSignals, intent: "goodbye", risk: "RED" }, { showInterjection: false });
    expect(goodbye.text).toMatch(/112/);
  });

  test("interjection suppressed when flag is false", () => {
    const { text } = composeReply("Kan du hjälpa mig?", { ...baseSignals, lastInterjectionAt: -10, turn: 8, intent: "ask" }, { showInterjection: false });
    expect(text).not.toMatch(/Hmm|Okej|Mmm/);
  });
});
