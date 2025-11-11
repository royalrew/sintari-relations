import { NextRequest, NextResponse } from "next/server";
import { runAllAgents } from "@/lib/agents/agent_orchestrator";
import { rateLimitMiddleware } from "@/lib/middleware/rateLimit";

/**
 * API route för bakgrundsanalys (non-blocking)
 * Körs via sendBeacon eller keepalive fetch
 */
export async function POST(request: NextRequest) {
  // Rate limit check
  const rateLimitResponse = rateLimitMiddleware(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await request.json();
    const { threadId, conversation, mode } = body;

    if (!threadId) {
      return NextResponse.json(
        { error: "Missing threadId" },
        { status: 400 }
      );
    }

    // För "light" mode från Reception, skippa full analys om ingen konversation finns
    if (mode === "light" && !conversation) {
      // Reception skickar bara threadId, vi kan acceptera detta och returnera success
      return NextResponse.json({
        success: true,
        mode: "light",
        message: "Light analysis queued",
        threadId,
      });
    }

    // Om conversation saknas men mode inte är "light", returnera error
    if (!conversation) {
      return NextResponse.json(
        { error: "Missing conversation" },
        { status: 400 }
      );
    }

    // Samla konversationen till en beskrivning
    const conversationText = conversation
      .map((msg: { role: string; content: string }) => {
        const speaker = msg.role === "user" ? "Användare" : "AI-coachen";
        return `${speaker}: ${msg.content}`;
      })
      .join("\n");

    // Kör samma agent-system som /analyze använder
    const runId = `coach_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const timestamp = new Date().toISOString();

    const agentResults = await runAllAgents(
      {
        person1: "Användare",
        person2: "AI-coachen",
        description: conversationText,
        consent: true,
      },
      {
        run_id: runId,
        timestamp,
        language: "sv",
      }
    );

    // Extrahera relevanta insikter från agent-resultat
    const insights = extractCoachInsights(agentResults);

    // TODO: Spara insikter till Redis/DB med threadId
    // await saveInsights(threadId, insights);

    return NextResponse.json({
      success: true,
      insights,
      runId,
    });
  } catch (error) {
    console.error("Coach analyze error:", error);
    return NextResponse.json(
      {
        error: "Failed to analyze conversation",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Extraherar relevanta insikter från agent-resultat för coach-kontext
 */
function extractCoachInsights(agentResults: any) {
  const insights: {
    goals?: Array<{ label: string; confidence: number; evidence?: string[] }>;
    recommendations?: Array<{ label: string; confidence: number }>;
    challenges?: string[];
    strengths?: string[];
    riskFlags?: Array<{ type: string; score: number }>;
    communication?: any;
    patterns?: Array<{ label: string; confidence: number }>;
  } = {};

  if (!agentResults?.agents) {
    return insights;
  }

  // Hitta relevanta agenter
  const planFocus = agentResults.agents.find((a: any) => a.agent_id === "plan_focus");
  const planInterventions = agentResults.agents.find((a: any) => a.agent_id === "plan_interventions");
  const diagCommunication = agentResults.agents.find((a: any) => a.agent_id === "diag_communication");
  const metaPatterns = agentResults.agents.find((a: any) => a.agent_id === "meta_patterns");
  const safetyGate = agentResults.agents.find((a: any) => a.agent_id === "safety_gate");
  const riskAbuse = agentResults.agents.find((a: any) => a.agent_id === "risk_abuse");
  const riskCoercion = agentResults.agents.find((a: any) => a.agent_id === "risk_coercion");
  const riskSelfharm = agentResults.agents.find((a: any) => a.agent_id === "risk_selfharm");

  // Extrahera mål och fokusområden med confidence
  if (planFocus?.output) {
    const focusAreas = planFocus.output.focus_areas || [];
    insights.goals = focusAreas.map((area: any) => ({
      label: typeof area === "string" ? area : area.label || area,
      confidence: area.confidence || 0.7,
      evidence: area.evidence || [],
    }));
  }

  // Extrahera rekommendationer med confidence
  if (planInterventions?.output) {
    const interventions = planInterventions.output.interventions || [];
    insights.recommendations = interventions.map((int: any) => ({
      label: typeof int === "string" ? int : int.label || int,
      confidence: int.confidence || 0.7,
    }));
  }

  // Extrahera kommunikationsinsikter
  if (diagCommunication?.output) {
    insights.communication = {
      style: diagCommunication.output.style,
      issues: diagCommunication.output.issues || [],
      strengths: diagCommunication.output.strengths || [],
    };
  }

  // Extrahera mönster med confidence
  if (metaPatterns?.output) {
    const patterns = metaPatterns.output.patterns || [];
    insights.patterns = patterns.map((p: any) => ({
      label: typeof p === "string" ? p : p.label || p,
      confidence: p.confidence || 0.6,
    }));
  }

  // Extrahera riskflaggor med score
  const riskFlags: Array<{ type: string; score: number }> = [];
  if (safetyGate?.output?.emits?.safety === "RED") {
    riskFlags.push({ type: "safety_red", score: 1.0 });
  }
  if (riskAbuse?.output?.emits?.risk_detected) {
    riskFlags.push({ type: "abuse_risk", score: riskAbuse.output.emits.score || 0.8 });
  }
  if (riskCoercion?.output?.emits?.risk_detected) {
    riskFlags.push({ type: "coercion_risk", score: riskCoercion.output.emits.score || 0.8 });
  }
  if (riskSelfharm?.output?.emits?.risk_detected) {
    riskFlags.push({ type: "selfharm_risk", score: riskSelfharm.output.emits.score || 0.9 });
  }
  if (riskFlags.length > 0) {
    insights.riskFlags = riskFlags;
  }

  return insights;
}
