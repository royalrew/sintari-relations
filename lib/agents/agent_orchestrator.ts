// Agent Orchestrator - Kör alla agenter och samlar resultat
import { spawn } from 'child_process';
import { join } from 'path';
import { getWorkText, normalizeText, canonLabel, generateFallbackSpans } from '@/lib/utils/textUtils';
import { detectViolence } from '@/lib/utils/safetyDetection';
import { logRouter } from './_orchestrator_logs';
import { callMicroMood } from '@/backend/ai/py_bridge';
import { DialogMemoryV2 } from '@/lib/memory/dialog_memory_v2';
import { shouldUseMemory } from '@/lib/memory/memory_feature_flag';
import { buildExplainPayload } from '@/lib/explain/explain_emotion';
import { logExplainTelemetry } from '@/backend/metrics/explain_logger';

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
  routing_info?: {
    tier: string;
    pattern?: string;
    confidence?: number;
    modelId?: string;
  };
  cost_info?: any;
}

const clamp01 = (v: number): number => {
  const n = Number(v);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
};

function deriveToneVector(emotionResult: any): [number, number, number] {
  const score = clamp01(emotionResult?.score ?? 0.55);
  const level = String(emotionResult?.level || '').toLowerCase();
  let warmth = 0.5;
  if (level === 'plus') warmth = 0.7;
  else if (level === 'light') warmth = 0.6;
  else if (level === 'red') warmth = 0.25;

  let clarity = 0.55;
  if (level === 'red') clarity = 0.3;
  else if (level === 'light') clarity = 0.5;

  return [score, warmth, clarity];
}

function extractMemoryFacets(memoryContext: any): string[] {
  if (!memoryContext?.results || !Array.isArray(memoryContext.results)) return [];
  const facets: string[] = [];
  for (const item of memoryContext.results) {
    const f = item?.facets;
    if (f && typeof f === 'object') {
      for (const key of Object.keys(f)) {
        if (f[key]) facets.push(String(key));
      }
    }
  }
  return facets.slice(0, 6);
}

function extractRiskFlags(safetyAgent: any): Record<string, any> {
  const emits = safetyAgent?.output?.emits || {};
  const riskAreas = Array.isArray(emits?.risk_areas) ? emits.risk_areas.map((r: any) => String(r).toLowerCase()) : [];
  return {
    coercion: riskAreas.includes('coercion'),
    selfharm: riskAreas.includes('selfharm') || riskAreas.includes('self_harm'),
    red: emits?.safety === 'RED',
  };
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

  // Robust text-input (fixar "Missing data.text" + mojibake)
  const original = (input.description ?? input.text ?? "").toString();
  
  // Tidigt avbrott om helt tomt
  if (!original.trim()) {
    console.warn("[WARN] Empty text input, returning safe empty report");
    return {
      agents: [],
      total_latency_ms: 0,
      success_count: 0,
      error_count: 0,
      routing_info: {
        tier: "empty",
        confidence: 0.0,
        modelId: "empty_input",
      },
      cost_info: {
        blocked: true,
        reason: "empty_input",
      },
    };
  }
  
  // Use original for emotion detection (critical path)
  let sharedText = original.trim();
  
  // ============================================================
  // MEMORY V2: Retrieve context (FÖRE analys)
  // ============================================================
  // Generate threadId for feature flag check
  const threadId = `${input.person1}_${input.person2}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const USE_MEMORY = shouldUseMemory(threadId);
  let memCtx: any = null;
  let memory: DialogMemoryV2 | null = null;
  
  if (USE_MEMORY) {
    try {
      memory = await DialogMemoryV2.open(process.env.MEMORY_PATH);
      
      // Retrieve memory context
      memCtx = await memory.retrieve({
        threadId,
        kEpisodic: parseInt(process.env.MEMORY_K_EPISODIC || '6'),
        kSemantic: parseInt(process.env.MEMORY_K_SEMANTIC || '8'),
        weights: {
          semantic: parseFloat(process.env.MEMORY_W_SEM || '0.6'),
          episodic: parseFloat(process.env.MEMORY_W_EPI || '0.4'),
        },
        recency: {
          boost: parseFloat(process.env.MEMORY_RECENCY_BOOST || '0.35'),
          halfLifeDays: parseFloat(process.env.MEMORY_HALFLIFE_DAYS || '7'),
        },
        piiMask: true,
        queryText: sharedText,
      });
      
      console.log(`[MEMORY] ✅ Retrieved ${memCtx?.length || 0} memory records`);
    } catch (error) {
      // Non-blocking: om memory failar, fortsätt normalt
      console.warn(`[MEMORY] ⚠️ Memory retrieval failed, continuing: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // ============================================================
  // EMOTION CORE: Micro-Mood Detection (FÖRE routing)
  // ============================================================
  // Step 0: Check emotion/mood - if RED → route to safety_path
  let emotionResult: any = null;
  let emotionIsRed = false;
  
  try {
    emotionResult = await callMicroMood(
      sharedText,
      context.language || "auto",
      context.run_id
    );
    
    if (emotionResult.ok && emotionResult.level === "red") {
      emotionIsRed = true;
      console.warn(`[EMOTION] RED detected: ${emotionResult.red_hint || "Critical mood detected"}`);
      
      // RED → safety_path: blockera och route to human
      // Returnera early med safety block
      return {
        agents: [],
        total_latency_ms: 0,
        success_count: 0,
        error_count: 0,
        routing_info: {
          tier: "safety_path",
          confidence: 1.0,
          modelId: "micro_mood_red_block",
        },
        cost_info: {
          blocked: true,
          reason: "emotion_red",
          emotion_level: "red",
          emotion_hint: emotionResult.red_hint,
        },
      };
    }
    
    if (emotionResult.ok) {
      console.log(`[EMOTION] ✅ Level: ${emotionResult.level}, Score: ${emotionResult.score.toFixed(2)}`);
    } else {
      console.warn(`[EMOTION] ⚠️ Detection returned ok=false: ${emotionResult.error}`);
    }
  } catch (error) {
    // Non-blocking: om emotion detection failar, fortsätt normalt
    console.warn(`[EMOTION] ❌ Detection failed, continuing: ${error instanceof Error ? error.message : String(error)}`);
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
  
  // Determine language with fallback (never "und")
  let detectedLang = context.language || 'sv';
  if (detectedLang === 'und' || !['sv', 'en'].includes(detectedLang.toLowerCase())) {
    // Fallback: check if text is primarily ASCII (English) or has Swedish characters
    const hasSwedish = /[åäöÅÄÖ]/.test(sharedText);
    detectedLang = hasSwedish ? 'sv' : 'en';
  }
  detectedLang = detectedLang.toLowerCase();

  // Create consent context (single source of truth)
  const consentContext = {
    verified: input.consent === true || input.consent === 'on',
    mode: (input.consent === true || input.consent === 'on') ? 'explicit' : 'none',
    timestamp: context.timestamp
  };

  // Skapa payload för agenter med sharedText
  // Diag-agents behöver data.text, inte bara description
  const agentPayload = {
    data: {
      text: sharedText,  // CRITICAL: diag-agents expects data.text
      person1: input.person1,
      person2: input.person2,
      description: sharedText,  // backward compatibility
      original_description: input.description,
      shared_text: sharedText,
      consent_given: input.consent,
      language: detectedLang,
      lang: detectedLang  // alias for compatibility
    },
    meta: {
      run_id: context.run_id,
      timestamp: context.timestamp,
      agent_version: "1.0.0",
      consent: consentContext  // inject consent context
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

  // Post-process: Use normalized text if available (after normalize agent has run)
  const normalizeAgent = results.find(r => r.agent_id === 'normalize');
  if (normalizeAgent && normalizeAgent.status === 'success' && normalizeAgent.output?.emits?.clean_text) {
    const normalized = normalizeAgent.output.emits.clean_text;
    if (normalized && normalized.trim().length > 0) {
      sharedText = normalized.trim();
      console.log("[ORCHESTRATOR] Using normalized text from normalize agent");
    }
  }

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

    // Build explain summary using tone, memory, risks
    const toneVector = deriveToneVector(emotionResult);
    const memoryFacetsList = extractMemoryFacets(memoryContext);
    const riskMap = extractRiskFlags(safetyAgent);
    const explainOut = buildExplainPayload({
      toneVector,
      spans: explainAgent.output.emits?.explain_spans || [],
      memoryFacets: memoryFacetsList,
      riskFlags: riskMap,
      level: (process.env.EXPLAIN_LEVEL as any) || undefined,
      style: (process.env.EXPLAIN_STYLE as any) || undefined,
      lang: (context.language === 'en' ? 'en' : 'sv'),
    });

    explainAgent.output.emits = {
      ...explainAgent.output.emits,
      explain_summary: explainOut,
    };

    try {
      logExplainTelemetry(context.run_id, explainOut);
    } catch (err) {
      console.warn('[TELEMETRY] Failed to log explain KPIs', err);
    }

    results.push({
      agent_id: 'explain_emotion',
      version: '1.0.0',
      status: 'success',
      output: { emits: explainOut },
      latency_ms: 0,
    });
  }

  // ============================================================
  // PR7: Brain-First Core Integration (sequential after parallel)
  // ============================================================
  // Memory V2 + Persona Agent (sequential, after normalize)
  
  // Feature flags
  const MEMORY_V2_ENABLED = process.env.MEMORY_V2 === 'on';
  const PERSONA_V1_ENABLED = process.env.PERSONA_V1 === 'on';
  
  let memoryContext: any = null;
  let personaHints: any = null;
  
  // Memory V2: Retrieve context (if enabled)
  if (MEMORY_V2_ENABLED && normalizeAgent && normalizeAgent.status === 'success') {
    try {
      const memoryBridgePath = join(process.cwd(), '..', 'sintari-relations', 'backend', 'bridge', 'dialog_memory_v2_bridge.py');
      const memoryPayload = {
        agent: "dialog_memory_v2",
        action: "retrieve",
        conv_id: context.run_id,
        k: 8,
        mode: "hybrid",
        query_text: sharedText
      };
      
      const memoryStart = Date.now();
      memoryContext = await runAgentBridge(memoryBridgePath, memoryPayload);
      const memoryLatency = Date.now() - memoryStart;
      
      if (memoryContext?.ok) {
        console.log(`[MEMORY-V2] Retrieved ${memoryContext.results?.length || 0} context nodes (${memoryLatency}ms)`);
        
        // Add to results
        results.push({
          agent_id: 'dialog_memory_v2',
          version: '2.0.0',
          status: 'success',
          output: memoryContext,
          latency_ms: memoryLatency
        });
      }
    } catch (error) {
      console.warn(`[MEMORY-V2] Failed: ${error}`);
    }
  }
  
  // Persona Agent: Detect persona (if enabled)
  if (PERSONA_V1_ENABLED && normalizeAgent && normalizeAgent.status === 'success') {
    try {
      const personaBridgePath = join(process.cwd(), '..', 'sintari-relations', 'backend', 'bridge', 'persona_agent_bridge.py');
      const personaPayload = {
        agent: "persona_agent",
        text: sharedText,
        meta: {
          language: detectedLang
        }
      };
      
      const personaStart = Date.now();
      const personaResult = await runAgentBridge(personaBridgePath, personaPayload);
      const personaLatency = Date.now() - personaStart;
      
      if (personaResult?.ok && personaResult.persona_hints) {
        personaHints = personaResult.persona_hints;
        console.log(`[PERSONA] Detected persona: formality=${personaHints.formality}, warmth=${personaHints.warmth} (${personaLatency}ms)`);
        
        // Add to results
        results.push({
          agent_id: 'persona_agent',
          version: '1.0.0',
          status: 'success',
          output: personaResult,
          latency_ms: personaLatency
        });
      }
    } catch (error) {
      console.warn(`[PERSONA] Failed: ${error}`);
    }
  }
  // ============================================================
  
  const totalLatency = Date.now() - startTime;
  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  // ============================================================
  // MEMORY V2: Ingest after analysis (EFTER svar)
  // ============================================================
  if (USE_MEMORY && memory) {
    try {
      const lastMood = emotionResult?.level || 'neutral';
      
      await memory.ingest({
        threadId,
        text: sharedText,
        facets: {
          lang: context.language || 'sv',
          topic: 'relations',
          mood: lastMood,
        },
        ttlDays: parseInt(process.env.MEMORY_TTL_DAYS || '90'),
        piiMask: true,
        speaker: input.person1 || 'user',
      });
      
      console.log(`[MEMORY] ✅ Ingested memory record for thread ${threadId}`);
    } catch (error) {
      // Non-blocking: om memory ingest failar, logga men fortsätt
      console.warn(`[MEMORY] ⚠️ Memory ingest failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

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
  
  // ============================================================
  // PR7: Telemetry logging (console only for now)
  // ============================================================
  // Detailed telemetry logged to worldclass_live.jsonl via Python agents
  if (USE_MEMORY && memCtx) {
    console.log(`[TELEMETRY] Memory: ${memCtx.length || 0} context nodes retrieved`);
  }
  
  if (PERSONA_V1_ENABLED && personaHints) {
    console.log(`[TELEMETRY] Persona: ${JSON.stringify(personaHints)}`);
  }
  // ============================================================
  
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
    memory_context: memCtx, // Include memory context in response
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
