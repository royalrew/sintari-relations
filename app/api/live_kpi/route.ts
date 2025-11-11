import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'path';

/**
 * Live KPI Endpoint
 * PR10: Load & Drift Monitoring
 *
 * Reads latest 200 entries from worldclass_live.jsonl
 */
function readCanaryState() {
  try {
    const raw = readFileSync(join(process.cwd(), 'reports', 'si', 'canary_state.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function eligibleFromState(state: any) {
  const now = Math.floor(Date.now() / 1000);
  const percent = typeof state?.percent === 'number' ? state.percent : Number(state?.percent || 0);
  const passes = Number(state?.passes_in_row || 0);
  const fails = Number(state?.fails_in_row || 0);
  const lastActionTs = Number(state?.last_action_ts || 0);
  const age = now - lastActionTs;

  let reason = '';
  if (percent < 5) reason = 'canary < 5%';
  else if (passes < 2) reason = '< 2 raka PASS';
  else if (age < 24 * 60 * 60) reason = '< 24h sedan senaste ändring';
  else if (fails > 0) reason = 'nyligen FAIL';

  return {
    percent,
    passes_in_row: passes,
    fails_in_row: fails,
    last_action_ts: lastActionTs,
    age_sec: age,
    ok: reason === '',
    reason,
  };
}

export async function GET(_request: NextRequest) {
  try {
    const worldclassPath = join(process.cwd(), 'reports', 'worldclass_live.jsonl');

    // Read JSONL file
    let content = '';
    try {
      content = await readFile(worldclassPath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        const state = readCanaryState();
        const eligibility = eligibleFromState(state);
        return NextResponse.json({
          entries: [],
          count: 0,
          total: 0,
          canary: {
            percent: eligibility.percent,
            auto: process.env.SOFT_ROLLBACK !== '0',
            eligible: eligibility.ok,
            eligibility,
          },
        });
      }
      throw error;
    }

    // Parse JSONL
    const lines = content.trim().split('\n').filter(Boolean);
    const entries = [];

    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch (e) {
        // Skip malformed lines
        console.warn('[Live KPI] Skipping malformed line:', line.substring(0, 50));
      }
    }

    // Return latest 200
    const latest = entries.slice(-200);

    const state = readCanaryState();
    const eligibility = eligibleFromState(state);
    const percent = eligibility.percent;
    const auto = process.env.SOFT_ROLLBACK !== '0';

    const canaryEntries = latest.filter((entry) => entry?.cohort === 'canary');
    const avg = (selector: (entry: any) => number | undefined) => {
      const values = canaryEntries
        .map(selector)
        .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
      if (!values.length) return undefined;
      return values.reduce((a, b) => a + b, 0) / values.length;
    };

    const canarySummary = {
      percent,
      auto,
      eligible: eligibility.ok,
      eligibility,
      last_action_ts: eligibility.last_action_ts,
      kpi: {
        memory: { mrr: avg((entry) => entry?.kpi?.['memory.mrr']) },
        explain: { coverage: avg((entry) => entry?.kpi?.['explain.coverage']) },
        tone: { drift: avg((entry) => entry?.kpi?.['tone.drift']) },
      },
    };

    return NextResponse.json({
      entries: latest,
      count: latest.length,
      total: entries.length,
      canary: canarySummary,
    });
  } catch (error: any) {
    console.error('[Live KPI] Error:', error);
    return NextResponse.json(
      { error: 'Failed to read KPI data', message: error.message },
      { status: 500 }
    );
  }
}
