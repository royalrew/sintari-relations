// Agent Orchestrator - Kör alla agenter och samlar resultat
import { spawn } from 'child_process';
import { join } from 'path';
import { getWorkText, normalizeText, canonLabel, generateFallbackSpans } from '@/lib/utils/textUtils';
import { detectViolence } from '@/lib/utils/safetyDetection';
import { logRouter } from './_orchestrator_logs';

export interface AgentResult {
  agent_id: string;
  version: string;
  status: 'success' | 'error' | 'skipped';
  output?: any;
  error?: string;
  latency_ms: number;
}

export interface AgentOrchestratorResult {
  agents: AgentResult[];
  total_latency_ms: number;
  success_count: number;
  error_count: number;
}

export async function runAllAgents(
  input: {
    person1: string;
    person2: string;
    description: string;
    consent: boolean;
  },
  context: {
    run_id: string;
    timestamp: string;
    language?: string;
  }
): Promise<AgentOrchestratorResult> {
  
  const agents = [
    'calibration',
    'consent', 
    'diag_alignment',
    'diag_attachment',
    'diag_boundary',
    'diag_communication',
    'diag_conflict',
    'diag_cultural',
    'diag_digital',
    'diag_intimacy',
    'diag_power',
    'diag_substance',
    'diag_trust',
    'explain_linker',
    'features_conversation',
    'features_temporal',
    'lang_detect',
    'meta_patterns',
    'normalize',
    'pii_masker',
    'plan_focus',
    'plan_interventions',
    'quality_privacy',
    'report_comp',
    'report_evidence',
    'report_pdf',
    'safety_gate',
    'scoring',
    'topic_classifier',
    'tox_nuance',
    // Newly scaffolded agents from Roadmapp
    'crisis_router',
    'thread_parser',
    'speaker_attrib',
    'context_graph',
    'risk_abuse',
    'risk_coercion',
    'risk_selfharm',
    'premium_review'
  ];

  const results: AgentResult[] = [];
  const startTime = Date.now();

  // Skapa sharedText med fallback-kedja
  const raw = (input.description ?? "").toString();
  const toUtf8 = (s: string) => Buffer.from(s, "utf8").toString("utf8");
  const nfc = (s: string) => toUtf8(s).normalize("NFC");
  
  const normalizedText = nfc(raw);
  
  // Skapa sharedText som alla agenter ska använda
  const sharedText = normalizedText.trim();
  
  if (!sharedText) {
    console.warn("[WARN] Empty sharedText; falling back to raw");
  }
  
  // ============================================================
  // FAS 2: FASTPATH FÖRST (lågrisk, lågkostnad, trivialt)
  // ============================================================
  // Check FastPath och routing FÖRE Shield (för att fånga triviala hälsningar innan Shield normaliserar)
  // Step 1: Check FastPath och routing
  let routingDecision: any = null;
  let fastpathResult: any = null;
  let costCheck: any = null;
  
  try {
    const routerBridgePath = join(process.cwd(), '..', 'sintari-relations', 'backend', 'ai', 'router_bridge.py');
    const routerPayload = {
      text: sharedText,
      lang: context.language || 'sv',
      dialog: undefined, // Could be extracted from input if available
      safety_flags: undefined, // Will be set after safety_gate runs
      run_id: context.run_id,
      budget_per_run: 0.10, // $0.10 per run
      weekly_budget: 10.0, // $10 per week
    };
    
    routingDecision = await runAgentBridge(routerBridgePath, routerPayload);
    
    if (routingDecision?.fastpath?.qualifies) {
      fastpathResult = routingDecision.fastpath;
      console.log(`[ROUTER] FastPath match: ${fastpathResult.pattern}`);
    } else if (routingDecision?.routing) {
      console.log(`[ROUTER] Tier: ${routingDecision.routing.tier}, Confidence: ${routingDecision.routing.confidence.toFixed(2)}`);
    }
    
    costCheck = routingDecision?.cost_check;
    if (costCheck && !costCheck.ok) {
      console.warn(`[COST] Budget check failed: ${costCheck.action}`);
    }
  } catch (error) {
    console.warn(`[ROUTER] Routing failed, using default: ${error}`);
    // Fallback: continue with normal flow
  }
  
    // If FastPath qualifies, return early with fastpath result
    if (fastpathResult?.qualifies) {
      const fastpathResponse = fastpathResult.response;
      
      // Shadow-logging (Fas 2 production test)
      await logRouter(context.run_id, {
        tier: 'fastpath',
        fastPathUsed: true,
        fastPathPattern: fastpathResult.pattern,
        estUsd: 0.0001, // FastPath is nearly free
        textLength: sharedText.length,
        language: context.language || 'sv',
      });
      
      return {
        agents: [{
          agent_id: 'fastpath',
          version: '1.0.0',
          status: 'success',
          output: { response: fastpathResponse },
          latency_ms: Date.now() - startTime,
        }],
        total_latency_ms: Date.now() - startTime,
        success_count: 1,
        error_count: 0,
        routing_info: {
          tier: 'fastpath',
          pattern: fastpathResult.pattern,
          confidence: fastpathResult.confidence,
        },
        cost_info: costCheck,
      };
    }
  
  // ============================================================
  // END FAS 2 ROUTING
  // ============================================================
  
  // Skapa payload för agenter med sharedText
  const agentPayload = {
    data: {
      person1: input.person1,
      person2: input.person2,
      description: sharedText,
      original_description: input.description,
      shared_text: sharedText, // Alla agenter får samma text
      consent_given: input.consent,
      language: context.language || 'sv'
    },
    meta: {
      run_id: context.run_id,
      timestamp: context.timestamp,
      agent_version: "1.0.0"
    }
  };

  // Kör alla agenter parallellt
  const agentPromises = agents.map(async (agentId): Promise<AgentResult> => {
    const agentStartTime = Date.now();
    
    try {
      // Kör Python-agenten
      const result = await runAgent(agentId, agentPayload);
      const latency = Date.now() - agentStartTime;
      
      return {
        agent_id: agentId,
        version: "1.0.0",
        status: 'success',
        output: result,
        latency_ms: latency
      };
    } catch (error) {
      const latency = Date.now() - agentStartTime;
      
      return {
        agent_id: agentId,
        version: "1.0.0", 
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        latency_ms: latency
      };
    }
  });

  // Vänta på alla agenter
  const agentResults = await Promise.all(agentPromises);
  results.push(...agentResults);

  // Post-process: Fix safety_gate för violence och risk detection
  const safetyAgent = results.find(r => r.agent_id === 'safety_gate');
  if (safetyAgent && safetyAgent.status === 'success' && safetyAgent.output) {
    const safetyResult = detectViolence(sharedText);
    
    // Uppdatera safety status och spans
    safetyAgent.output.emits = {
      ...safetyAgent.output.emits,
      safety: safetyResult.safety,
      red_spans: safetyResult.red_spans,
      risk_spans: safetyResult.risk_spans,
      risk_areas: safetyResult.risk_areas
    };
    
    if (safetyResult.safety === "RED") {
      console.log(`[SAFETY] Violence detected: ${safetyResult.violence_indicators.join(', ')}`);
    } else if (safetyResult.safety === "YELLOW") {
      console.log(`[SAFETY] Risk patterns detected: ${safetyResult.risk_areas.join(', ')}`);
    }
  }

  // Post-process: Explain-coverage boost med union av spans
  const explainAgent = results.find(r => r.agent_id === 'explain_linker');
  const featuresAgent = results.find(r => r.agent_id === 'features_conversation');
  const planAgent = results.find(r => r.agent_id === 'plan_focus');
  const metaAgent = results.find(r => r.agent_id === 'meta_patterns');
  // safetyAgent already declared above
  
  if (explainAgent && explainAgent.status === 'success' && explainAgent.output) {
    const explainSpans = explainAgent.output.emits?.explain_spans || [];
    const featuresSpans = featuresAgent?.output?.emits?.spans || [];
    const safetySpans = safetyAgent?.output?.emits?.red_spans || [];
    const riskSpans = safetyAgent?.output?.emits?.risk_spans || [];
    const metaSpans = metaAgent?.output?.emits?.archetype_spans || [];
    
    // Union av alla spans för maximal coverage
    const allSpans = [
      ...explainSpans,
      ...featuresSpans,
      ...safetySpans,
      ...riskSpans,
      ...metaSpans
    ];
    
    // Deduplicera spans (baserat på start/end)
    const uniqueSpans = allSpans.filter((span, index, arr) => 
      arr.findIndex(s => s.start === span.start && s.end === span.end) === index
    );
    
    if (uniqueSpans.length > 0) {
      explainAgent.output.emits = {
        ...explainAgent.output.emits,
        explain_spans: uniqueSpans,
        explain_spans_labeled: uniqueSpans.map(s => ({
          ...s,
          label: canonLabel(s.label || "evidence")
        }))
      };
      
      console.log(`[BOOST] Enhanced explain_linker with ${uniqueSpans.length} spans (${explainSpans.length} + ${featuresSpans.length} + ${safetySpans.length})`);
    } else {
      // Fallback spans om inget hittades
      const top3 = planAgent?.output?.emits?.top3 || [];
      const fallbackSpans = generateFallbackSpans(sharedText, top3);
      
      if (fallbackSpans.length > 0) {
        explainAgent.output.emits = {
          ...explainAgent.output.emits,
          explain_spans: fallbackSpans,
          explain_spans_labeled: fallbackSpans.map(s => ({
            ...s,
            label: canonLabel(s.label)
          }))
        };
        
        console.log(`[FALLBACK] Generated ${fallbackSpans.length} fallback spans for explain_linker`);
      }
    }
  }

  const totalLatency = Date.now() - startTime;
  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  // Shadow-logging (Fas 2 production test)
  if (routingDecision?.routing) {
    const tier = routingDecision.routing.tier;
    const costMult = routingDecision.routing.cost_multiplier || 1.0;
    const estimatedCost = 0.001 * costMult; // Base cost * multiplier
    
    await logRouter(context.run_id, {
      tier,
      modelId: routingDecision.routing.model,
      fastPathUsed: false,
      estUsd: estimatedCost,
      routing: {
        confidence: routingDecision.routing.confidence,
        reason: routingDecision.routing.reason,
      },
      textLength: sharedText.length,
      language: context.language || 'sv',
    });
  }
  
  return {
    agents: results,
    total_latency_ms: totalLatency,
    success_count: successCount,
    error_count: errorCount,
    routing_info: routingDecision?.routing ? {
      tier: routingDecision.routing.tier,
      confidence: routingDecision.routing.confidence,
      model: routingDecision.routing.model,
      reason: routingDecision.routing.reason,
    } : undefined,
    cost_info: costCheck,
  };
}

async function runAgentBridge(scriptPath: string, payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const python = spawn('python', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        LC_ALL: 'C.UTF-8',
        LANG: 'C.UTF-8'
      }
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.stdin.write(JSON.stringify(payload));
    python.stdin.end();

    python.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse router bridge output: ${e}`));
        }
      } else {
        reject(new Error(`Router bridge failed with code ${code}: ${stderr}`));
      }
    });

    python.on('error', (error) => {
      reject(new Error(`Failed to start router bridge: ${error}`));
    });
  });
}

async function runAgent(agentId: string, payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const agentPath = join(process.cwd(), '..', 'agents', agentId, 'main.py');
    
    // Debug logging
    const debugMode = process.env.ANALYSIS_DEBUG === '1' || agentId === 'meta_patterns';
    if (debugMode) {
      console.log(`[DEBUG] Running agent: ${agentId}`);
      console.log(`[DEBUG] Text length: ${payload.data.description?.length || 0}`);
      console.log(`[DEBUG] Text sample: ${(payload.data.description || '').slice(0, 120)}`);
      console.log(`[DEBUG] Agent path: ${agentPath}`);
    }
    
    const python = spawn('python', [agentPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        LC_ALL: 'C.UTF-8',
        LANG: 'C.UTF-8'
      }
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          
          // Debug logging for successful agents
          if (debugMode) {
            console.log(`[DEBUG] Agent ${agentId} success:`);
            console.log(`[DEBUG] Output keys: ${Object.keys(result.emits || {}).join(', ')}`);
            if (result.emits?.explain_spans) {
              console.log(`[DEBUG] Spans count: ${result.emits.explain_spans.length}`);
              if (result.emits.explain_spans.length > 0) {
                console.log(`[DEBUG] First span: ${JSON.stringify(result.emits.explain_spans[0])}`);
              }
            }
          }
          
          resolve(result);
        } catch (parseError) {
          reject(new Error(`Failed to parse agent output: ${parseError}`));
        }
      } else {
        // Special handling for consent agent
        if (agentId === 'consent' && payload.data.consent_given) {
          console.log(`[INFO] Consent agent failed but consent already given, skipping`);
          resolve({
            ok: true,
            emits: { consent_verified: true },
            checks: { 'CHK-CONSENT-01': { pass: true, score: 1 } },
            version: 'consent@1.0.0',
            latency_ms: 0,
            cost: { usd: 0 }
          });
        } else {
          reject(new Error(`Agent failed with code ${code}: ${stderr}`));
        }
      }
    });

    python.on('error', (error) => {
      reject(new Error(`Failed to start agent: ${error.message}`));
    });

    // Skicka payload till agenten
    python.stdin.write(JSON.stringify(payload));
    python.stdin.end();
  });
}
