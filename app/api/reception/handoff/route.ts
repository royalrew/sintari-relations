import { NextResponse } from "next/server";
import { handoffSchema, HandoffPolicy } from "@/lib/reception/policy";
import { appendWorldclassLive } from "@/lib/metrics/style_telemetry";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = handoffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_payload",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  const policyResult = HandoffPolicy.canTransfer(payload);
  if (!policyResult.allow) {
    return NextResponse.json(
      {
        ok: false,
        error: policyResult.reason,
      },
      { status: 403 },
    );
  }

  const introNote = HandoffPolicy.introNoteForCoach(payload);
  appendWorldclassLive({
    session_id: payload.sessionId,
    turn: Math.floor(Date.now() / 1000),
    reception: {
      handoff: 1,
      summary_opt_in: payload.carryOver === "minimal" && payload.consent ? 1 : 0,
    },
    __force: true,
  });

  return NextResponse.json({
    ok: true,
    carry_over: payload.carryOver,
    intro_note: introNote,
  });
}

