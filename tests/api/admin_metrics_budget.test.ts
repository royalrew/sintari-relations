import fs from "fs";
import { NextResponse } from "next/server";
import { GET } from "@/app/api/admin/metrics/route";

jest.mock("fs");

describe("admin metrics API budget integration", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("returns telemetry budget fields", async () => {
    (fs.readFileSync as unknown as jest.Mock).mockImplementation(() =>
      JSON.stringify({ total: 3, summary: { shown: 2, completed: 1 } }),
    );

    const res = (await GET(new Request("http://localhost/api/admin/metrics?hours=24"))) as NextResponse;
    const json = (await res.json()) as {
      agg: {
        telemetry_total_24h: number;
        telemetry_top_events: Record<string, number>;
        telemetry_event_rates: Record<string, number>;
        telemetry_spikes: Record<string, string>;
      };
    };

    expect(json.agg.telemetry_total_24h).toBeGreaterThanOrEqual(0);
    expect(json.agg).toHaveProperty("telemetry_top_events");
    expect(json.agg).toHaveProperty("telemetry_event_rates");
    expect(json.agg).toHaveProperty("telemetry_spikes");
  });
});

