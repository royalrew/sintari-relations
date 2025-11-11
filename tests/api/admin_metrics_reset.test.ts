import fs from "fs";
import { POST } from "@/app/api/admin/metrics/telemetry_reset/route";

jest.mock("fs");

describe("telemetry reset API", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("removes summary file if present", async () => {
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    const rmMock = fs.rmSync as unknown as jest.Mock;

    const res = await POST();
    const json = await res.json();

    expect(fs.existsSync).toHaveBeenCalled();
    expect(rmMock).toHaveBeenCalledWith(expect.stringContaining("telemetry_budget_summary.json"));
    expect(json).toEqual({ ok: true });
  });

  test("handles missing file gracefully", async () => {
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(false);

    const res = await POST();
    const json = await res.json();

    expect(fs.rmSync).not.toHaveBeenCalled();
    expect(json).toEqual({ ok: true });
  });
});

