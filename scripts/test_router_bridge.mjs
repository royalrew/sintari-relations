#!/usr/bin/env node
/**
 * Minimal sanity-test för router_bridge
 * 
 * Testar att router_bridge faktiskt returnerar fastpath för triviala inputs.
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

const ROOT = process.cwd();

// Simulera router_bridge anrop (som batch-runner gör)
async function runRouter(payload) {
  const routerBridgePath = join(ROOT, 'backend', 'ai', 'router_bridge.py');
  const env = { ...process.env, ROUTER_EPS_TOP: '0.04' };
  
  return new Promise((resolve, reject) => {
    const python = spawn('python', [routerBridgePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: ROOT,
      env: env,
    });
    
    let stdout = '';
    let stderr = '';
    
    python.stdout.on('data', (data) => stdout += data.toString());
    python.stderr.on('data', (data) => stderr += data.toString());
    
    python.stdin.write(JSON.stringify(payload));
    python.stdin.end();
    
    python.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}\nStdout: ${stdout}`));
        }
      } else {
        reject(new Error(`Process failed (code ${code}): ${stderr}`));
      }
    });
  });
}

// Test cases
const samples = [
  { text: "Hej!", lang: "sv", description: "Hej!" },
  { text: "Ok 👍", lang: "sv", description: "Ok 👍" },
  { text: "God morgon 🙂", lang: "sv", description: "God morgon 🙂" },
];

async function main() {
  console.log('🧪 Testing router_bridge with trivial inputs...\n');
  
  for (const sample of samples) {
    try {
      const payload = {
        text: sample.text,
        lang: sample.lang,
        run_id: `test-${Date.now()}`,
        budget_per_run: 0.20,
        weekly_budget: 150.0,
      };
      
      const res = await runRouter(payload);
      
      const tier = res.tier || res.routing?.tier || 'unknown';
      const fastPathUsed = tier === 'fastpath' || res.should_use_fastpath || res.fastpath?.qualifies || false;
      
      console.log(`"${sample.description}" → tier=${tier}, fastPathUsed=${fastPathUsed}`);
      
      if (fastPathUsed) {
        console.log(`  ✅ FastPath match: ${res.fastpath?.pattern || 'unknown pattern'}\n`);
      } else {
        console.log(`  ❌ FastPath miss! Routing: ${JSON.stringify(res.routing || {}, null, 2)}\n`);
      }
    } catch (error) {
      console.error(`  ❌ Error testing "${sample.description}":`, error.message);
      console.error(`  ${error.stack || ''}\n`);
    }
  }
}

main().catch(console.error);

