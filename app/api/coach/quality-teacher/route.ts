import { NextRequest, NextResponse } from "next/server";
import { reviewCoachReply, logTeacherReview } from "@/lib/coach/quality_teacher";
import "@/lib/utils/loadBackendEnv"; // Ladda backend/.env

/**
 * POST /api/coach/quality-teacher
 * Batch-review API för manuell körning av GPT-5 Teacher
 * 
 * Användning:
 * - Kör manuellt i devtools eller via admin-knapp
 * - Ingen live-visning i chatten
 * - Batch-review körs när du vill analysera konversationer
 */
export async function POST(req: NextRequest) {
  if (process.env.ENABLE_QUALITY_TEACHER === "off") {
    return NextResponse.json({ ok: false, error: "Teacher disabled" }, { status: 400 });
  }

  try {
    const { conversation } = await req.json();
    
    if (!conversation || !Array.isArray(conversation) || conversation.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid conversation format" },
        { status: 400 }
      );
    }

    // Kör teacher på sista turen (eller loopa över alla om du vill)
    const last = conversation[conversation.length - 1];
    const prev = conversation.slice(0, -1) ?? [];
    
    const userInput = last?.role === "user" ? last.text || last.content : "";
    const coachReply = last?.role === "coach" || last?.role === "assistant" ? last.text || last.content : "";

    if (!userInput || !coachReply) {
      return NextResponse.json(
        { ok: false, error: "Last turn must contain both user input and coach reply" },
        { status: 400 }
      );
    }

    const review = await reviewCoachReply(userInput, coachReply, {
      conversationLength: conversation.length,
      turnNumber: conversation.filter((m: any) => m.role === "user").length,
      insightsUsed: { prevTurns: prev.length }
    });

    if (review) {
      await logTeacherReview(review);
    }

    return NextResponse.json({ ok: true, review });
  } catch (error) {
    console.error("Batch teacher review error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to process teacher review" },
      { status: 500 }
    );
  }
}
