import { NextRequest, NextResponse } from "next/server";
import { reviewCoachReply, logTeacherReview } from "@/lib/coach/quality_teacher";
import "@/lib/utils/loadBackendEnv"; // Ladda backend/.env

/**
 * POST /api/test-teacher-review
 * Test-endpoint för att manuellt trigga en teacher review
 */
export async function POST(request: NextRequest) {
  try {
    // Kontrollera att Quality Teacher är aktiverad
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY saknas i .env" },
        { status: 400 }
      );
    }

    if (process.env.ENABLE_QUALITY_TEACHER !== "true") {
      return NextResponse.json(
        { error: "ENABLE_QUALITY_TEACHER är inte satt till 'true'" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { userInput, coachReply } = body;

    if (!userInput || !coachReply) {
      return NextResponse.json(
        { error: "userInput och coachReply krävs" },
        { status: 400 }
      );
    }

    console.log("🧪 Testar teacher review...");
    console.log(`   User: ${userInput}`);
    console.log(`   Coach: ${coachReply}`);

    // Kör review
    const review = await reviewCoachReply(
      userInput,
      coachReply,
      {
        conversationLength: 2,
        turnNumber: 1,
        insightsUsed: {},
      }
    );

    if (!review) {
      return NextResponse.json(
        { error: "Review returnerade null (kolla konsolen för fel)" },
        { status: 500 }
      );
    }

    // Spara review
    await logTeacherReview(review);

    return NextResponse.json({
      success: true,
      review: {
        score: review.feedback.overallScore,
        severity: review.feedback.severity,
        weaknesses: review.feedback.weaknesses,
        suggestions: review.feedback.suggestions,
      },
      message: "Review skapad! Kolla /teacher-reviews för att se den.",
    });
  } catch (error) {
    console.error("Test teacher review error:", error);
    return NextResponse.json(
      {
        error: "Failed to create review",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

