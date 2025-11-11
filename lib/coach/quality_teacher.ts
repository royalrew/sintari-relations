/**
 * GPT-5 Teacher: Automatiserad kvalitetsövervakare för coach-svar
 * 
 * Denna modul använder GPT-5 som en "lärare" som:
 * 1. Bedömer coachens svar baserat på kriterier
 * 2. Ger konstruktiv feedback
 * 3. Identifierar mönster och förbättringsområden
 * 4. Loggar resultat för kontinuerlig förbättring
 * 
 * GPT-5 är vald specifikt för dess överlägsna förståelse av relationer och mänsklig kommunikation.
 */

// Ladda miljövariabler från backend/.env om de inte redan är laddade
import "@/lib/utils/loadBackendEnv";
import { z } from "zod";

export type QualityCriteria = {
  naturalness: number; // 0-10: Känns svaret naturligt och mänskligt?
  empathy: number; // 0-10: Visar svaret empati och förståelse?
  relevance: number; // 0-10: Är svaret relevant för användarens input?
  clarity: number; // 0-10: Är svaret tydligt och lätt att förstå?
  tone: number; // 0-10: Matchar tonen coachens persona?
  actionability: number; // 0-10: Ger svaret konkreta, handlingsbara steg?
  nonCoercive: number; // 0-10: Undviker svaret att vara påträngande eller tvingande?
};

export type TeacherFeedback = {
  overallScore: number; // 0-10, viktat medel av alla kriterier
  criteria: QualityCriteria;
  strengths: string[]; // Vad gjorde coachen bra?
  weaknesses: string[]; // Vad kan förbättras?
  suggestions: string[]; // Konkreta förbättringsförslag
  patternFlags: string[]; // Identifierade mönster (standardiserad taxonomi)
  severity: "pass" | "warn" | "fail"; // Allvarlighetsgrad
};

// Strikt Zod-schema för teacher-output
const TeacherJsonSchema = z.object({
  criteria: z.object({
    naturalness: z.number().min(0).max(10),
    empathy: z.number().min(0).max(10),
    relevance: z.number().min(0).max(10),
    clarity: z.number().min(0).max(10),
    tone: z.number().min(0).max(10),
    actionability: z.number().min(0).max(10),
    nonCoercive: z.number().min(0).max(10),
  }),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
  // Standardiserad taxonomi för pattern flags
  patternFlags: z.array(z.enum([
    "repetition",
    "too_generic",
    "over_mirroring",
    "malplaced_question",
    "low_empathy",
    "robot_phrase",
    "unclear_question"
  ])).default([]),
});

// Robust JSON-extraktion med schema-validering
function safeParseTeacherJson(text: string) {
  // Försök exakt JSON först
  try {
    const parsed = JSON.parse(text);
    return TeacherJsonSchema.parse(parsed);
  } catch {
    // Försök extrahera största JSON-blocket
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) {
      throw new Error("No JSON object found in teacher response");
    }
    try {
      const parsed = JSON.parse(m[0]);
      return TeacherJsonSchema.parse(parsed);
    } catch (schemaError) {
      throw new Error(`Schema validation failed: ${schemaError instanceof Error ? schemaError.message : String(schemaError)}`);
    }
  }
}

export type TeacherReview = {
  feedback: TeacherFeedback;
  timestamp: number;
  userInput: string;
  coachReply: string;
  context?: {
    conversationLength?: number;
    turnNumber?: number;
    insightsUsed?: any;
  };
};

/**
 * Initialiserar OpenAI-klienten (använder samma mönster som relation_agent_ai.ts)
 */
let openaiClient: any = null;
let openaiInitialized = false;

async function getOpenAIClient() {
  if (openaiInitialized) {
    return openaiClient;
  }

  if (!process.env.OPENAI_API_KEY) {
    console.log("⚠️ No OpenAI API key found, quality teacher will be disabled");
    openaiInitialized = true;
    return null;
  }

  try {
    // Try dynamic import first
    try {
      const openaiModule = await import("openai");
      const OpenAI = openaiModule.default || openaiModule.OpenAI;
      
      if (OpenAI) {
        openaiClient = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
        openaiInitialized = true;
        console.log("✅ OpenAI client initialized for quality teacher");
        return openaiClient;
      }
    } catch (importError) {
      console.log("⚠️ OpenAI SDK not available, using fetch API");
    }
    
    // Fallback: fetch-based client
    openaiClient = {
      chat: {
        completions: {
          create: async (params: any) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            try {
              const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: params.model || process.env.OPENAI_TEACHER_MODEL || "gpt-4o", // Fallback till gpt-4o om gpt-5 inte finns
                  messages: params.messages,
                  max_tokens: params.max_tokens,
                  temperature: params.temperature,
                  response_format: params.response_format, // Stöd för JSON mode
                }),
                signal: controller.signal,
              });
              
              clearTimeout(timeoutId);
              
              if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                console.error(`[TEACHER] OpenAI API error ${response.status}:`, errorText);
                
                // Om modellen inte finns (404 eller 400), försök med fallback
                if (response.status === 404 || response.status === 400) {
                  const fallbackModel = process.env.OPENAI_TEACHER_MODEL || "gpt-4o";
                  console.warn(`[TEACHER] Model not found, trying fallback: ${fallbackModel}`);
                  
                  // Retry med fallback-modell
                  const fallbackResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      model: fallbackModel,
                      messages: params.messages,
                      max_tokens: params.max_tokens,
                      temperature: params.temperature,
                      response_format: params.response_format,
                    }),
                    signal: controller.signal,
                  });
                  
                  if (!fallbackResponse.ok) {
                    throw new Error(`OpenAI API error (fallback): ${fallbackResponse.status} ${fallbackResponse.statusText}`);
                  }
                  
                  return await fallbackResponse.json();
                }
                
                throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
              }
              
              return await response.json();
            } catch (error) {
              clearTimeout(timeoutId);
              if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('OpenAI request timeout');
              }
              throw error;
            }
          }
        }
      }
    };
    
    openaiInitialized = true;
    console.log("✅ OpenAI fetch client initialized for quality teacher");
    return openaiClient;
  } catch (error) {
    console.error("Failed to initialize OpenAI for quality teacher:", error);
    openaiInitialized = true;
    return null;
  }
}

/**
 * System prompt för GPT-5 teacher
 * Strikt, tydlig instruktion för konsekvent bedömning
 */
const TEACHER_SYSTEM_PROMPT = `Du är en strikt kvalitetsbedömare för AI-coachning.
Returnera ENDAST strikt JSON enligt given nyckelstruktur. Inga förklaringar.

Bedöm på 7 kriterier (0–10). Tolka kort, var konsekvent, var språkmedveten (svenska in → svenska kommentarer).

Följande mönster ska FLAGGAS när de förekommer:
- repetition: upprepar användarens ord utan mervärde
- too_generic: allmän fras utan specifik hjälp
- over_mirroring: spegling som känns robotisk (t.ex. "Jag hör att ...")
- malplaced_question: fråga som inte följer naturligt
- low_empathy: saknar känsloerkännande
- robot_phrase: fraser som låter maskinellt ("Jag hör att du säger hej", "Jag hör att du är ...")
- unclear_question: vag/oklar fråga

Regler:
- Max 1 fråga var tredje tur (nonCoercive påverkas).
- Värdera actionability > 0 bara när konkreta mikrosteg erbjuds.
- Höj naturalness när språket är idiomatiskt och kortfattat.

Returnera exakt:
{
  "criteria": {
    "naturalness": 8,
    "empathy": 7,
    "relevance": 9,
    "clarity": 8,
    "tone": 8,
    "actionability": 6,
    "nonCoercive": 9
  },
  "strengths": ["Bra spegling", "Varm ton"],
  "weaknesses": ["För generellt", "Upprepning"],
  "suggestions": ["Använd mer specifik spegling", "Variera frågor"],
  "patternFlags": ["repetition", "too_generic"]
}`;

/**
 * Retry-funktion med exponential backoff
 */
async function withRetries<T>(
  fn: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const isRetryable =
        e?.status === 429 ||
        (e?.status >= 500 && e?.status < 600) ||
        /timeout/i.test(String(e?.message));
      
      if (!isRetryable || i === attempts - 1) break;
      
      // Exponential backoff: 0.5s, 1s, 2s
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

/**
 * Bedömer ett coach-svar med GPT-5 teacher
 * Förbättrad med strikt JSON-validering, observations och retries
 */
export async function reviewCoachReply(
  userInput: string,
  coachReply: string,
  context?: {
    conversationLength?: number;
    turnNumber?: number;
    insightsUsed?: any;
  }
): Promise<TeacherReview | null> {
  const openai = await getOpenAIClient();
  
  if (!openai) {
    console.log("⚠️ OpenAI not available, skipping quality review");
    return null;
  }

  try {
    // Enkla heuristiker för observations
    const questionCount = (coachReply.match(/\?/g) || []).length;
    const robotEcho = /\b(Jag hör att|Jag förstår att du säger|Jag uppfattar att)\b/i.test(coachReply);
    const overMirroring = (() => {
      const normalizedUser = userInput.trim().toLowerCase();
      const normalizedCoach = coachReply.trim().toLowerCase();
      return (
        normalizedCoach.startsWith("jag hör att") ||
        normalizedCoach.includes(normalizedUser.slice(0, 20))
      );
    })();

    // Frågefrekvens per 3 turer
    const questionsPerThreeTurns =
      context?.turnNumber && context.turnNumber > 2
        ? questionCount / Math.ceil(context.turnNumber / 3)
        : questionCount;

    const observations = {
      questionCount,
      questionsPerThreeTurns: Math.round(questionsPerThreeTurns * 10) / 10,
      robotEcho,
      overMirroring,
    };

    const userPrompt = `Bedöm enligt systeminstruktionen.

Användarens input: "${userInput}"
Coachens svar: "${coachReply}"

Kontext:
- Konversationslängd: ${context?.conversationLength ?? "okänd"}
- Tur nummer: ${context?.turnNumber ?? "okänd"}
- Insikter använda: ${context?.insightsUsed ? JSON.stringify(context.insightsUsed).slice(0, 200) : "inga"}

Observations (heuristik från systemet):
${JSON.stringify(observations)}

Returnera ENDAST JSON enligt nycklarna.`;

    // Retries med backoff
    const completion = await withRetries(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      
      try {
        return await openai.chat.completions.create({
          model: process.env.OPENAI_TEACHER_MODEL || "gpt-4o", // Fallback till gpt-4o tills gpt-5 finns
          messages: [
            {
              role: "system",
              content: TEACHER_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
          max_tokens: 800,
          temperature: 0.0, // Helt deterministiskt
          response_format: { type: "json_object" },
        });
      } finally {
        clearTimeout(timeoutId);
      }
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Empty teacher content");
    }

    // Strikt JSON-parsing med schema-validering
    const parsed = safeParseTeacherJson(content);

    // Mappa till QualityCriteria (clampScore behålls för extra säkerhet)
    const criteria: QualityCriteria = {
      naturalness: clampScore(parsed.criteria.naturalness),
      empathy: clampScore(parsed.criteria.empathy),
      relevance: clampScore(parsed.criteria.relevance),
      clarity: clampScore(parsed.criteria.clarity),
      tone: clampScore(parsed.criteria.tone),
      actionability: clampScore(parsed.criteria.actionability),
      nonCoercive: clampScore(parsed.criteria.nonCoercive),
    };

    // Beräkna overall score (viktat medel)
    const weights = {
      naturalness: 0.15,
      empathy: 0.20,
      relevance: 0.20,
      clarity: 0.15,
      tone: 0.15,
      actionability: 0.10,
      nonCoercive: 0.05,
    };

    const overallScore = Object.entries(criteria).reduce(
      (sum, [key, value]) => sum + (value * (weights[key as keyof typeof weights] || 0)),
      0
    );

    // Schema-validering säkerställer att dessa är arrays
    const strengths = parsed.strengths || [];
    const weaknesses = parsed.weaknesses || [];
    const suggestions = parsed.suggestions || [];
    const patternFlags = parsed.patternFlags || [];

    // Bestäm severity
    let severity: "pass" | "warn" | "fail" = "pass";
    if (overallScore < 5) {
      severity = "fail";
    } else if (overallScore < 7 || weaknesses.length > 2) {
      severity = "warn";
    }

    const feedback: TeacherFeedback = {
      overallScore: Math.round(overallScore * 10) / 10,
      criteria,
      strengths,
      weaknesses,
      suggestions,
      patternFlags,
      severity,
    };

    return {
      feedback,
      timestamp: Date.now(),
      userInput,
      coachReply,
      context,
    };

  } catch (error) {
    console.error("❌ Teacher review error:", error);
    if (error instanceof Error) {
      console.error("   Message:", error.message);
      console.error("   Stack:", error.stack);
    }
    // Returnera null så att felet inte blockerar coachen
    return null;
  }
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

/**
 * Loggar teacher review för analys
 * Sparar till filer i data/teacher-reviews/ för enkel åtkomst
 */
export async function logTeacherReview(review: TeacherReview): Promise<void> {
  try {
    const { writeFile, mkdir } = await import("fs/promises");
    const { join } = await import("path");
    
    // Spara till fil för enkel åtkomst
    const reviewsDir = join(process.cwd(), "data", "teacher-reviews");
    await mkdir(reviewsDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reviewFile = join(reviewsDir, `review_${timestamp}.json`);
    
    await writeFile(
      reviewFile,
      JSON.stringify(review, null, 2),
      "utf-8"
    );
    
    // Logga även till konsolen för snabb feedback
    console.log("📊 Teacher Review:", {
      score: review.feedback.overallScore,
      severity: review.feedback.severity,
      weaknesses: review.feedback.weaknesses,
      patterns: review.feedback.patternFlags,
      criteria: review.feedback.criteria,
      file: reviewFile,
    });
    
    // Om låg poäng eller fail, logga mer detaljerat
    if (review.feedback.severity === "fail" || review.feedback.overallScore < 5) {
      console.warn("⚠️ LOW SCORE DETECTED:", {
        score: review.feedback.overallScore,
        weaknesses: review.feedback.weaknesses,
        suggestions: review.feedback.suggestions,
        userInput: review.userInput.slice(0, 50),
        coachReply: review.coachReply.slice(0, 50),
      });
    }
  } catch (error) {
    // Fallback till konsol om filsparning misslyckas
    console.log("📊 Teacher Review:", {
      score: review.feedback.overallScore,
      severity: review.feedback.severity,
      weaknesses: review.feedback.weaknesses,
      patterns: review.feedback.patternFlags,
    });
    console.error("Failed to save teacher review to file:", error);
  }
}

