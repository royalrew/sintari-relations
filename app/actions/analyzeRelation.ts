"use server";

import { relationSchema } from "@/lib/schemas/relationSchema";
import { relationAgentV1, type RelationAgentOutput } from "@/lib/agents/relation_agent";
import { relationAgentAI, type RelationAgentAIOutput } from "@/lib/agents/relation_agent_ai";
import { runAllAgents, type AgentOrchestratorResult } from "@/lib/agents/agent_orchestrator";
import { calculateScore } from "@/lib/utils/calculateScore";
import { normalizeText, canonLabel } from "@/lib/utils/textUtils";
import { writeFile, mkdir, access, readFile } from "fs/promises";
import { join } from "path";
import { 
  newRunId, 
  hashInput, 
  descLength, 
  secondsInDayFromIso, 
  nowIso, 
  timeStage, 
  totalLatency,
  detectLanguage,
  calculateOverallStatus,
  estimateTokensAndCost
} from "@/lib/utils/telemetry";
import { extractSignals, type ExtractedSignals } from "@/lib/utils/signals";
import { finalizeSignals, validateSignals } from "@/lib/utils/metrics";
import { mapSafetyToStatus } from "@/lib/utils/safetyMapping";
import { toCsvRow, createCsvHeader } from "@/lib/utils/csv";
import { getSystemConfig } from "@/lib/utils/config";
import type { AnalysisReportV2 } from "@/lib/schemas/analysisReportSchema";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: "VALIDATION_ERROR" | "INTERNAL_ERROR"; issues?: Record<string, string[]> };

interface LogData {
  input: {
    person1: string;
    person2: string;
    description: string;
  };
  output: {
    reflections: string[];
    recommendation: string;
    safetyFlag: boolean;
    analysisMode?: "ai" | "fallback";
    confidence?: number;
  };
  signals: ExtractedSignals;
}

async function logAnalysisToCSV(data: LogData) {
  console.log("logAnalysisToCSV called with data:", { 
    person1: data.input.person1, 
    person2: data.input.person2,
    descriptionLength: data.input.description.length 
  });
  
  const timestamp = new Date().toISOString();
  const signals = data.signals;
  
  console.log("Using signals for CSV:", signals);
  
  // Ensure logs directory exists
  const logsDir = join(process.cwd(), "data", "logs");
  console.log("Logs directory:", logsDir);
  await mkdir(logsDir, { recursive: true });
  
  // Helper function to safely escape CSV values
  function csvEscape(value: string): string {
    const escaped = value.replace(/"/g, '""');
    return `"${escaped}"`;
  }
  
  // Helper function to format arrays as JSON strings
  function jsonArray(value: string[]): string {
    return csvEscape(JSON.stringify(value));
  }
  
  // Create enhanced CSV row using signals for consistency with v2 report
  const csvRow = [
    timestamp,
    csvEscape(data.input.person1),
    csvEscape(data.input.person2),
    csvEscape(data.input.description),
    // Use signals.safety_flag (NORMAL/CAUTION/RISK/DANGER) for consistency
    signals.safety_flag,
    csvEscape(data.output.recommendation),
    signals.pos_count,
    signals.neg_count,
    signals.risk_count,
    signals.repair_signals, // YES/NO/MAYBE
    signals.warmth, // YES/NO
    signals.net_score, // Enhanced calculation
    signals.has_apology, // YES/NO
    signals.has_plan, // YES/NO
    jsonArray(signals.risk_areas),
    jsonArray(data.output.reflections || []),
    data.input.description.length, // description_length for analysis
    (() => {
      const timeStr = timestamp.split('T')[1].split('Z')[0];
      const [hours, minutes, seconds] = timeStr.split(':').map(Number);
      return hours * 3600 + minutes * 60 + seconds;
    })(), // time_in_day_seconds
    data.output.analysisMode || "fallback", // analysis_mode
    data.output.confidence || 0.8 // confidence
  ].join(",");
  
  const csvPath = join(logsDir, "analysis_log.csv");
  
  // Check if file exists and has proper header
  let fileExists = false;
  let needsHeader = true;
  try {
    await access(csvPath);
    const fileContent = await readFile(csvPath, 'utf-8');
    const lines = fileContent.split('\n').filter(line => line.trim());
    
    // Check if first line is proper header
    if (lines.length > 0) {
      const firstLine = lines[0];
      const expectedHeader = createCsvHeader();
      
      if (firstLine === expectedHeader) {
        fileExists = true;
        needsHeader = false;
      } else {
        console.log("CSV header mismatch or corrupted, will recreate");
        fileExists = false;
        needsHeader = true;
      }
    }
  } catch {
    // File doesn't exist
  }
  
  const headerRow = createCsvHeader();
  
  console.log("CSV file exists:", fileExists);
  console.log("Needs header:", needsHeader);
  console.log("About to write CSV row:", csvRow);
  
  if (needsHeader) {
    // Create new file with header or recreate if corrupted
    const content = headerRow + "\n" + csvRow + "\n";
    console.log("Creating/recreating CSV file with header");
    await writeFile(csvPath, content, { flag: "w", encoding: "utf-8" });
  } else {
    // Just append the row (header already exists and is valid)
    console.log("Appending to existing CSV file");
    await writeFile(csvPath, csvRow + "\n", { flag: "a", encoding: "utf-8" });
  }
  
  console.log("Successfully wrote to CSV file:", csvPath);
}

// Canonical label mapper
function canon(label: string): string {
  if (!label) return "";
  const map: Record<string, string> = {
    kritik: "kritik", critic: "kritik", criticism: "kritik",
    försvar: "försvar", defense: "försvar",
    stonewalling: "stonewalling",
    gaslighting: "gaslighting",
    ansvar: "ansvar", repair: "repair", meta_repair: "meta_repair",
    kontroll: "kontroll", kontrollbeteende: "kontroll",
    distansering: "distansering", gränssättning: "gränssättning",
    assertivitet: "assertivitet", trauma_trigger: "trauma_trigger"
    // ... fyll på med alla diamondlabels om fler behövs
  };
  const t = label.trim().toLowerCase().replace(/-/g, "_");
  return map[t] || t;
}

export async function analyzeRelation(formData: FormData): Promise<Ok<{
  reflections: string[];
  recommendation: string;
  safetyFlag: boolean;
  analysisMode?: "ai" | "fallback";
  confidence?: number;
  evidence?: any[];
  explain_spans?: number[][];
  explain_spans_labeled?: {start:number,end:number,label:string}[];
  agent_results?: AgentOrchestratorResult;
}> | Err> {
  const payload = {
    person1: formData.get("person1"),
    person2: formData.get("person2"),
    description: formData.get("description"),
    consent: formData.get("consent"),
  };

  const parsed = relationSchema.safeParse(payload);
  if (!parsed.success) {
    const { fieldErrors } = parsed.error.flatten();
    return { ok: false, error: "VALIDATION_ERROR", issues: fieldErrors };
  }

  // Initialize telemetry for this run
  const runId = newRunId();
  const timestamp = nowIso();
  const latency: Record<string, number> = {};

  // Extract signals first for comprehensive analysis
  const rawSignals = await timeStage("extract_signals", async () => {
    return extractSignals(parsed.data.description);
  }, latency);
  
  // Apply automatic consistency rules
  const signals = finalizeSignals(rawSignals);

  // Run all agents in parallel
  const agentResults = await timeStage("agent_orchestration", async () => {
    return await runAllAgents({
      person1: parsed.data.person1,
      person2: parsed.data.person2,
      description: parsed.data.description,
      consent: parsed.data.consent === "on"
    }, {
      run_id: runId,
      timestamp,
      language: detectLanguage(parsed.data.description)
    });
  }, latency);

  // Try AI agent first, fallback to deterministic if it fails
  let out: RelationAgentAIOutput;
  try {
    out = await timeStage("llm_analysis", async () => {
      return await relationAgentAI(parsed.data);
    }, latency);
    console.log(`Analysis completed using ${out.analysisMode} mode with confidence ${out.confidence}`);
  } catch (error) {
    console.error("AI agent failed, using fallback:", error);
    const fallbackResult = await timeStage("fallback_analysis", async () => {
      return relationAgentV1(parsed.data);
    }, latency);
    out = {
      ...fallbackResult,
      analysisMode: "fallback",
      confidence: 0.8
    };
  }

  // Enhanced evidence/explain_spans generation
  const evidence = (out as any).evidence || [];
  
  // Convert evidence to explain_spans format
  const explain_spans = evidence.map((e: any) => {
    if (e.span && Array.isArray(e.span)) {
      return e.span; // Already in [start, end] format
    } else if (e.start !== undefined && e.end !== undefined) {
      return [e.start, e.end]; // Convert from {start, end} to [start, end]
    }
    return [0, 0]; // Fallback
  });
  
  const explain_spans_labeled = evidence.map((e: any) => ({
    start: e.start || (e.span ? e.span[0] : 0),
    end: e.end || (e.span ? e.span[1] : 0),
    label: canonLabel(e.flag || "kritik")
  }));

  // Store the comprehensive v2 report for potential use
  try {
    await timeStage("persist", async () => {
      // Log the analysis to CSV with enhanced data
      console.log("Attempting to log analysis to CSV...");
      await logAnalysisToCSV({
        input: {
          person1: parsed.data.person1,
          person2: parsed.data.person2,
          description: parsed.data.description,
        },
        output: {
          reflections: out.reflections,
          recommendation: out.recommendation,
          safetyFlag: out.safetyFlag,
          analysisMode: out.analysisMode,
          confidence: out.confidence,
        },
        signals // Include signals for consistent CSV logging
      });
    }, latency);
    console.log("Successfully logged analysis to CSV");
  } catch (error) {
    console.error("Failed to log analysis:", error);
    console.error("Error details:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    // Don't fail the request if logging fails
  }
  
  // Safety-first override: Om safety är RED, skriv över rekommendation
  let finalRecommendation = out.recommendation;
  let finalSafetyFlag = out.safetyFlag;
  
  if (agentResults && agentResults.agents) {
    const safetyAgent = agentResults.agents.find(agent => agent.agent_id === 'safety_gate');
    if (safetyAgent && safetyAgent.status === 'success' && safetyAgent.output?.emits?.safety === "RED") {
      finalSafetyFlag = true;
      finalRecommendation = "Sök omedelbar hjälp - fysiskt våld är aldrig okej. Vid akut fara, ring nödnumret i ditt land (i Sverige: 112). Kontakta en stödorganisation eller vänd dig till sjukvården för hjälp.";
    }
  }
  
  return { 
    ok: true, 
    data: { 
      ...out, 
      recommendation: finalRecommendation,
      safetyFlag: finalSafetyFlag,
      evidence, 
      explain_spans, 
      explain_spans_labeled, 
      agent_results: agentResults 
    } 
  };
}

export async function generateAnalysisReportV2(formData: FormData): Promise<Ok<AnalysisReportV2> | Err> {
  const payload = {
    person1: formData.get("person1"),
    person2: formData.get("person2"),
    description: formData.get("description"),
    consent: formData.get("consent"),
  };

  const parsed = relationSchema.safeParse(payload);
  if (!parsed.success) {
    const { fieldErrors } = parsed.error.flatten();
    return { ok: false, error: "VALIDATION_ERROR", issues: fieldErrors };
  }

  // Initialize telemetry for this run
  const runId = newRunId();
  const timestamp = nowIso();
  const latency: Record<string, number> = {};

  try {
    // Extract signals and run analysis with timing
    const rawSignals = await timeStage("extract_signals", async () => {
      return extractSignals(parsed.data.description);
    }, latency);

    // Apply automatic consistency rules
    const signals = finalizeSignals(rawSignals);

    // Run all agents in parallel
    const agentResults = await timeStage("agent_orchestration", async () => {
      return await runAllAgents({
        person1: parsed.data.person1,
        person2: parsed.data.person2,
        description: parsed.data.description,
        consent: parsed.data.consent === "on"
      }, {
        run_id: runId,
        timestamp,
        language: detectLanguage(parsed.data.description)
      });
    }, latency);
    
    // Validate signals consistency
    const validation = validateSignals(signals);
    if (!validation.isValid) {
      console.warn("Signal validation failed:", validation.errors);
    }

    let analysisResult: RelationAgentAIOutput;
    try {
      analysisResult = await timeStage("llm_analysis", async () => {
        return await relationAgentAI(parsed.data);
      }, latency);
    } catch (error) {
      console.error("AI agent failed, using fallback:", error);
      analysisResult = await timeStage<RelationAgentAIOutput>("fallback_analysis", async () => {
        const base = await relationAgentV1(parsed.data); // RelationAgentOutput
        const wrapped: RelationAgentAIOutput = {
          ...base,
          analysisMode: "fallback",
          confidence: 0.7,
        };
        return wrapped;
      }, latency);
    }

    // Calculate tokens and cost for metrics
    const inputText = `${parsed.data.person1} och ${parsed.data.person2}: ${parsed.data.description}`;
    const outputText = analysisResult.reflections.join(" ") + " " + analysisResult.recommendation;
    const tokenMetrics = estimateTokensAndCost(inputText, outputText, analysisResult.analysisMode === "ai" ? "gpt-3.5-turbo" : "deterministic-v1");

    // Use new mapping function for overall status
    const overallStatus = mapSafetyToStatus(signals.safety_flag);

    // Build comprehensive v2 report
    const report: AnalysisReportV2 = {
      run_id: runId,
      timestamp,
      order_id: undefined,
      session_id: undefined, // Could be set from cookies/headers 
      user_id: undefined, // Pseudonymized user ID
      locale: "sv-SE",
      timezone: "Europe/Stockholm",
      overall_status: overallStatus,
      input: {
        person1: parsed.data.person1,
        person2: parsed.data.person2,
        description: parsed.data.description,
        description_length: descLength(parsed.data.description),
        detected_language: detectLanguage(parsed.data.description),
        input_hash: hashInput(`${parsed.data.person1}|${parsed.data.person2}|${parsed.data.description}`),
      },
      analysis: {
        reflections: analysisResult.reflections,
        recommendation: (() => {
          // Safety-first override för V2 rapporten också
          if (agentResults && agentResults.agents) {
            const safetyAgent = agentResults.agents.find(agent => agent.agent_id === 'safety_gate');
            if (safetyAgent && safetyAgent.status === 'success' && safetyAgent.output?.emits?.safety === "RED") {
              return "Sök omedelbar hjälp - fysiskt våld är aldrig okej. Vid akut fara, ring nödnumret i ditt land (i Sverige: 112). Kontakta en stödorganisation eller vänd dig till sjukvården för hjälp.";
            }
          }
          return analysisResult.recommendation;
        })(),
        signals,
        agent_results: agentResults,
      },
      metadata: {
        analysis_mode: analysisResult.analysisMode,
        confidence: analysisResult.confidence,
        model: analysisResult.analysisMode === "ai" ? "gpt-3.5-turbo" : "deterministic-v1",
        temperature: analysisResult.analysisMode === "ai" ? 0.7 : undefined,
        system_version: getSystemConfig().system_version,
        analysis_pipeline: ["validate", "extract_signals", analysisResult.analysisMode === "ai" ? "llm_analysis" : "fallback_analysis", "persist"],
        ai_chain_version: getSystemConfig().ai_chain_version,
      },
      metrics: {
        time_in_day_seconds: secondsInDayFromIso(timestamp),
        latency_ms_total: totalLatency(latency),
        latency_ms_by_stage: latency,
        tokens_in: tokenMetrics.tokens_in,
        tokens_out: tokenMetrics.tokens_out,
        cost_estimate: tokenMetrics.cost_estimate,
      },
      consent: {
        given: parsed.data.consent === "on",
        scope: "analysis+pdf",
        timestamp,
      },
      payment: {
        provider: undefined,
        status: "not_required", // Could be set based on Stripe integration
        amount: 0,
        currency: "SEK",
        receipt_url: null,
      },
      error: null,
      experiment: {
        experiment_id: null,
        variant: null,
        feature_flags: ["analysis_v2", "enhanced_signals"],
      },
      callbacks: {
        email_sent: false,
        pdf_url: null,
        webhook_ok: false,
      },
      source: "web_form",
      context: {
        campaign: "launch_october",
        referrer: "sintari.se"
      },
      review: {
        score: null,
        reviewed_by: null,
        timestamp: null,
      },
      pdf: {
        filename: null,
        size_kb: null,
        generated_at: null,
      },
    };

    return { ok: true, data: report };
  } catch (error) {
    console.error("Failed to generate v2 report:", error);
    return { 
      ok: false, 
      error: "INTERNAL_ERROR",
      issues: { _form: ["Failed to generate comprehensive analysis report"] }
    };
  }
}

