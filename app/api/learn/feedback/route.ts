import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/learn/feedback
 * Spara feedback på ett meddelande (👍 eller 👎)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { msg_id, vote, tags = [], notes = "" } = body;

    if (!msg_id || !vote) {
      return NextResponse.json(
        { error: "msg_id and vote required" },
        { status: 400 }
      );
    }

    // TODO: Implement actual feedback storage
    console.log("📊 Feedback received:", { msg_id, vote, tags, notes });

    return NextResponse.json({
      success: true,
      message: "Feedback saved",
    });
  } catch (error) {
    console.error("❌ Error saving feedback:", error);
    return NextResponse.json(
      { error: "Failed to save feedback" },
      { status: 500 }
    );
  }
}

