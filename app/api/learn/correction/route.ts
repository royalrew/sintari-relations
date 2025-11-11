import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { reviewCoachReply } from "@/lib/coach/quality_teacher";

/**
 * POST /api/learn/correction
 * Spara korrigering av ett meddelande
 * 
 * När användaren korrigerar ett svar:
 * 1. Sparar korrigeringen med full kontext
 * 2. Skickar till GPT-5 Teacher för analys
 * 3. Loggar för framtida förbättringar
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { msg_id, target, user_input, original_reply, conversation_context } = body;

    if (!msg_id || !target) {
      return NextResponse.json(
        { error: "msg_id and target required" },
        { status: 400 }
      );
    }

    // Spara korrigeringen till fil för analys
    const correctionsDir = join(process.cwd(), "data", "corrections");
    await mkdir(correctionsDir, { recursive: true });

    const correction = {
      id: msg_id,
      timestamp: new Date().toISOString(),
      original_reply: original_reply || "unknown",
      corrected_reply: target,
      user_input: user_input || "unknown",
      conversation_context: conversation_context || [],
    };

    const correctionFile = join(correctionsDir, `correction_${Date.now()}_${msg_id}.json`);
    await writeFile(correctionFile, JSON.stringify(correction, null, 2), "utf-8");

    // Skicka till GPT-5 Teacher för analys (om aktiverad)
    if (process.env.OPENAI_API_KEY && process.env.ENABLE_QUALITY_TEACHER === "true") {
      try {
        const teacherReview = await reviewCoachReply(
          user_input || "unknown",
          original_reply || "unknown",
          {
            conversationLength: conversation_context?.length || 0,
            turnNumber: conversation_context?.filter((m: any) => m.role === "user").length || 0,
          }
        );

        if (teacherReview) {
          // Spara teacher-analys tillsammans med korrigeringen
          const teacherFile = join(correctionsDir, `teacher_${Date.now()}_${msg_id}.json`);
          await writeFile(
            teacherFile,
            JSON.stringify({
              correction_id: msg_id,
              teacher_review: teacherReview,
              corrected_reply: target,
            }, null, 2),
            "utf-8"
          );
        }
      } catch (teacherError) {
        console.error("Teacher review failed:", teacherError);
        // Fortsätt även om teacher misslyckas
      }
    }

    console.log("✏️ Correction saved:", {
      msg_id,
      correction_file: correctionFile,
      original_length: original_reply?.length || 0,
      corrected_length: target.length,
    });

    return NextResponse.json({
      success: true,
      message: "Correction saved",
      correction_id: msg_id,
      file: correctionFile,
    });
  } catch (error) {
    console.error("❌ Error saving correction:", error);
    return NextResponse.json(
      { error: "Failed to save correction", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

