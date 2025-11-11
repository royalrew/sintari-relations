import { NextRequest, NextResponse } from "next/server";
import { appendWorldclassLive } from "@/lib/metrics/style_telemetry";
import { buildHonestyChipEvent } from "@/lib/reception/flow";

type Body = {
  event?: "shown" | "completed";
  subject_id?: string | null;
  missing_facets?: string[];
  ts?: number;
  duration_ms?: number;
};

function buildRepairPayload(body: Body) {
  const timestamp = typeof body.ts === "number" ? body.ts : Date.now();
  const sessionId = body.subject_id ?? "honesty_repair";
  const turn = Math.floor(timestamp / 1000);
  const replyText = `repair:${body.event ?? "unknown"}:${timestamp}`;

  if (body.event === "shown") {
    return {
      session_id: sessionId,
      turn,
      reply_text: replyText,
      repair: { prompt_shown: 1 },
      reception: { honesty_prompt: 1 },
      __forceLogging: true,
    };
  }

  if (body.event === "completed") {
    const payload: Record<string, any> = {
      session_id: sessionId,
      turn,
      reply_text: replyText,
      repair: { completed: 1 },
      __forceLogging: true,
    };
    if (typeof body.duration_ms === "number" && Number.isFinite(body.duration_ms)) {
      payload.repair.time_to_complete_ms = Math.max(0, Math.round(body.duration_ms));
      payload.reception = {
        repair_completion_ms: Math.max(0, Math.round(body.duration_ms)),
      };
    }
    return payload;
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    if (!body.event || (body.event !== "shown" && body.event !== "completed")) {
      return NextResponse.json({ error: "invalid event" }, { status: 400 });
    }

    const record = {
      event: body.event,
      subject_id: body.subject_id ?? null,
      missing_facets: Array.isArray(body.missing_facets)
        ? body.missing_facets.slice(0, 10)
        : [],
      ts: typeof body.ts === "number" ? body.ts : Date.now(),
    };

    console.log("honesty_repair_funnel", JSON.stringify(record));

    const telemetryPayload = buildRepairPayload(body);
    if (telemetryPayload) {
      appendWorldclassLive(telemetryPayload);
    }

    const chipEvent =
      body.event === "shown"
        ? buildHonestyChipEvent({
            sessionId: body.subject_id ?? "honesty_repair",
            type: "honesty_chip_shown",
            facets: body.missing_facets,
            now: record.ts,
          })
        : buildHonestyChipEvent({
            sessionId: body.subject_id ?? "honesty_repair",
            type: "honesty_chip_completed",
            facets: body.missing_facets,
            durationMs: body.duration_ms,
            now: record.ts,
          });
    appendWorldclassLive(chipEvent);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
}

