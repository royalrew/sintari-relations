#!/usr/bin/env node
/**
 * Seed Emotion Data - Enkel version som anropar orchestrator direkt
 * 
 * Detta skapar analyser via runAllAgents, vilket automatiskt triggerar
 * micro_mood detection och loggar events.
 * 
 * Usage: node scripts/seed_emotion_data_simple.mjs [--n=300]
 */

import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Test cases (SV/EN mix)
const TEST_CASES = [
  // Neutral
  { person1: "P1", person2: "P2", description: "Hej, hur mår du?", lang: "sv" },
  { person1: "P1", person2: "P2", description: "Hi, how are you?", lang: "en" },
  
  // Light mood
  { person1: "P1", person2: "P2", description: "Jag känner mig trött idag", lang: "sv" },
  { person1: "P1", person2: "P2", description: "I feel tired today", lang: "en" },
  { person1: "P1", person2: "P2", description: "Jag är ledsen", lang: "sv" },
  { person1: "P1", person2: "P2", description: "I'm feeling down", lang: "en" },
  { person1: "P1", person2: "P2", description: "Jag mår inte bra", lang: "sv" },
  { person1: "P1", person2: "P2", description: "I'm not feeling well", lang: "en" },
  
  // Plus mood
  { person1: "P1", person2: "P2", description: "Jag känner mig hopplös, inget funkar längre", lang: "sv" },
  { person1: "P1", person2: "P2", description: "I feel hopeless, nothing works anymore", lang: "en" },
  { person1: "P1", person2: "P2", description: "Jag är ensam och isolerad", lang: "sv" },
  { person1: "P1", person2: "P2", description: "I'm alone and isolated", lang: "en" },
  
  // Relation cases
  { person1: "Anna", person2: "Erik", description: "Vi bråkar hela tiden om småsaker", lang: "sv" },
  { person1: "Anna", person2: "Erik", description: "We argue all the time about small things", lang: "en" },
  { person1: "Maria", person2: "Johan", description: "Min partner lyssnar inte på mig", lang: "sv" },
  { person1: "Maria", person2: "Johan", description: "My partner doesn't listen to me", lang: "en" },
  { person1: "Sara", person2: "Marcus", description: "Jag behöver hjälp att förstå mina känslor", lang: "sv" },
  { person1: "Sara", person2: "Marcus", description: "I need help understanding my feelings", lang: "en" },
];

// Expand test cases to reach target count
function expandCases(n) {
  const expanded = [];
  let i = 0;
  while (expanded.length < n) {
    const base = TEST_CASES[i % TEST_CASES.length];
    expanded.push({
      ...base,
      description: expanded.length < TEST_CASES.length 
        ? base.description 
        : `${base.description} (${Math.floor(expanded.length / TEST_CASES.length)})`,
    });
    i++;
  }
  return expanded.slice(0, n);
}

async function callOrchestrator(case_, index, total) {
  try {
    // Dynamic import av TypeScript-modul (kräver ts-node eller kompilerad kod)
    // För nu, använd direkt import om det fungerar
    const { runAllAgents } = await import("../lib/agents/agent_orchestrator.js");
    
    const result = await runAllAgents(
      {
        person1: case_.person1,
        person2: case_.person2,
        description: case_.description,
        consent: true,
      },
      {
        run_id: `seed_${Date.now()}_${index}`,
        timestamp: new Date().toISOString(),
        language: case_.lang,
      }
    );
    
    if (index % 50 === 0 || index === total - 1) {
      console.log(`  [${index + 1}/${total}] Processed: ${case_.description.substring(0, 40)}...`);
    }
    
    return { success: true, index };
  } catch (error) {
    console.error(`  [${index + 1}] Error:`, error.message);
    return { success: false, index, error };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const nArg = args.find(a => a.startsWith("--n="));
  const count = nArg ? parseInt(nArg.split("=")[1]) : 300;
  
  console.log(`🌱 Seeding ${count} emotion events via orchestrator...\n`);
  console.log(`⚠️  NOTE: This requires the orchestrator to work.`);
  console.log(`   Alternative: Use web UI at http://localhost:3000/analyze\n`);
  
  const cases = expandCases(count);
  const results = [];
  
  // Process in smaller batches to avoid overwhelming
  const batchSize = 5;
  for (let i = 0; i < cases.length; i += batchSize) {
    const batch = cases.slice(i, i + batchSize);
    const batchPromises = batch.map((case_, idx) => 
      callOrchestrator(case_, i + idx, cases.length)
    );
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  const successCount = results.filter(r => r.success).length;
  console.log(`\n✅ Completed: ${successCount}/${cases.length} successful`);
  console.log(`\n📊 Next steps:`);
  console.log(`   1. Check events: ls reports/emotion_events/*.jsonl`);
  console.log(`   2. Aggregate: node scripts/agg_emotion_events.mjs`);
  console.log(`   3. Check dashboard: http://localhost:3000/dashboard`);
}

main().catch(console.error);

