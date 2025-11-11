import { NextRequest, NextResponse } from "next/server";

/**
 * API route för Receptionisten
 * Använder systemprompt för varm mottagning, noll tvång, smart lotsning
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { msg, conversation, lastAssistant, readiness, state } = body;

    if (!msg) {
      return NextResponse.json({ error: "Missing msg" }, { status: 400 });
    }

    // Systemprompt-logik
    const reply = composeReceptionReply(msg, conversation || [], lastAssistant, readiness, state);

    return NextResponse.json({
      reply: reply.text,
      chips: reply.chips,
      meta: reply.meta,
    });
  } catch (error) {
    console.error("Reception reply error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate reply",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Komponerar reception-svar enligt systemprompt
 */
function composeReceptionReply(
  msg: string,
  conversation: any[],
  lastAssistant: string | null,
  readiness: number,
  state: string
): {
  text: string;
  chips: string[];
  meta: { asked: boolean; offer?: "light-analysis" | "route" | "none" };
} {
  // 1) Lyssna först, 1-2 meningar
  let text = "";
  
  // Spegla kort
  if (msg.length > 120) {
    text = "Jag hör att det är mycket på en gång.";
  } else if (msg.length < 12) {
    text = "Jag hör dig.";
  } else {
    text = "Jag är med dig.";
  }

  // 2) Frågebudget: max 1 öppen fråga varannan tur
  const userTurns = conversation.filter((m: any) => m.role === "user").length;
  const asked = userTurns > 0 && userTurns % 2 === 0 && msg.length >= 12;
  
  let question = "";
  if (asked && !/vet inte|ingen aning/i.test(msg)) {
    // Ingen fråga om användaren är osäker
    question = "";
  }

  // 3) Chips baserat på state
  const chips: string[] = ["Skriv fritt"];
  
  if (state === "OFFER_PATH" || userTurns >= 2) {
    chips.push("Föreslå väg");
  }
  
  chips.push("Hoppa över");
  
  if (readiness >= 0.5 && readiness < 0.8) {
    chips.push("Kör lätt föranalys");
  }
  
  if (readiness >= 0.8) {
    chips.push("Öppna full analys");
  }

  // 4) Meta
  const meta: { asked: boolean; offer?: "light-analysis" | "route" | "none" } = {
    asked: !!question,
  };

  if (readiness >= 0.5 && readiness < 0.8) {
    meta.offer = "light-analysis";
  } else if (state === "OFFER_PATH") {
    meta.offer = "route";
  } else {
    meta.offer = "none";
  }

  // Kombinera text och fråga
  const fullText = [text, question].filter(Boolean).join(" ");

  return {
    text: fullText,
    chips,
    meta,
  };
}

