import { buildGreeting, buildFollowup, pickFarewell } from "@/lib/copy/warm_sv";
import { resetInterjection } from "@/lib/state/interjection_store";

describe("warm_sv copy", () => {
  beforeEach(() => {
    resetInterjection();
  });

  test("HR-öppning används i HR-läge", () => {
    const greeting = buildGreeting({ mode: "hr" });
    expect(greeting).toMatch(/stötta er på jobbet/i);
  });

  test("RED override byter avslut", () => {
    const farewell = pickFarewell({ risk: "RED" });
    expect(farewell).toMatch(/112/);
  });

  test("Interjektion max var 6:e tur", () => {
    let lastInterjection = -10;
    for (let turn = 1; turn <= 12; turn += 1) {
      const text = buildGreeting({ turn, lastInterjectionAt: lastInterjection });
      const hasInterjection = /Hmm|Okej|Mmm|känna in/.test(text);
      if (hasInterjection) {
        expect(turn - lastInterjection).toBeGreaterThanOrEqual(6);
        lastInterjection = turn;
      }
    }
  });

  test("Followup speglar text och ställer fråga", () => {
    const { text } = buildFollowup({ turn: 3, lastInterjectionAt: 0 }, "Jag känner mig trött på konflikten.");
    expect(text).toMatch(/Jag hör dig/);
    expect(text).toMatch(/\?/);
  });
});
