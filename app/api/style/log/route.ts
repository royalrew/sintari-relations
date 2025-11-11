import { NextResponse } from "next/server";

import { appendWorldclassLive, buildStyleMetrics } from "@/lib/metrics/style_telemetry";
import { COUPLES_ROOM_ENABLED } from "@/lib/copilot/env";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

const rateBuckets = new Map<string, number[]>();
const seenHashes = new Set<string>();

function withinRate(sessionId: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(sessionId) ?? [];
  const filtered = bucket.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (filtered.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(sessionId, filtered);
    return false;
  }
  filtered.push(now);
  rateBuckets.set(sessionId, filtered);
  return true;
}

function hashKey(sessionId: string, turn: number, replyText: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${sessionId}:${turn}:${replyText}`);
  // simple FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i += 1) {
    hash ^= data[i];
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      sessionId,
      turn,
      mode,
      risk,
      userText = "",
      replyText = "",
      empathyScore = 0,
      toneDelta = 0,
    } = body ?? {};

    if (!replyText) {
      return NextResponse.json({ error: "Missing replyText" }, { status: 400 });
    }

    const sessionKey = sessionId ?? "unknown";
    if (!withinRate(sessionKey)) {
      return NextResponse.json({ ok: true, skipped: "rate_limited" });
    }

    const dedupeKey = `${sessionKey}:${turn}:${hashKey(sessionKey, turn ?? 0, replyText)}`;
    if (seenHashes.has(dedupeKey)) {
      return NextResponse.json({ ok: true, skipped: "duplicate" });
    }
    seenHashes.add(dedupeKey);

    const style = buildStyleMetrics({
      userText: userText ?? "",
      replyText,
      empathy_score: typeof empathyScore === "number" ? empathyScore : Number(empathyScore) || 0,
      tone_delta: typeof toneDelta === "number" ? toneDelta : Number(toneDelta) || 0,
    });

    const noAdviceRaw = body?.kpi?.explain?.no_advice;
    const noAdvice =
      typeof noAdviceRaw === "number"
        ? noAdviceRaw >= 1
        : typeof noAdviceRaw === "boolean"
        ? noAdviceRaw
        : undefined;

    const couplesPayload =
      COUPLES_ROOM_ENABLED && body?.couples && typeof body.couples === "object"
        ? {
            handoff: Number(body.couples.handoff) || 0,
            repair_accept: Number(body.couples.repair_accept) || 0,
          }
        : undefined;

    appendWorldclassLive(
      {
        ts: new Date().toISOString(),
        session_id: sessionKey,
        run_id: body?.runId ?? null,
        seed_id: body?.seedId ?? null,
        turn,
        mode,
        risk,
        reply_text: replyText,
        kpi: body?.kpi,
        tone: body?.tone,
        style,
        ...(body?.coach ? { coach: body.coach } : {}),
        ...(couplesPayload && (couplesPayload.handoff || couplesPayload.repair_accept)
          ? { couples: couplesPayload }
          : {}),
        honesty: body?.honesty
          ? {
              ...body.honesty,
              no_advice: body.honesty.no_advice ?? noAdvice,
            }
          : noAdvice === undefined
          ? undefined
          : { active: Boolean(body?.honesty?.active), no_advice: noAdvice },
      },
      "reports/worldclass_live.jsonl",
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[STYLE_LOG]", error);
    return NextResponse.json({ error: "Failed to log style metrics" }, { status: 500 });
  }
}
