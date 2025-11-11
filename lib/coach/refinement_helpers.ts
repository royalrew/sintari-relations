/**
 * Helper functions for coach pipeline refinement
 * - Persona agent integration
 * - Coach insights retrieval
 * - Calibration logging
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * Call persona agent via Python bridge
 */
export async function callPersonaAgent(
  text: string,
  language: string = 'sv'
): Promise<{ warmth?: number; formality?: number } | null> {
  if (process.env.PERSONA_V1 !== 'on') {
    return null;
  }

  try {
    // Hitta persona bridge script
    const candidates = [
      join(process.cwd(), 'backend', 'bridge', 'persona_agent_bridge.py'),
      join(process.cwd(), '..', 'sintari-relations', 'backend', 'bridge', 'persona_agent_bridge.py'),
      join(process.cwd(), 'sintari-relations', 'backend', 'bridge', 'persona_agent_bridge.py'),
    ];

    let bridgePath: string | null = null;
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        bridgePath = candidate;
        break;
      }
    }

    if (!bridgePath) {
      console.warn('[PERSONA] Bridge script not found, using defaults');
      return { warmth: 0.6, formality: 0.4 };
    }

    const payload = {
      agent: 'persona_agent',
      text,
      meta: {
        language,
      },
    };

    return new Promise((resolve) => {
      const python = spawn('python', [bridgePath!], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1',
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

      // Persona bridge använder JSONL-protokoll (en rad JSON)
      python.stdin.write(JSON.stringify(payload) + '\n');
      python.stdin.end();

      const timeout = setTimeout(() => {
        python.kill();
        console.warn('[PERSONA] Timeout, using defaults');
        resolve({ warmth: 0.6, formality: 0.4 });
      }, 1000); // 1s timeout

      python.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0 && stdout) {
          try {
            // Parse JSONL response (första raden)
            const lines = stdout.trim().split('\n');
            const result = JSON.parse(lines[0] || stdout.trim());
            if (result.ok && result.persona_hints) {
              resolve(result.persona_hints);
            } else {
              resolve({ warmth: 0.6, formality: 0.4 });
            }
          } catch (e) {
            console.warn('[PERSONA] Parse error, using defaults:', e);
            resolve({ warmth: 0.6, formality: 0.4 });
          }
        } else {
          console.warn('[PERSONA] Agent failed, using defaults');
          resolve({ warmth: 0.6, formality: 0.4 });
        }
      });

      python.on('error', (error) => {
        clearTimeout(timeout);
        console.warn('[PERSONA] Spawn error, using defaults:', error);
        resolve({ warmth: 0.6, formality: 0.4 });
      });
    });
  } catch (error) {
    console.warn('[PERSONA] Error calling persona agent:', error);
    return { warmth: 0.6, formality: 0.4 };
  }
}

/**
 * Get coach insights from analyze API or cache
 * Försöker hämta insights från cache först, annars returnerar tom objekt
 */
export async function getCoachInsights(
  threadId: string,
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<any> {
  // För nu returnerar vi tom objekt - insights kommer från bakgrundsanalys
  // som körs via /api/coach/analyze och skickas med som lastInsights
  // I framtiden kan vi implementera cache-lookup här
  return {
    goals: [],
    patterns: [],
    communication: null,
  };
}

/**
 * Log calibration metrics
 */
export async function logCalibration(
  threadId: string,
  metrics: {
    teacherScore?: number;
    empathy?: number;
    clarity?: number;
    latency_ms: number;
    intent?: string;
  }
): Promise<void> {
  if (process.env.CALIBRATION_ENABLED !== 'true') {
    return;
  }

  try {
    // Hitta calibration agent
    const candidates = [
      join(process.cwd(), 'agents', 'calibration', 'main.py'),
      join(process.cwd(), '..', 'agents', 'calibration', 'main.py'),
      join(process.cwd(), 'sintari-relations', 'agents', 'calibration', 'main.py'),
    ];

    let agentPath: string | null = null;
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        agentPath = candidate;
        break;
      }
    }

    if (!agentPath) {
      console.debug('[CALIBRATION] Agent not found, skipping');
      return;
    }

    const payload = {
      meta: {
        thread_id: threadId,
        timestamp: new Date().toISOString(),
        window_size: 20,
        threshold: 0.15,
      },
      data: {
        current_scores: {
          teacher_score: metrics.teacherScore || 0,
          empathy: metrics.empathy || 0,
          clarity: metrics.clarity || 0,
        },
        historical_scores: [], // Kan fyllas i från cache senare
        golden_tests: [],
      },
    };

    // Kör i bakgrunden, non-blocking
    const python = spawn('python', [agentPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
        LC_ALL: 'C.UTF-8',
        LANG: 'C.UTF-8',
      },
    });

    python.stdin.write(JSON.stringify(payload));
    python.stdin.end();

    // Non-blocking - ignorera output
    python.on('error', (error) => {
      console.debug('[CALIBRATION] Logging failed (non-blocking):', error);
    });

    python.on('close', () => {
      // Calibration logged
    });
  } catch (error) {
    // Non-blocking - ignorera fel
    console.debug('[CALIBRATION] Error (non-blocking):', error);
  }
}

