/**
 * Orchestrator logging utilities for shadow-logging (Fas 2 production test)
 * 
 * Logs routing decisions, costs, and metrics without affecting UX.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

interface RouterLog {
  run_id: string;
  timestamp: string;
  tier: 'fastpath' | 'base' | 'mid' | 'top';
  model?: string;
  fastpath_used: boolean;
  fastpath_pattern?: string;
  estimated_cost_usd: number;
  actual_cost_usd?: number;
  routing_confidence?: number;
  routing_reason?: string;
  text_length: number;
  language: string;
}

const LOG_DIR = join(process.cwd(), 'runs', 'shadow_logs');
const LOG_FILE = join(LOG_DIR, 'router_logs.jsonl');

/**
 * Log router decision for shadow-analysis
 */
export async function logRouter(
  runId: string,
  data: {
    tier: string;
    modelId?: string;
    fastPathUsed: boolean;
    fastPathPattern?: string;
    estUsd: number;
    routing?: {
      confidence?: number;
      reason?: string;
    };
    textLength?: number;
    language?: string;
  }
): Promise<void> {
  try {
    await mkdir(LOG_DIR, { recursive: true });
    
    const logEntry: RouterLog = {
      run_id: runId,
      timestamp: new Date().toISOString(),
      tier: data.tier as any,
      model: data.modelId,
      fastpath_used: data.fastPathUsed,
      fastpath_pattern: data.fastPathPattern,
      estimated_cost_usd: data.estUsd,
      routing_confidence: data.routing?.confidence,
      routing_reason: data.routing?.reason,
      text_length: data.textLength || 0,
      language: data.language || 'sv',
    };
    
    // Append to JSONL file
    await writeFile(LOG_FILE, JSON.stringify(logEntry) + '\n', { flag: 'a' });
  } catch (error) {
    // Silent fail - don't break production
    console.warn('[LOG] Failed to log router decision:', error);
  }
}

/**
 * Get router statistics from shadow logs
 */
export async function getRouterStats(): Promise<{
  total: number;
  fastpath: number;
  base: number;
  mid: number;
  top: number;
  total_cost_usd: number;
  distribution: {
    fastpath_pct: number;
    base_pct: number;
    mid_pct: number;
    top_pct: number;
  };
}> {
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(LOG_FILE, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.trim());
    const logs: RouterLog[] = lines.map(l => JSON.parse(l));
    
    const counts = { fastpath: 0, base: 0, mid: 0, top: 0 };
    let totalCost = 0;
    
    for (const log of logs) {
      counts[log.tier]++;
      totalCost += log.estimated_cost_usd;
    }
    
    const total = logs.length;
    const routed = counts.base + counts.mid + counts.top;
    
    return {
      total,
      fastpath: counts.fastpath,
      base: counts.base,
      mid: counts.mid,
      top: counts.top,
      total_cost_usd: totalCost,
      distribution: {
        fastpath_pct: total > 0 ? (counts.fastpath / total) * 100 : 0,
        base_pct: routed > 0 ? (counts.base / routed) * 100 : 0,
        mid_pct: routed > 0 ? (counts.mid / routed) * 100 : 0,
        top_pct: routed > 0 ? (counts.top / routed) * 100 : 0,
      },
    };
  } catch (error) {
    return {
      total: 0,
      fastpath: 0,
      base: 0,
      mid: 0,
      top: 0,
      total_cost_usd: 0,
      distribution: { fastpath_pct: 0, base_pct: 0, mid_pct: 0, top_pct: 0 },
    };
  }
}

