/**
 * Dialog Memory v2 - TypeScript Bridge
 * Fas 5B: Memory integration
 * 
 * Wrapper for Python DialogMemoryV2 agent via py_bridge
 */

import { spawn } from 'child_process';
import { join } from 'path';

export interface MemoryRecord {
  id: string;
  conv_id: string;
  turn: number;
  speaker: string;
  text: string;
  facets?: {
    lang?: string;
    topic?: string;
    mood?: string;
    [key: string]: any;
  };
  tstamp_iso?: string;
  kind?: 'episodic' | 'semantic';
  vector?: number[];
}

export interface RetrieveOptions {
  threadId: string;
  kEpisodic?: number;
  kSemantic?: number;
  k?: number;
  weights?: {
    semantic?: number;
    episodic?: number;
  };
  recency?: {
    boost?: number;
    halfLifeDays?: number;
  };
  piiMask?: boolean;
  queryText?: string;
}

export interface IngestOptions {
  threadId: string;
  text: string;
  facets?: {
    lang?: string;
    topic?: string;
    mood?: string;
    [key: string]: any;
  };
  ttlDays?: number;
  piiMask?: boolean;
  turn?: number;
  speaker?: string;
}

export class DialogMemoryV2 {
  private static instance: DialogMemoryV2 | null = null;
  private storagePath: string;

  constructor(storagePath?: string) {
    this.storagePath = storagePath || process.env.MEMORY_PATH || 'data/memory_v2';
  }

  static async open(storagePath?: string): Promise<DialogMemoryV2> {
    if (!DialogMemoryV2.instance) {
      DialogMemoryV2.instance = new DialogMemoryV2(storagePath);
    }
    return DialogMemoryV2.instance;
  }

  async retrieve(options: RetrieveOptions): Promise<MemoryRecord[]> {
    const {
      threadId,
      kEpisodic = parseInt(process.env.MEMORY_K_EPISODIC || '6'),
      kSemantic = parseInt(process.env.MEMORY_K_SEMANTIC || '8'),
      k = Math.max(kEpisodic, kSemantic),
      weights = {
        semantic: parseFloat(process.env.MEMORY_W_SEM || '0.6'),
        episodic: parseFloat(process.env.MEMORY_W_EPI || '0.4'),
      },
      recency = {
        boost: parseFloat(process.env.MEMORY_RECENCY_BOOST || '0.35'),
        halfLifeDays: parseFloat(process.env.MEMORY_HALFLIFE_DAYS || '7'),
      },
      piiMask = true,
      queryText,
    } = options;

    const bridgePath = join(process.cwd(), 'backend', 'bridge', 'dialog_memory_v2_bridge.py');
    
    return new Promise((resolve, reject) => {
      const request = JSON.stringify({
        agent: 'dialog_memory_v2',
        action: 'retrieve',
        conv_id: threadId,
        k,
        mode: 'hybrid',
        query_text: queryText || '',
        weights,
        recency,
        trace_id: `retrieve_${Date.now()}`,
      });

      const proc = spawn('python', [bridgePath], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8',
        },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf-8');
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf-8');
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Memory retrieve failed: ${stderr || 'Unknown error'}`));
          return;
        }

        try {
          const lines = stdout.trim().split('\n');
          const lastLine = lines[lines.length - 1];
          const response = JSON.parse(lastLine);

          if (!response.ok) {
            reject(new Error(response.error || 'Memory retrieve failed'));
            return;
          }

          resolve(response.results || []);
        } catch (e) {
          reject(new Error(`Failed to parse memory response: ${e instanceof Error ? e.message : String(e)}`));
        }
      });

      proc.on('error', (error) => {
        reject(new Error(`Failed to spawn memory bridge: ${error.message}`));
      });

      proc.stdin.write(request + '\n');
      proc.stdin.end();
    });
  }

  async ingest(options: IngestOptions): Promise<string> {
    const {
      threadId,
      text,
      facets = {},
      ttlDays = parseInt(process.env.MEMORY_TTL_DAYS || '90'),
      piiMask = true,
      turn,
      speaker = 'user',
    } = options;

    // PII mask if enabled
    let maskedText = text;
    if (piiMask) {
      try {
        // Call PII masker agent
        const piiMaskerPath = join(process.cwd(), 'agents', 'pii_masker', 'main.py');
        const piiRequest = JSON.stringify({
          agent: 'pii_masker',
          data: { text },
          meta: { strategy: 'full' },
        });

        const piiProc = spawn('python', [piiMaskerPath], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',
            PYTHONIOENCODING: 'utf-8',
          },
        });

        let piiStdout = '';
        piiProc.stdout.on('data', (chunk) => {
          piiStdout += chunk.toString('utf-8');
        });

        await new Promise<void>((resolve, reject) => {
          piiProc.on('close', (code) => {
            if (code === 0) {
              try {
                const lines = piiStdout.trim().split('\n');
                const lastLine = lines[lines.length - 1];
                const piiResponse = JSON.parse(lastLine);
                if (piiResponse.ok && piiResponse.emits?.masked_text) {
                  maskedText = piiResponse.emits.masked_text;
                }
              } catch (e) {
                // Fallback to original text if PII masking fails
                console.warn('[Memory] PII masking failed, using original text');
              }
            }
            resolve();
          });
          piiProc.on('error', reject);
          piiProc.stdin.write(piiRequest + '\n');
          piiProc.stdin.end();
        });
      } catch (e) {
        console.warn('[Memory] PII masking error, using original text:', e);
      }
    }

    const bridgePath = join(process.cwd(), 'backend', 'bridge', 'dialog_memory_v2_bridge.py');
    
    // Determine turn number
    const currentTurn = turn || Date.now(); // Use timestamp as fallback

    const record: MemoryRecord = {
      id: `${threadId}_turn_${currentTurn}`,
      conv_id: threadId,
      turn: currentTurn,
      speaker,
      text: maskedText,
      facets: {
        ...facets,
        lang: facets.lang || 'sv',
        topic: facets.topic || 'relations',
        mood: facets.mood,
      },
      tstamp_iso: new Date().toISOString(),
      kind: 'episodic',
    };

    return new Promise((resolve, reject) => {
      const request = JSON.stringify({
        agent: 'dialog_memory_v2',
        action: 'ingest',
        record,
        trace_id: `ingest_${Date.now()}`,
      });

      const proc = spawn('python', [bridgePath], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8',
        },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf-8');
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf-8');
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Memory ingest failed: ${stderr || 'Unknown error'}`));
          return;
        }

        try {
          const lines = stdout.trim().split('\n');
          const lastLine = lines[lines.length - 1];
          const response = JSON.parse(lastLine);

          if (!response.ok) {
            reject(new Error(response.error || 'Memory ingest failed'));
            return;
          }

          resolve(response.record_id || record.id);
        } catch (e) {
          reject(new Error(`Failed to parse memory response: ${e instanceof Error ? e.message : String(e)}`));
        }
      });

      proc.on('error', (error) => {
        reject(new Error(`Failed to spawn memory bridge: ${error.message}`));
      });

      proc.stdin.write(request + '\n');
      proc.stdin.end();
    });
  }
}

