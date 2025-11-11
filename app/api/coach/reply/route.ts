import { NextRequest, NextResponse } from "next/server";
import { rateLimitMiddleware } from "@/lib/middleware/rateLimit";
import { safetyCheck } from "@/lib/coach/safety_gate";
import { orchestrateCoachReply } from "@/lib/coach/orchestrateCoachReply";
import { collectTelemetry, logCoachTelemetry } from "@/lib/coach/telemetry";
import { crisisStabilize, extractJurisdiction } from "@/lib/coach/crisis_templates";
import { toneFix } from "@/lib/coach/tone_fixer";
import "@/lib/utils/loadBackendEnv"; // Ladda backend/.env

/**
 * API route för snabb coach-svar med komplett pipeline
 * Pipeline: safetyCheck → (ev. crisis block) → orchestrateCoachReply → return
 */
export async function POST(request: NextRequest) {
  // Rate limit check
  const rateLimitResponse = rateLimitMiddleware(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const startTime = Date.now();

  try {
    const body = await request.json();
    const { msg, threadId, conversation, lastInsights, consent = true, jurisdiction = 'SE' } = body;

    if (!msg || !threadId) {
      return NextResponse.json(
        { error: "Missing msg or threadId" },
        { status: 400 }
      );
    }

    // ============================================================
    // STEG A: Säkerhetslager (pre-gate)
    // ============================================================
    const safetyResult = await safetyCheck(msg, consent, jurisdiction);
    
    // Om blockerad → returnera krismeddelande eller block
    if (safetyResult.blocked) {
      if (safetyResult.crisis_required && safetyResult.crisis_plan) {
        // Generera stabiliserat kris-svar genom pipeline
        const crisisJurisdiction = extractJurisdiction(safetyResult.crisis_plan) || jurisdiction || 'SE';
        let crisisMessage = crisisStabilize({
          country: crisisJurisdiction,
          jurisdiction: crisisJurisdiction,
          language: body.language || 'sv',
        });
        
        // Gå genom coach-pipeline för kris-svar
        // 1) Tone fixer (ta bort robot-fraser, men INTE lägg in extra empati - kris-template har redan empati)
        const previousReplies = (conversation || [])
          .filter(m => m.role === 'assistant')
          .map(m => m.content);
        
        // Använd toneFix men med mood 'neutral' för att undvika extra empati-tillägg
        // (kris-template har redan empati inbyggt)
        crisisMessage = toneFix({
          text: crisisMessage,
          previousReplies,
          mood: 'neutral', // Neutral för att undvika extra empati-tillägg
        });
        
        // 2) UTF-8 normalisering (säkerställ korrekt encoding)
        crisisMessage = normalizeUTF8(crisisMessage);
        
        // 3) Säkerställ att kris-svaret INTE innehåller löften om ständig närvaro
        crisisMessage = crisisMessage.replace(/Jag lämnar dig inte/gi, '');
        crisisMessage = crisisMessage.replace(/\s+/g, ' ').trim(); // Ta bort extra mellanslag
        
        return NextResponse.json({
          reply: crisisMessage,
          blocked: true,
          crisis_required: true,
          crisis_plan: safetyResult.crisis_plan,
          safety_level: safetyResult.safety_level,
          latency_ms: Date.now() - startTime,
        });
      } else {
        // Blockera utan krisplan
        return NextResponse.json({
          reply: "Jag kan inte hjälpa med detta just nu. Kontakta gärna en professionell för stöd.",
          blocked: true,
          safety_level: safetyResult.safety_level,
          reason: safetyResult.reason,
          latency_ms: Date.now() - startTime,
        }, { status: 403 });
      }
    }

    // ============================================================
    // STEG B: Orchestrate Coach Reply
    // ============================================================
    const orchestrateResult = await orchestrateCoachReply({
      userMessage: msg,
      conversation: conversation || [],
      threadId,
      language: body.language || 'sv',
      consent,
      lastInsights,
    });

    // Bestäm om bakgrundsanalys ska triggas
    const analysisDue = shouldTriggerAnalysis(conversation || [], threadId) || 
                        detectCoachTrigger(msg, conversation || []);

    // ============================================================
    // STEG C: Telemetry (lättvikt)
    // ============================================================
    const totalLatency = Date.now() - startTime;
    
    // Samla och logga telemetry
    const telemetry = collectTelemetry(
      threadId,
      msg,
      orchestrateResult.reply,
      totalLatency,
      safetyResult.safety_level,
      orchestrateResult,
      false,
      false
    );
    
    logCoachTelemetry(telemetry);
    
    // Console logging för debugging
    console.log(`[COACH] Reply generated: ${orchestrateResult.reply.substring(0, 50)}... (${totalLatency}ms)`);
    if (orchestrateResult.mood) {
      console.log(`[COACH] Mood: ${orchestrateResult.mood.level} (${orchestrateResult.mood.score.toFixed(2)})`);
    }
    // Teacher review är stängd av - batch-review körs manuellt

    // Säkerställ att reply_meta är borttaget från svaret (extra säkerhetslager)
    // VIKTIGT: Metadata ska ALDRIG visas för användaren
    let finalReply = orchestrateResult.reply;
    finalReply = finalReply.replace(/<!--\s*reply_meta:.*?-->/gs, '').trim();
    finalReply = finalReply.replace(/\n\n+/g, '\n\n'); // Ta bort extra tomma rader

    return NextResponse.json({
      reply: finalReply,
      analysisDue,
      mood: orchestrateResult.mood,
      memoryFacets: orchestrateResult.memoryFacets,
      safety_level: safetyResult.safety_level,
      latency_ms: totalLatency,
      insightsUsed: {
        goals: lastInsights?.goals?.filter((g: any) => g.confidence >= 0.6) || [],
        recommendations: lastInsights?.recommendations?.filter((r: any) => r.confidence >= 0.6) || [],
      },
      // teacherReview tas bort - batch-review körs manuellt via /api/coach/quality-teacher
    });
  } catch (error) {
    // Logga fullständig error-information för debugging
    console.error("Coach reply error:", error);
    if (error instanceof Error) {
      console.error("Error stack:", error.stack);
      console.error("Error name:", error.name);
    }
    
    // Returnera mer detaljerad felinformation i development
    const isDevelopment = process.env.NODE_ENV === 'development';
    return NextResponse.json(
      {
        error: "Failed to generate reply",
        details: error instanceof Error ? error.message : String(error),
        ...(isDevelopment && error instanceof Error && { stack: error.stack }),
      },
      { status: 500 }
    );
  }
}

/**
 * UTF-8 normalisering - säkerställ korrekt encoding för svenska tecken
 */
function normalizeUTF8(text: string): string {
  // Ta bort eventuella felaktiga encoding-artefakter
  try {
    // Om texten redan är korrekt UTF-8, returnera som den är
    return text;
  } catch {
    // Fallback: försök reparera encoding
    return text
      .replace(/�/g, '') // Ta bort felaktiga tecken
      .replace(/Ã¥/g, 'å')
      .replace(/Ã¤/g, 'ä')
      .replace(/Ã¶/g, 'ö')
      .replace(/Ã…/g, 'Å')
      .replace(/Ã„/g, 'Ä')
      .replace(/Ã–/g, 'Ö');
  }
}

/**
 * DEPRECATED: Använd crisisStabilize() från crisis_templates.ts istället
 * Behålls för bakåtkompatibilitet
 */
function buildCrisisMessage(crisisPlan: any): string {
  if (!crisisPlan || !crisisPlan.immediate_steps) {
    return "Det här låter som en kris. Kontakta 112 om du är i omedelbar fara, eller ring självmordslinjen på 90101 för stöd.";
  }
  
  const steps = crisisPlan.immediate_steps || [];
  return steps.join(' ');
}

/**
 * DEPRECATED: Använd orchestrateCoachReply istället
 * Behålls för bakåtkompatibilitet
 */
function composeCoachReply(msg: string, insights: any, conversation: any[] = []): string {
  const CONFIDENCE_THRESHOLD = 0.6; // Visa endast insikter med confidence >= 0.6
  const trimmed = msg.trim();

  if (isGreeting(trimmed)) {
    return "Hej! Jag är här och lyssnar. Vad vill du utforska eller stärka just nu?";
  }
  
  // Filtrera insikter med confidence >= threshold
  const highConfidenceGoals = (insights.goals || []).filter((g: any) => g.confidence >= CONFIDENCE_THRESHOLD);
  const highConfidenceRecos = (insights.recommendations || []).filter((r: any) => r.confidence >= CONFIDENCE_THRESHOLD);
  const highConfidencePatterns = (insights.patterns || []).filter((p: any) => p.confidence >= CONFIDENCE_THRESHOLD);
  
  // Riskflaggor (alltid visa om de finns)
  const riskFlags = insights.riskFlags || [];
  
  // Hämta tidigare assistant-svar för att undvika upprepning
  const previousReplies = conversation
    .filter((m: any) => m.role === "assistant")
    .map((m: any) => m.content?.toLowerCase() || "")
    .slice(-5); // Senaste 5 svaren för bättre variation
  
  // 1) Spegla kort - variera öppningsfraserna från början
  const mirrorPhrases = [
    `Jag hör att ${extractKeyPoint(msg)}.`,
    `Det låter som att ${extractKeyPoint(msg)}.`,
    `Jag förstår att ${extractKeyPoint(msg)}.`,
    `Du berättar att ${extractKeyPoint(msg)}.`,
    `Du säger att ${extractKeyPoint(msg)}.`,
    `${extractKeyPoint(msg)}.`,
  ];
  
  // Välj en speglingsfras som inte användes nyligen
  let mirror = mirrorPhrases[0];
  let mirrorAttempts = 0;
  
  // Kontrollera om "Jag hör att" användes i senaste svaren
  const recentUsesJagHor = previousReplies.some((prev: string) => 
    prev.startsWith("jag hör att") || prev.startsWith("det låter som att")
  );
  
  // Om "Jag hör att" användes nyligen, välj en annan variant
  if (recentUsesJagHor) {
    const alternatives = mirrorPhrases.slice(1); // Skippa "Jag hör att"
    mirror = alternatives[Math.floor(Math.random() * alternatives.length)];
  } else {
    // Annars, välj slumpmässigt men undvik upprepning
    mirror = mirrorPhrases[Math.floor(Math.random() * mirrorPhrases.length)];
    while (
      previousReplies.some((prev: string) => {
        const prevStart = prev.slice(0, 15);
        const mirrorStart = mirror.toLowerCase().slice(0, 15);
        return prevStart === mirrorStart;
      }) &&
      mirrorAttempts < 10
    ) {
      mirror = mirrorPhrases[Math.floor(Math.random() * mirrorPhrases.length)];
      mirrorAttempts++;
    }
  }
  
  // 2) Föreslå max två micro-steg (endast high confidence)
  let steps: string[] = [];
  if (highConfidenceRecos.length > 0) {
    steps = highConfidenceRecos.slice(0, 2).map((r: any) => r.label);
  } else if (highConfidenceGoals.length > 0) {
    // Om inga rekommendationer, använd första målet som steg
    steps = [highConfidenceGoals[0].label];
  }
  
  // 3) Ställ en enkel, konkret checkfråga (variera för att undvika upprepning)
  const checkQuestions = [
    "Vad känns det som?",
    "Berätta mer.",
    "Hur känns det?",
    "Vad tänker du?",
    "Hur ser det ut för dig?",
    "Vad händer när du tänker på det?",
    "Vad vill du säga om det?",
    "Hur mår du med det?",
  ];
  
  // Välj en fråga som inte användes nyligen
  let checkQuestion = checkQuestions[Math.floor(Math.random() * checkQuestions.length)];
  let questionAttempts = 0;
  while (previousReplies.some((prev: string) => prev.includes(checkQuestion.toLowerCase())) && questionAttempts < 10) {
    checkQuestion = checkQuestions[Math.floor(Math.random() * checkQuestions.length)];
    questionAttempts++;
  }
  
  // Bygg svar
  let reply = mirror;
  
  if (steps.length > 0) {
    reply += ` Ett första steg kan vara att ${steps[0].toLowerCase()}`;
    if (steps.length > 1) {
      reply += `, eller ${steps[1].toLowerCase()}`;
    }
    reply += ".";
  } else if (highConfidencePatterns.length > 0) {
    // Om inga steg, använd mönster som försiktig hypotes
    const pattern = highConfidencePatterns[0];
    reply += ` Låter det som att ${pattern.label.toLowerCase()} kan vara relevant här?`;
  }
  
  reply += ` ${checkQuestion}`;
  
  return reply;
}

/**
 * Extraherar nyckelpunkt från meddelandet (för spegling)
 * Förbättrad för att hantera komplexa meningar och undvika grammatiska fel
 */
function extractKeyPoint(msg: string): string {
  const trimmed = msg.trim();
  if (!trimmed) {
    return "du delar något här.";
  }

  const lower = trimmed.toLowerCase();
  const baseWord = lower.replace(/[!?.,]+$/g, "");
  const words = baseWord.split(/\s+/).filter(Boolean);

  // Hantera enstaka ord eller hälsningar
  if (words.length === 1) {
    const word = words[0];
    if (["hej", "tjena", "hallå", "hejsan"].includes(word)) {
      return "du säger hej";
    }
    return `du säger "${word}"`;
  }

  // Speciella mönster som behöver smartare hantering
  // "jag vill bli X" → "du vill bli X"
  if (/^jag vill bli\b/.test(baseWord)) {
    const rest = baseWord.replace(/^jag vill bli\s+/, "");
    return `du vill bli ${rest}`;
  }

  // "jag vill att du X" → "du vill ha hjälp med X" eller "du vill att jag X"
  if (/^jag vill att du\b/.test(baseWord)) {
    const rest = baseWord.replace(/^jag vill att du\s+/, "");
    // Om resten är "hjälper mig med det" → "du vill ha hjälp med det"
    if (/hjälp/i.test(rest)) {
      return "du vill ha hjälp med det";
    }
    // Annars: "du vill att jag [rest]"
    return `du vill att jag ${rest}`;
  }

  // "jag vill X" → "du vill X"
  if (/^jag vill\b/.test(baseWord)) {
    const rest = baseWord.replace(/^jag vill\s+/, "");
    return `du vill ${rest}`;
  }

  // "att jag skall X" → "du skall X" (ta bort "att" i början)
  if (/^att jag\b/.test(baseWord)) {
    const rest = baseWord.replace(/^att\s+/, "");
    let transformed = rest.replace(/^jag\b/, "du");
    transformed = transformed.replace(/\bmin\b/g, "din");
    transformed = transformed.replace(/\bmitt\b/g, "ditt");
    transformed = transformed.replace(/\bmina\b/g, "dina");
    transformed = transformed.replace(/\bmig\b/g, "dig");
    // Ta bort dubbel "att" om det uppstår
    transformed = transformed.replace(/\batt\s+att\b/g, "att");
    return transformed;
  }

  // Om första ordet är "jag" – spegla som "du ..."
  let transformed = baseWord;
  if (transformed.startsWith("jag ")) {
    transformed = transformed.replace(/^jag\b/, "du");
    transformed = transformed.replace(/\bmin\b/g, "din");
    transformed = transformed.replace(/\bmitt\b/g, "ditt");
    transformed = transformed.replace(/\bmina\b/g, "dina");
    transformed = transformed.replace(/\bmig\b/g, "dig");
  }

  // Ta bort dubbel "att" (kan uppstå efter transformationer)
  transformed = transformed.replace(/\batt\s+att\b/g, "att");
  transformed = transformed.replace(/\s+/g, " "); // Ta bort extra mellanslag

  if (transformed.length < 60) {
    return transformed.replace(/[.?!]+$/g, "");
  }

  // Ta första meningen eller första 40 tecknen
  const firstSentence = transformed.split(/[.!?]/)[0];
  if (firstSentence.length > 0 && firstSentence.length < 60) {
    return firstSentence.replace(/[.?!]+$/g, "");
  }

  const snippet = transformed.slice(0, 40).trim();
  return snippet.length > 0 ? `${snippet}...` : "du delar något viktigt";
}

function isGreeting(msg: string): boolean {
  if (!msg) return false;
  const normalized = msg
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return false;

  const greetings = new Set([
    "hej",
    "hejsan",
    "hej hej",
    "hejhej",
    "tjena",
    "tjenare",
    "tja",
    "hallå",
    "hallå där",
    "god morgon",
    "godmorgon",
    "god kväll",
    "godkväll",
    "hello",
    "hi",
  ]);

  return greetings.has(normalized);
}

/**
 * Bestämmer om bakgrundsanalys ska triggas
 * Kadens: var 3:e meddelande + event-triggers
 */
function shouldTriggerAnalysis(conversation: any[], threadId: string): boolean {
  const messageCount = conversation.filter((m: any) => m.role === "user").length;
  
  // Kadens: var 3:e meddelande
  if (messageCount > 0 && messageCount % 3 === 0) {
    return true;
  }
  
  // Event-triggers (skulle behöva jämföra med tidigare state):
  // - Nya mål upptäcks eller byter etikett
  // - Riskflagga ändras (0→1 eller 1→0)
  // - Par-läge aktiveras
  
  // För nu: returnera true var 3:e meddelande
  return false; // Kommer att triggas av kadens-logiken ovan
}

/**
 * Detekterar om användaren ber om råd eller har hög stress/intensitet
 */
function detectCoachTrigger(msg: string, conversation: any[]): boolean {
  // Användaren ber om råd
  const askingForAdvice = /\b(hur (gör|ska|borde|kan)|vad (borde|skulle|kan|ska)|ge mig|hjälp mig|råd|tips)\b/i.test(msg);
  
  // Hög intensitet/stress (enkel detektion)
  const highIntensity = /!{2,}|😢|😭|panik|stress|ångest|orolig|rädd/i.test(msg);
  
  // Längre meddelanden kan indikera behov av stöd
  const longMessage = msg.length > 150;
  
  return askingForAdvice || highIntensity || longMessage;
}

