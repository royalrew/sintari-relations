/**
 * Safety Gate Layer - Pre-gate säkerhetskontroll för coach-chatten
 * Kör consent, safety_gate, risk_* och crisis_router parallellt
 * 
 * Returnerar:
 * - ok: true om säker, false om blockerad
 * - blocked: true om RED/crisis detekterad
 * - crisis_plan: krisplan om crisis_required
 * - safety_level: OK|WARN|RED
 */
import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

export interface SafetyCheckResult {
  ok: boolean;
  blocked: boolean;
  safety_level: 'OK' | 'WARN' | 'RED';
  crisis_required: boolean;
  crisis_plan?: any;
  consent_ok: boolean;
  risk_flags: {
    selfharm: 'HIGH' | 'MEDIUM' | 'LOW';
    abuse: 'HIGH' | 'MEDIUM' | 'LOW';
    coercion: 'HIGH' | 'MEDIUM' | 'LOW';
  };
  reason?: string;
  latency_ms: number;
}

/**
 * Kör säkerhetskontroll parallellt
 */
export async function safetyCheck(
  text: string,
  consent: boolean = true,
  jurisdiction: string = 'SE'
): Promise<SafetyCheckResult> {
  const startTime = Date.now();
  
  // FALLBACK: Direkt matchning av kritiska fraser innan agenter körs (för snabb blockering)
  const criticalPhrases = [
    /jag\s+vill\s+d[öo]/i,
    /ta\s+livet\s+av\s+mig/i,
    /sluta\s+leva/i,
    /sj[äa]lvmord/i,
    /d[öo]da\s+mig\s+sj[äa]lv/i,
    /ingen\s+anledning\s+att\s+leva/i,
    /i\s+want\s+to\s+die/i,
    /kill\s+myself/i,
    /suicide/i,
  ];
  
  const hasCriticalPhrase = criticalPhrases.some(pattern => pattern.test(text));
  
  // Kör alla säkerhetsagenter parallellt
  const [consentResult, safetyResult, selfharmResult, abuseResult, coercionResult] = await Promise.all([
    runConsentAgent(text, consent),
    runSafetyGateAgent(text),
    runRiskAgent('risk_selfharm', text),
    runRiskAgent('risk_abuse', text),
    runRiskAgent('risk_coercion', text),
  ]);
  
  // Samla risk-flaggorna
  const risk_flags = {
    selfharm: hasCriticalPhrase ? 'HIGH' : (selfharmResult?.emits?.selfharm_risk || selfharmResult?.emits?.risk_level || 'LOW'),
    abuse: abuseResult?.emits?.abuse_risk || abuseResult?.emits?.risk_level || 'LOW',
    coercion: coercionResult?.emits?.coercion_risk || coercionResult?.emits?.risk_level || 'LOW',
  };
  
  // Debug logging
  console.log('[SAFETY] Critical phrase detected:', hasCriticalPhrase);
  console.log('[SAFETY] Risk flags:', risk_flags);
  console.log('[SAFETY] Safety level:', safetyResult?.emits?.safety);
  
  // Bestäm högsta risknivå
  const safety_level = hasCriticalPhrase ? 'RED' : (safetyResult?.emits?.safety || 'OK');
  const hasHighRisk = 
    risk_flags.selfharm === 'HIGH' || 
    risk_flags.abuse === 'HIGH' || 
    risk_flags.coercion === 'HIGH' ||
    safety_level === 'RED';
  
  // Om någon risk är HIGH eller safety är RED → kör crisis_router
  let crisisResult: any = null;
  let crisis_required = false;
  let crisis_plan: any = null;
  
  if (hasHighRisk || safety_level === 'RED') {
    crisisResult = await runCrisisRouter(text, {
      safety_gate: { safety: safety_level },
      risk_selfharm: { selfharm_risk: risk_flags.selfharm },
      risk_abuse: { abuse_risk: risk_flags.abuse },
      risk_coercion: { coercion_risk: risk_flags.coercion },
    }, jurisdiction);
    
    crisis_required = crisisResult?.emits?.crisis_required || false;
    crisis_plan = crisisResult?.emits?.crisis_plan;
  }
  
  // Blockera om:
  // - Consent saknas
  // - Safety är RED
  // - Crisis krävs
  const blocked = 
    !consentResult?.ok || 
    safety_level === 'RED' || 
    crisis_required;
  
  const latency_ms = Date.now() - startTime;
  
  return {
    ok: !blocked,
    blocked,
    safety_level: safety_level as 'OK' | 'WARN' | 'RED',
    crisis_required,
    crisis_plan,
    consent_ok: consentResult?.ok || false,
    risk_flags,
    reason: blocked 
      ? (crisis_required ? 'Crisis detected' : safety_level === 'RED' ? 'Safety RED' : 'Consent missing')
      : undefined,
    latency_ms,
  };
}

/**
 * Kör consent-agent
 */
async function runConsentAgent(text: string, consent: boolean): Promise<any> {
  try {
    // Försök hitta agent i olika platser (prioritera sintari-relations/agents/)
    const candidates = [
      join(process.cwd(), 'agents', 'consent', 'main.py'),  // Om vi är i sintari-relations/
      join(process.cwd(), 'sintari-relations', 'agents', 'consent', 'main.py'),  // Om vi är i root
      join(process.cwd(), '..', 'agents', 'consent', 'main.py'),
    ];
    
    let agentPath = candidates.find(p => existsSync(p));
    
    if (!agentPath) {
      // Fallback: försök hitta var som helst
      agentPath = candidates[0];
      console.warn(`[SAFETY] Consent agent not found, using fallback: ${agentPath}`);
    }
    const payload = {
      intent: 'consent.verify',
      meta: {
        case_id: 'coach_chat',
        runner_id: 'coach',
        ts: new Date().toISOString(),
      },
      data: {
        consent_given: consent,
        subject_id: 'user',
        actor_id: 'coach',
        jurisdiction: 'SE',
        age: 18,
        terms_version: 'v1.0',
        consent_ts: new Date().toISOString(),
        channel: 'web_form',
        scope: ['full_analysis'],
        purpose: ['coach_chat'],
        retention_days: 90,
        nonce: Math.random().toString(36).substring(7),
      },
    };
    
    return await runPythonAgent(agentPath, payload);
  } catch (error) {
    console.warn('[SAFETY] Consent agent failed:', error);
    // Om consent redan är given, returnera OK
    return consent ? { ok: true, emits: { consent_verified: true } } : { ok: false };
  }
}

/**
 * Kör safety_gate-agent
 */
async function runSafetyGateAgent(text: string): Promise<any> {
  try {
    const candidates = [
      join(process.cwd(), 'agents', 'safety_gate', 'main.py'),
      join(process.cwd(), 'sintari-relations', 'agents', 'safety_gate', 'main.py'),
      join(process.cwd(), '..', 'agents', 'safety_gate', 'main.py'),
    ];
    
    const agentPath = candidates.find(p => existsSync(p)) || candidates[0];
    const payload = {
      meta: {
        mode: 'strict',
        enable_insults: true,
        treat_extortion_as_red: true,
      },
      data: {
        text: text,
      },
    };
    
    return await runPythonAgent(agentPath, payload);
  } catch (error) {
    console.warn('[SAFETY] Safety gate agent failed:', error);
    return { ok: true, emits: { safety: 'OK' } };
  }
}

/**
 * Kör risk-agent (selfharm/abuse/coercion)
 */
async function runRiskAgent(agentId: 'risk_selfharm' | 'risk_abuse' | 'risk_coercion', text: string): Promise<any> {
  try {
    const candidates = [
      join(process.cwd(), 'agents', agentId, 'main.py'),
      join(process.cwd(), 'sintari-relations', 'agents', agentId, 'main.py'),
      join(process.cwd(), '..', 'agents', agentId, 'main.py'),
    ];
    
    const agentPath = candidates.find(p => existsSync(p)) || candidates[0];
    const payload = {
      meta: {
        mode: 'strict',
      },
      data: {
        text: text,
      },
    };
    
    return await runPythonAgent(agentPath, payload);
  } catch (error) {
    console.warn(`[SAFETY] ${agentId} agent failed:`, error);
    return { ok: true, emits: { [`${agentId.replace('risk_', '')}_risk`]: 'LOW' } };
  }
}

/**
 * Kör crisis_router-agent
 */
async function runCrisisRouter(text: string, riskData: any, jurisdiction: string): Promise<any> {
  try {
    const candidates = [
      join(process.cwd(), 'agents', 'crisis_router', 'main.py'),
      join(process.cwd(), 'sintari-relations', 'agents', 'crisis_router', 'main.py'),
      join(process.cwd(), '..', 'agents', 'crisis_router', 'main.py'),
    ];
    
    const agentPath = candidates.find(p => existsSync(p)) || candidates[0];
    const payload = {
      meta: {
        jurisdiction: jurisdiction,
        language: 'sv',
      },
      data: {
        text: text,
        ...riskData,
      },
    };
    
    return await runPythonAgent(agentPath, payload);
  } catch (error) {
    console.warn('[SAFETY] Crisis router failed:', error);
    return { ok: true, emits: { crisis_required: false } };
  }
}

/**
 * Kör Python-agent generiskt
 */
function runPythonAgent(agentPath: string, payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const python = spawn('python', [agentPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        LC_ALL: 'C.UTF-8',
        LANG: 'C.UTF-8',
      },
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
          reject(new Error(`Failed to parse agent output: ${e}`));
        }
      } else {
        reject(new Error(`Agent failed with code ${code}: ${stderr}`));
      }
    });
    
    python.on('error', (error) => {
      reject(new Error(`Failed to start agent: ${error.message}`));
    });
  });
}

