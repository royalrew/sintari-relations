import { NextRequest, NextResponse } from "next/server";
import { writeFile, appendFile, mkdir } from "fs/promises";
import { join } from "path";

/**
 * POST /api/learn/promote
 * Främja ett meddelande till golden standard
 * 
 * När användaren främjar ett svar till golden:
 * 1. Skapar ett golden test case i rätt format
 * 2. Sparar till tests/golden/style/chat_cases.jsonl
 * 3. Inkluderar full kontext (user input, expected reply, signals)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      msg_id,
      suite = "chat_smart",
      level = "Silver",
      user_input,
      assistant_reply,
      conversation_context,
      signals,
    } = body;

    if (!msg_id) {
      return NextResponse.json(
        { error: "msg_id required" },
        { status: 400 }
      );
    }

    if (!user_input || !assistant_reply) {
      return NextResponse.json(
        { error: "user_input and assistant_reply required for golden case" },
        { status: 400 }
      );
    }

    // Skapa golden test case i rätt format
    const turnNumber = conversation_context?.filter((m: any) => m.role === "user").length || 1;
    const goldenCase = {
      id: `${level[0]}${String(Date.now()).slice(-3)}_promoted_${msg_id.slice(0, 8)}`,
      user: user_input,
      signals: signals || {
        intent: "share",
        affect: "medium",
        mode: "personal",
        risk: "SAFE",
        turn: turnNumber,
      },
      expect: {
        max_questions: 1,
        no_echo: true,
        warm_opening: true,
        // Expected reply kommer från assistant_reply
        expected_reply: assistant_reply,
      },
      // Metadata
      promoted_at: new Date().toISOString(),
      promoted_by: "user_feedback",
      original_msg_id: msg_id,
    };

    // Spara till golden test file
    const goldenDir = join(process.cwd(), "tests", "golden", "style");
    await mkdir(goldenDir, { recursive: true });
    
    const goldenFile = join(goldenDir, "chat_cases.jsonl");
    await appendFile(goldenFile, JSON.stringify(goldenCase) + "\n", "utf-8");

    // Spara även till en separat promoted-fil för enkel åtkomst
    const promotedDir = join(process.cwd(), "data", "promoted");
    await mkdir(promotedDir, { recursive: true });
    
    const promotedFile = join(promotedDir, `promoted_${Date.now()}_${msg_id}.json`);
    await writeFile(
      promotedFile,
      JSON.stringify({
        ...goldenCase,
        conversation_context,
        suite,
        level,
      }, null, 2),
      "utf-8"
    );

    console.log("⭐ Promoting to golden:", {
      msg_id,
      golden_case_id: goldenCase.id,
      level,
      suite,
      golden_file: goldenFile,
      promoted_file: promotedFile,
    });

    return NextResponse.json({
      success: true,
      message: `Promoted to ${level}`,
      golden_case_id: goldenCase.id,
      golden_file: goldenFile,
    });
  } catch (error) {
    console.error("❌ Error promoting:", error);
    return NextResponse.json(
      {
        error: "Failed to promote",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

