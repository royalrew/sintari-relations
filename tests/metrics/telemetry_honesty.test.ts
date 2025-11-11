import fs from "fs";
import path from "path";

import {
  appendWorldclassLive,
  buildStyleMetrics,
  sanitizeHonesty,
} from "@/lib/metrics/style_telemetry";

const OUT = path.join(process.cwd(), "reports", "test_honesty_log.jsonl");

describe("honesty telemetry", () => {
  beforeEach(() => {
    if (fs.existsSync(OUT)) {
      fs.unlinkSync(OUT);
    }
  });

  it("writes honesty payload with snake_case fields", () => {
    appendWorldclassLive(
      {
        ts: new Date().toISOString(),
        session_id: "honesty_session_1",
        run_id: "test",
        seed_id: "H001",
        turn: 1,
        mode: "personal",
        risk: "SAFE",
        reply_text: "Thanks for sharing.",
        locale: "en",
        style: buildStyleMetrics({
          userText: "Need more detail",
          replyText: "Thanks for sharing.",
          empathy_score: 0.6,
          tone_delta: 0.02,
          locale: "en",
        }),
        honesty: {
          active: true,
          reasons: ["memory_miss"],
          missingFacets: ["timeline"],
          suggestedProbe: "when it started",
          repairAcceptRate: 0.6,
          rate: 0.12,
          timeToRepairMs: 1500,
        },
      },
      "reports/test_honesty_log.jsonl",
    );

    const raw = fs.readFileSync(OUT, "utf8").trim();
    expect(raw).not.toHaveLength(0);
    const parsed = JSON.parse(raw.split("\n")[0]);

    expect(parsed.honesty).toBeDefined();
    expect(parsed.honesty.active).toBe(true);
    expect(parsed.honesty.reasons).toEqual(["memory_miss"]);
    expect(parsed.honesty.missing_facets).toEqual(["timeline"]);
    expect(parsed.honesty.suggested_probe).toBe("when it started");
    expect(parsed.honesty.repair_accept_rate).toBe(0.6);
    expect(parsed.honesty.rate).toBe(0.12);
    expect(parsed.honesty.time_to_repair).toBe(1500);
  });

  it("sanitizes various honesty shapes", () => {
    const payload = sanitizeHonesty({
      flag: true,
      reasons: ["low_conf", 42, null],
      missing: ["who", null],
      probe: "topic",
      honestyRate: "0.2",
      repairAcceptRate: "0.5",
      timeToRepair: "900",
    });

    expect(payload).toEqual({
      active: true,
      reasons: ["low_conf"],
      missing_facets: ["who"],
      suggested_probe: "topic",
      no_advice: undefined,
      rate: 0.2,
      repair_accept_rate: 0.5,
      time_to_repair: 900,
    });
  });
});
