// AI-powered relation agent using OpenAI for more nuanced analysis
// Falls back to deterministic agent if OpenAI fails

import { relationAgentV1, type RelationAgentOutput } from "./relation_agent";

// Dynamic import för OpenAI för att undvika build-problem
let openaiClient: any = null;
let openaiInitialized = false;

async function initializeOpenAI() {
  if (openaiInitialized) {
    return openaiClient;
  }
  
  if (!process.env.OPENAI_API_KEY) {
    console.log("⚠️ No OpenAI API key found, will use fallback mode");
    openaiInitialized = true;
    return null;
  }
  
  try {
    console.log("🔑 OpenAI API key found, attempting to initialize");
    
    // Try dynamic import first, fallback to fetch if it fails
    try {
      const openaiModule = await import("openai");
      const OpenAI = openaiModule.default || openaiModule.OpenAI;
      
      if (OpenAI) {
        openaiClient = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
        openaiInitialized = true;
        console.log("✅ OpenAI client initialized successfully");
        return openaiClient;
      }
    } catch (importError) {
      console.log("⚠️ OpenAI SDK not available, will use fetch API");
    }
    
    // Fallback: create a simple fetch-based client
    openaiClient = {
      chat: {
        completions: {
          create: async (params: any) => {
            // Create timeout controller
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            try {
              const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: params.model || "gpt-3.5-turbo",
                  messages: params.messages,
                  max_tokens: params.max_tokens,
                  temperature: params.temperature,
                }),
                signal: controller.signal,
              });
              
              clearTimeout(timeoutId);
              
              if (!response.ok) {
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
    console.log("✅ OpenAI fetch client initialized successfully");
    return openaiClient;
  } catch (error) {
    console.error("Failed to initialize OpenAI:", error);
    console.error("Will fall back to deterministic agent");
    openaiInitialized = true;
    return null;
  }
}

export type RelationAgentAIOutput = RelationAgentOutput & {
  analysisMode: "ai" | "fallback";
  confidence?: number;
  evidence?: any[];
  explain_spans_labeled?: any[];
};

export async function relationAgentAI(input: { 
  person1: string; 
  person2: string; 
  description: string; 
}): Promise<RelationAgentAIOutput> {
  const { person1, person2, description } = input;

  // Always run deterministic analysis first for comparison and safety
  const fallbackResult = relationAgentV1(input);

  // Initialize OpenAI dynamically
  const openai = await initializeOpenAI();

  // If no OpenAI API key or OpenAI fails, use deterministic result
  if (!openai) {
    console.log("📋 OpenAI not configured, using deterministic agent");
    return {
      ...fallbackResult,
      analysisMode: "fallback",
      confidence: 0.8,
      explain_spans_labeled: fallbackResult.explain_spans_labeled
    };
  }

  console.log("🤖 Attempting OpenAI analysis...");

  try {
    // Create a prompt for OpenAI that's focused and specific
    const prompt = `Du är en relationsexpert som analyserar relationer mellan två personer.

Person 1: ${person1}
Person 2: ${person2}
Beskrivning av relationen: ${description}

Analysera detta och ge:
1. EXAKT 3 korta reflektioner (maksimalt 80 tecken var)
2. 1 konkret, handlingsbar rekommendation (maksimalt 120 tecken)
3. En safety-flagga (true/false) om det finns tecken på trygghetshot eller våld

REKOMMENDATION: Använd standardiserat språk:
- Positiva relationer: "Fortsätt med...", "Utveckla vidare..."
- Neutrala/utmaningar: "Diskutera och planera...", "Arbeta tillsammans med..."

SVARA ENDAST med JSON i denna exakta format:
{
  "reflections": ["reflektion 1", "reflektion 2", "reflektion 3"],
  "recommendation": "din rekommendation här",
  "safetyFlag": true eller false,
  "confidence": 0.1-1.0
}`;

    // Create timeout wrapper for the OpenAI call
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI request timeout')), 10000);
    });

    const completion = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-3.5-turbo", // Billig modell för kostnadseffektivitet
        messages: [
          {
            role: "system",
            content: "Du är en kunnig relationsexpert som ger konkreta, korta råd på svenska. Använd korrekt svenska grammatik och standardiserat språk: 'Fortsätt med...' för positiva relationer, 'Diskutera och planera...' för utmaningar. Fokusera på trygghet först, sedan praktiska lösningar."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 300, // Begränsa för kostnad
        temperature: 0.7,
      }),
      timeoutPromise
    ]) as any;

    const response = completion.choices[0]?.message?.content;
    
    if (!response) {
      throw new Error("No response from OpenAI");
    }

    console.log("✅ OpenAI responded, parsing JSON...");

    // Try to parse JSON response
    let aiResult;
    try {
      aiResult = JSON.parse(response);
      console.log("✅ JSON parsed successfully");
    } catch (parseError) {
      console.error("❌ Failed to parse OpenAI response as JSON:");
      console.error("Raw response:", response);
      throw new Error("Invalid JSON response from OpenAI");
    }

    // Validate the structure
    if (!aiResult.reflections || !Array.isArray(aiResult.reflections) || 
        aiResult.reflections.length !== 3 || 
        typeof aiResult.recommendation !== "string" ||
        typeof aiResult.safetyFlag !== "boolean") {
      throw new Error("Invalid response format from OpenAI");
    }

    // If safety flag differs significantly from deterministic agent, 
    // trust the deterministic agent more for safety
    const finalSafetyFlag = fallbackResult.safetyFlag || aiResult.safetyFlag;

    console.log("🎉 OpenAI analysis completed successfully!");
    
    return {
      reflections: aiResult.reflections.slice(0, 3), // Ensure exactly 3
      recommendation: aiResult.recommendation,
      safetyFlag: finalSafetyFlag,
      analysisMode: "ai",
      confidence: aiResult.confidence || 0.9,
      evidence: fallbackResult.evidence,
      explain_spans_labeled: fallbackResult.explain_spans_labeled
    };

  } catch (error) {
    console.error("❌ OpenAI analysis failed, falling back to deterministic agent:");
    console.error("Error details:", error instanceof Error ? error.message : String(error));
    
    return {
      ...fallbackResult,
      analysisMode: "fallback",
      confidence: 0.8,
      evidence: fallbackResult.evidence,
      explain_spans_labeled: fallbackResult.explain_spans_labeled
    };
  }
}
