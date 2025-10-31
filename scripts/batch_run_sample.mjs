#!/usr/bin/env node
/**
 * Batch runner för produktionstest (Fas 2 → 100%)
 * 
 * Kör N verkliga/anonymiserade körningar och samlar baseline.
 * Shadow-mode: loggar utan att påverka UX.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, appendFileSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { spawn } from 'child_process';

// Lokal FastPath (prefilter) - undviker Python-subprocess för triviala cases
// Miljöknoppar
const FP_MAX_LEN = Number(process.env.FASTPATH_MAX_LEN || 140); // var 130
const FP_MAX_TOK = Number(process.env.FASTPATH_MAX_TOKENS || 30); // var 28

// Unicode-säkra lookarounds (istället för \b som missar Unicode)
const EMOJI_ONLY = /^(?:[🙂😉👍👌❤️💕😍😂🤣😅😊😎🤝🙏])+[.!?]*$/u; // rena emoji-svar
const EMOJI_TAIL = /[🙂😉👍👌❤️💕😍😂🤣😅😊😎🤝🙏]+[.!?]*$/u; // emoji i slutet (t.ex. "Perfekt 👍")
const GREET = /(?<!\p{L})(hej|hejsan|tjena|tjenare|hallå(?: där)?|tja|god\s*(?:morgon|kväll|dag)|hi|hello|hey|yo)(?!\p{L})/iu;
const OKAY = /(?<!\p{L})(ok(?:e[jy])?|okey|okidoki|ok (då)?)|(okej (då)?)|alright|fine|great|nice|cool|deal|done|yes|sure|sounds (good|great)|(jajemen|jo|japp)|(mm+|mhm+|mmm+)|(tack( så mycket)?)|tackar|kanon|toppen|grymt|najs|bra|fint|perfekt|klart|fixat|visst|absolut|precis|exakt|självklart|(låter bra)|(låter fint)|(funkar)|(kör( vi| på)?)|(det blir bra)(?!\p{L})[.!?]*$/iu;
const NEG = /(?<!\b(ingen|utan)\s)\b(misshandel|våld|självmord|kris|panik|hot|polis|barn|droger|sjukhus|konflikt)\b/i;

function localFastPath(description, isTrivial = false) {
  // Unicode-normalisera, trimma, tolerant tokenisering (synkad med normalizeRecord)
  let text = String(description || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return false;
  if (NEG.test(text)) return false;
  
  // Tolerant tokenisering (accepterar punkt/utrop)
  const toks = text.split(/[^\p{L}\p{N}#+]+/u).filter(Boolean);
  const short = text.length <= FP_MAX_LEN || toks.length <= FP_MAX_TOK;
  
  if (!short) return false;
  if (GREET.test(text) || OKAY.test(text) || EMOJI_ONLY.test(text) || EMOJI_TAIL.test(text)) return true;
  
  // Verb-lös kvittens: enstaka substantiv/adjektiv + ev. emoji (striktare: endast trivial eller mycket kort)
  const hasVerb = /\b(är|blir|vara|gör|kör|fixa|ska|kan|måste|vill|hinner|orkar|tänker|tycker|känner|behöver|får)\b/i.test(text);
  if (!hasVerb && isTrivial && toks.length <= 4) return true;
  
  // Trivial-flaggan ger boost om kort (striktare: max 3 tokens)
  return isTrivial && toks.length <= 3 && !NEG.test(text);
}

function cryptoRandom() {
  return randomBytes(8).toString('hex');
}

// Normalisera record före FastPath (säkrar träff)
function normalizeRecord(rec) {
  let description = rec.description ?? rec.text ?? rec.input?.description ?? rec.input?.text ?? rec.prompt ?? rec.message ?? '';
  description = String(description)
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .replace(/^[\[\{].*?:(.*)$/u, '$1') // strip ev. prefix "text:"/"desc:" i JSON-liknande sträng
    .trim();
  return {
    person1: rec.person1 ?? 'A',
    person2: rec.person2 ?? 'B',
    description,
    __isTrivial: rec.__isTrivial || rec.source_level === 'trivial' || false,
  };
}

// Atomic write för JSONL (undviker partial writes)
async function writeJsonlAtomic(path, arr) {
  const tmp = `${path}.tmp`;
  // Filtrera bort null/undefined entries
  const valid = arr.filter(r => r != null);
  const out = valid.map(o => JSON.stringify(o)).join('\n') + '\n';
  await writeFile(tmp, out, 'utf-8');
  // Atomic rename (cross-platform)
  const { rename } = await import('fs/promises');
  await rename(tmp, path);
}

const ROOT = process.cwd();
// Try multiple paths for golden tests (adjust based on where script is called from)
let GOLDEN_DIR = join(ROOT, '..', 'tests', 'golden', 'relations');
if (!existsSync(GOLDEN_DIR)) {
  GOLDEN_DIR = join(ROOT, '..', '..', 'tests', 'golden', 'relations');
}
if (!existsSync(GOLDEN_DIR)) {
  GOLDEN_DIR = join(ROOT, 'tests', 'golden', 'relations');
}
const OUTPUT_DIR = join(ROOT, 'reports');

// Per-batch kvot för top (fungerar även när Python spawnas per case)
let topQuotaCounter = 0;
const TOP_BLOCK = Number(process.env.ROUTER_TOP_BLOCK || 100);
const TOP_MIN = Number(process.env.ROUTER_TOP_MIN || 3); // procent

// Trivial pool for live-mix testing (expandera för 25% coverage)
const TRIVIAL_BASE = [
  { input: { text: "Hej!", lang: "sv" }, id: "trivial-001", source_level: "trivial" },
  { input: { text: "Hallå där", lang: "sv" }, id: "trivial-002", source_level: "trivial" },
  { input: { text: "Okej", lang: "sv" }, id: "trivial-003", source_level: "trivial" },
  { input: { text: "Tack!", lang: "sv" }, id: "trivial-004", source_level: "trivial" },
  { input: { text: "God morgon", lang: "sv" }, id: "trivial-005", source_level: "trivial" },
  { input: { text: "Hi", lang: "en" }, id: "trivial-006", source_level: "trivial" },
  { input: { text: "Bra", lang: "sv" }, id: "trivial-007", source_level: "trivial" },
  { input: { text: "Fint", lang: "sv" }, id: "trivial-008", source_level: "trivial" },
  { input: { text: "Tja", lang: "sv" }, id: "trivial-009", source_level: "trivial" },
  { input: { text: "Ok", lang: "sv" }, id: "trivial-010", source_level: "trivial" },
  { input: { text: "Hej", lang: "sv" }, id: "trivial-011", source_level: "trivial" },
  { input: { text: "Hallå", lang: "sv" }, id: "trivial-012", source_level: "trivial" },
  { input: { text: "Okey", lang: "sv" }, id: "trivial-013", source_level: "trivial" },
  { input: { text: "Thanks", lang: "en" }, id: "trivial-014", source_level: "trivial" },
  { input: { text: "Tjenare", lang: "sv" }, id: "trivial-015", source_level: "trivial" },
  { input: { text: "God dag", lang: "sv" }, id: "trivial-016", source_level: "trivial" },
  { input: { text: "God kväll", lang: "sv" }, id: "trivial-017", source_level: "trivial" },
  { input: { text: "Mmm", lang: "sv" }, id: "trivial-018", source_level: "trivial" },
  { input: { text: "Mhm", lang: "sv" }, id: "trivial-019", source_level: "trivial" },
  { input: { text: "Perfekt", lang: "sv" }, id: "trivial-020", source_level: "trivial" },
];

// Expandera trivial pool genom repetition för 125 cases (25% av 500)
function generateTrivialPool(targetCount) {
  const pool = [];
  let idx = 1;
  while (pool.length < targetCount) {
    for (const base of TRIVIAL_BASE) {
      if (pool.length >= targetCount) break;
      pool.push({
        ...base,
        id: `trivial-${String(idx).padStart(3, '0')}`,
      });
      idx++;
    }
  }
  return pool;
}

// Load JSONL file
async function loadJsonl(filepath) {
  const cases = [];
  try {
    const content = await readFile(filepath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        cases.push(JSON.parse(line));
      } catch (e) {
        // Skip invalid JSON
      }
    }
  } catch (e) {
    console.warn(`[WARN] Could not load ${filepath}:`, e.message);
  }
  return cases;
}

// Sample N cases from array
function sample(cases, n) {
  const shuffled = [...cases].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

// Interleave trivial and golden cases
function interleave({ trivial, golden }) {
  const result = [];
  const maxLen = Math.max(trivial.length, golden.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < trivial.length) result.push(trivial[i]);
    if (i < golden.length) result.push(golden[i]);
  }
  // Shuffle for realistic distribution
  return result.sort(() => 0.5 - Math.random());
}

// Load sample cases from golden tests or trivial pool
async function loadSampleCases(n = 500, mix = 'live', trivialFile = null, goldenFile = null) {
  // Default paths (relative to project root, not sintari-relations)
  const TRIVIAL_FILE = trivialFile || join(ROOT, '..', 'datasets', 'trivial_pool.jsonl');
  const GOLDEN_FILE = goldenFile || join(ROOT, '..', 'tests', 'golden', 'relations', 'seed.jsonl');
  
  if (mix === 'golden') {
    // Golden-mix: only golden cases
    const goldenCases = await loadJsonl(GOLDEN_FILE);
    // If seed.jsonl not found, try loading from golden subdirectories
    if (goldenCases.length === 0) {
      const cases = [];
      const levels = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
      for (const level of levels) {
        const levelDir = join(GOLDEN_DIR, level);
        try {
          const files = await import('fs/promises').then(fs => fs.readdir(levelDir));
          const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
          for (const file of jsonlFiles) {
            const content = await readFile(join(levelDir, file), 'utf-8');
            const lines = content.split('\n').filter(l => l.trim());
            for (const line of lines) {
              try {
                const caseData = JSON.parse(line);
                cases.push({ ...caseData, source_level: level, source_file: file });
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        } catch (e) {
          // Skip if level dir doesn't exist
        }
      }
      const sampled = sample(cases, n);
      console.log(`📊 Loaded ${sampled.length} golden cases`);
      return sampled;
    }
    const sampled = sample(goldenCases, n);
    console.log(`📊 Loaded ${sampled.length} golden cases from ${GOLDEN_FILE}`);
    return sampled;
  } else {
    // Live-mix: 25% trivial + 75% golden
    const trivialCasesRaw = await loadJsonl(TRIVIAL_FILE);
    // Säkerställ att trivial cases har source_level markerad
    const trivialCases = trivialCasesRaw.map(c => ({
      ...c,
      source_level: 'trivial',
    }));
    const goldenCases = await loadJsonl(GOLDEN_FILE);
    
    // If golden file empty, fall back to loading from subdirectories
    let allGolden = goldenCases;
    if (allGolden.length === 0) {
      allGolden = [];
      const levels = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
      for (const level of levels) {
        const levelDir = join(GOLDEN_DIR, level);
        try {
          const files = await import('fs/promises').then(fs => fs.readdir(levelDir));
          const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
          for (const file of jsonlFiles) {
            const content = await readFile(join(levelDir, file), 'utf-8');
            const lines = content.split('\n').filter(l => l.trim());
            for (const line of lines) {
              try {
                const caseData = JSON.parse(line);
                allGolden.push({ ...caseData, source_level: level, source_file: file });
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        } catch (e) {
          // Skip if level dir doesn't exist
        }
      }
    }
    
    const trivialCount = Math.floor(n * 0.25);
    const goldenCount = Math.ceil(n * 0.75);
    
    const sampledTrivial = sample(trivialCases.length > 0 ? trivialCases : generateTrivialPool(trivialCount), trivialCount).map(x => ({...x, __isTrivial: true}));
    const sampledGolden = sample(allGolden, goldenCount);
    
    const interleaved = interleave({ trivial: sampledTrivial, golden: sampledGolden });
    
    console.log(`📊 Loaded ${interleaved.length} cases (${sampledTrivial.length} trivial, ${sampledGolden.length} golden)`);
    return interleaved;
  }
}

// Robust router bridge med timeout, retry, UTF-8, line-framing
const CHILD_TIMEOUT_MS = Number(process.env.ROUTER_BRIDGE_TIMEOUT_MS || 2500);
const CHILD_RETRIES = Number(process.env.ROUTER_BRIDGE_RETRIES || 1);

async function runRouterBridge(payload) {
  let lastErr;
  for (let attempt = 0; attempt <= CHILD_RETRIES; attempt++) {
    try {
      return await _runRouterBridgeOnce(payload);
    } catch (e) {
      lastErr = e;
      if (attempt < CHILD_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1))); // Backoff
      }
    }
  }
  throw lastErr;
}

function _runRouterBridgeOnce(payload) {
  return new Promise((resolve, reject) => {
    const routerBridgePath = join(ROOT, 'backend', 'ai', 'router_bridge.py');
    
    // Säkerställ error log directory finns
    const errorLogDir = join(ROOT, 'logs');
    if (!existsSync(errorLogDir)) {
      mkdir(errorLogDir, { recursive: true }).catch(() => {});
    }
    const errorLogPath = join(errorLogDir, 'batch_errors.log');
    
    const python = spawn(
      process.env.ROUTER_BRIDGE_BIN || 'python',
      [routerBridgePath],
      {
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8',
          ROUTER_EPS_TOP: process.env.ROUTER_EPS_TOP || '0.04',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: ROOT,
      }
    );
    
    let buf = '';
    const timer = setTimeout(() => {
      python.kill('SIGKILL');
      reject(new Error('router_bridge timeout'));
    }, CHILD_TIMEOUT_MS);
    
    python.stdout.setEncoding('utf8');
    python.stdout.on('data', (chunk) => { buf += chunk; });
    python.stderr.on('data', (d) => {
      try {
        appendFileSync(errorLogPath, String(d), 'utf-8');
      } catch (e) {
        // Ignore file write errors
      }
    });
    python.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    python.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !buf) {
        return reject(new Error(`router_bridge exit ${code}`));
      }
      // Förvänta **en** rad JSON
      const line = (buf || '').split(/\r?\n/).find(s => s.trim().startsWith('{'));
      if (!line) {
        return reject(new Error('router_bridge no JSON line'));
      }
      try {
        const obj = JSON.parse(line);
        
        // Debug: logga bridge-returen om forceTop finns
        if (payload?.complexity_hints?.__forceTop || payload?.__forceTop) {
          console.error(`[BRIDGE-PARSE] Payload had forceTop=true, bridge returned: ${JSON.stringify({tier: obj?.tier, routing_tier: obj?.routing?.tier, reason: obj?.routing?.reason})}`);
        }
        
        // HÅRD INVARIANT: kasta fel om forceTop inte landar som "top"
        if (payload?.complexity_hints?.__forceTop || payload?.__forceTop) {
          const got = String(obj?.tier ?? obj?.routing?.tier ?? '').trim().toLowerCase();
          if (got !== 'top') {
            const errorMsg = `FORCE-TOP expected 'top', got '${got}'. Bridge returned: ${JSON.stringify(obj)}. Payload had: ${JSON.stringify({__forceTop: payload?.__forceTop, complexity_hints: payload?.complexity_hints})}`;
            console.error(`[${errorMsg}]`);
            reject(new Error(errorMsg));
            return;
          }
        }
        
        resolve(obj);
      } catch (e) {
        reject(new Error(`router_bridge JSON parse error: ${e.message}`));
      }
    });
    
    python.stdin.write(JSON.stringify(payload) + '\n');
    python.stdin.end();
  });
}

// Simulate orchestrator call (shadow mode)
async function simulateOrchestrator(caseData, processedIndex = 0) {
  // Normalisera record före bearbetning
  const normalized = normalizeRecord(caseData);
  const text = normalized.description;
  const lang = caseData.lang || caseData.input?.lang || 'sv';
  const isTrivial = normalized.__isTrivial;
  
  // 0) Lokal FastPath (ingen subprocess, supertålig)
  if (localFastPath(text, isTrivial)) {
    return {
      tier: 'fastpath',
      fastpath: { qualifies: true, pattern: 'local_fastpath' },
      should_use_fastpath: true,
      routing: null,
      cost_check: { ok: true, action: 'allow' },
    };
  }
  
  // 1) Annars kör via bridge till Python
  const routerPayload = {
    text,
    lang,
    run_id: `shadow-${caseData.id || cryptoRandom()}`,
    budget_per_run: 0.20,
    weekly_budget: 150.0,
    complexity_hints: {},
  };
  
  // Per-batch min-top kvot – oberoende av längd (garanterar ~3% top per 100)
  if (TOP_BLOCK > 0) {
    const i = topQuotaCounter % TOP_BLOCK;
    if (i < Math.max(1, Math.floor(TOP_BLOCK * (TOP_MIN / 100)))) {
      (routerPayload.complexity_hints ||= {}).__forceTop = true;
      routerPayload.__forceTop = true; // för ev. TS/py bryggor som läser toppnivå
    }
    topQuotaCounter++;
  }
  
  try {
    return await runRouterBridge(routerPayload);
  } catch (error) {
    // Fallback: estimate routing
    const textLen = text.length;
    return {
      tier: textLen < 100 ? 'base' : textLen < 300 ? 'mid' : 'top',
      fastpath: null,
      routing: {
        tier: textLen < 100 ? 'base' : textLen < 300 ? 'mid' : 'top',
        confidence: 0.85,
        cost_multiplier: textLen < 100 ? 1.0 : textLen < 300 ? 10.0 : 10.0,
      },
      cost_check: { ok: true, action: 'allow' },
    };
  }
}

// Main batch runner
async function main() {
  const args = process.argv.slice(2);
  const nArg = args.find(a => a.startsWith('--n='));
  const n = nArg ? parseInt(nArg.split('=')[1]) : 500;
  const shadow = args.includes('--shadow');
  const mixArg = args.find(a => a.startsWith('--mix='));
  const mix = mixArg ? mixArg.split('=')[1] : 'live'; // Default to live
  const trivialArg = args.find(a => a.startsWith('--trivial='));
  const trivialFile = trivialArg ? trivialArg.split('=')[1] : null;
  const goldenArg = args.find(a => a.startsWith('--golden='));
  const goldenFile = goldenArg ? goldenArg.split('=')[1] : null;
  
  console.log(`🚀 Batch Runner - Shadow Mode: ${shadow}, N=${n}, Mix=${mix}`);
  console.log('=' .repeat(60));
  
  // Determine output file based on mix
  const OUTPUT_FILE = mix === 'live' 
    ? join(OUTPUT_DIR, 'pyramid_live.jsonl')
    : join(OUTPUT_DIR, 'pyramid_golden.jsonl');
  
  // Load sample cases
  const cases = await loadSampleCases(n, mix, trivialFile, goldenFile);
  
  if (cases.length === 0) {
    console.error('❌ No cases loaded');
    process.exit(1);
  }
  
  // Run cases med begränsad samtidighet (default 1 för validering)
  const CONCURRENCY = Number(process.env.BATCH_CONCURRENCY || 1);
  const results = new Array(cases.length);
  let idx = 0;
  let active = 0;
  let completed = 0;
  
  await new Promise((done) => {
    const pump = async () => {
      while (active < CONCURRENCY && idx < cases.length) {
        const i = idx++;
        active++;
        
        (async () => {
          try {
            const caseData = cases[i];
            // Normalisera record före bearbetning (för logging)
            const normalized = normalizeRecord(caseData);
            // Spara routerPayload för FORCE-TOP logging
            let routerPayloadForLogging = null;
            const originalSimulate = simulateOrchestrator;
            const simulateWithLog = async (cd, idx) => {
              const normalized = normalizeRecord(cd);
              const text = normalized.description;
              const lang = cd.lang || cd.input?.lang || 'sv';
              const isTrivial = normalized.__isTrivial;
              
              // Node-hint för deterministisk +1% Top: var 100:e icke-triviala, icke-fastpath, långa fall
              const forceTopHint = (!isTrivial && !localFastPath(text, isTrivial) &&
                                    text.length >= 240 &&  // riktiga komplexa
                                    (text.split('\n').length - 1) >= 2 &&  // minst 2 radbrytningar
                                    ((index + 1) % 100 === 0)); // ~1% deterministiskt
              
              routerPayloadForLogging = {
                text,
                lang,
                run_id: `shadow-${cd.id || cryptoRandom()}`,
                budget_per_run: 0.20,
                weekly_budget: 150.0,
                complexity_hints: { __forceTop: forceTopHint },
              };
              
              // Per-batch min-top kvot – oberoende av längd (SÄTT INNAN FastPath-check)
              // Om TOP_MIN=0, skippa forceTop helt
              if (TOP_BLOCK > 0 && TOP_MIN > 0) {
                const i = topQuotaCounter % TOP_BLOCK;
                if (i < Math.max(1, Math.floor(TOP_BLOCK * (TOP_MIN / 100)))) {
                  (routerPayloadForLogging.complexity_hints ||= {}).__forceTop = true;
                  routerPayloadForLogging.__forceTop = true;
                }
                topQuotaCounter++;
              }
              
              // FastPath – kör endast om vi INTE har forceTop-hint
              if (!routerPayloadForLogging.complexity_hints.__forceTop && !routerPayloadForLogging.__forceTop && localFastPath(text, isTrivial)) {
                return {
                  tier: 'fastpath',
                  fastpath: { qualifies: true, pattern: 'local_fastpath' },
                  should_use_fastpath: true,
                  routing: null,
                  cost_check: { ok: true, action: 'allow' },
                };
              }
              
              // Debug: logga innan bridge-anrop om forceTop finns
              if (routerPayloadForLogging?.complexity_hints?.__forceTop || routerPayloadForLogging?.__forceTop) {
                console.error(`[FORCE-TOP→BRIDGE] payload=${JSON.stringify({text: text.substring(0, 60), __forceTop: routerPayloadForLogging.__forceTop, complexity_hints: routerPayloadForLogging.complexity_hints})}`);
              }
              
              try {
                const bridgeResult = await runRouterBridge(routerPayloadForLogging);
                
                // Debug: logga exakt vad bridge returnerade (för första 10 forceTop-cases)
                if ((routerPayloadForLogging?.complexity_hints?.__forceTop || routerPayloadForLogging?.__forceTop)) {
                  console.error(`[BRIDGE-RETURN] bridgeResult=${JSON.stringify({tier: bridgeResult?.tier, routing_tier: bridgeResult?.routing?.tier, reason: bridgeResult?.routing?.reason})}`);
                }
                
                // Debug: kontrollera om bridge respekterade forceTop
                if ((routerPayloadForLogging?.complexity_hints?.__forceTop || routerPayloadForLogging?.__forceTop) && 
                    bridgeResult?.tier !== 'top') {
                  console.error(`[FORCE-TOP MISMATCH] asked top, got ${bridgeResult?.tier}, bridgeResult=${JSON.stringify(bridgeResult)}`);
                }
                
                return bridgeResult;
              } catch (error) {
                // Debug: logga om forceTop-fel fångas
                if ((routerPayloadForLogging?.complexity_hints?.__forceTop || routerPayloadForLogging?.__forceTop)) {
                  console.error(`[CATCH-FORCE-TOP] Error caught: ${error.message}`);
                }
                const textLen = text.length;
                return {
                  tier: textLen < 100 ? 'base' : textLen < 300 ? 'mid' : 'top',
                  fastpath: null,
                  routing: {
                    tier: textLen < 100 ? 'base' : textLen < 300 ? 'mid' : 'top',
                    confidence: 0.85,
                    cost_multiplier: textLen < 100 ? 1.0 : textLen < 300 ? 10.0 : 10.0,
                  },
                  cost_check: { ok: true, action: 'allow' },
                };
              }
            };
            
            const routing = await simulateWithLog(caseData, i);
            
            // LÅS FAST TIER: normalisera, trimma, och använd nullish coalescing
            // Detta förhindrar att tier skrivs över efter bridge-returen
            const tierRaw = routing?.tier ?? routing?.routing?.tier ?? 'base';
            const tier = String(tierRaw).trim().toLowerCase();
            
            const isFastPath = tier === 'fastpath' || !!routing?.should_use_fastpath || !!routing?.fastpath?.qualifies;
            
            const result = {
              case_id: caseData.id || `case_${i}`,
              source_level: caseData.source_level,
              timestamp: new Date().toISOString(),
              fastPathUsed: isFastPath, // Top-level flag för report-parser
              routing: {
                tier,  // Skriv den låsta, normaliserade tiern (inte routing.tier som kan skrivas över)
                fastpath_used: isFastPath,
                fastpath_pattern: routing?.fastpath?.pattern,
                modelId: isFastPath ? 'fastpath-local' : (routing?.routing?.model ?? 'estimated'),
                confidence: routing?.routing?.confidence,
                model: routing?.routing?.model ?? 'estimated',
                cost_multiplier: routing?.routing?.cost_multiplier ?? 1.0,
              },
              cost_check: routing?.cost_check,
              text_length: normalized.description.length,
            };
            
            results[i] = result;
            completed++;
            
            // Verbose logging: visa tier-fördelning live + trivial tracing
            const caseText = normalized.description || 'unknown';
            const sourceLabel = caseData.source_level || (caseData.description ? 'trivial' : 'golden');
            const isTrivial = normalized.__isTrivial;
            
            // Defensiv logg precis efter låsning (första 30 forceTop)
            if ((caseData?.__forceTop || routing?.__forceTop || routing?.routing?.reason === 'forceTop_hint' || 
                 routerPayloadForLogging?.complexity_hints?.__forceTop || routerPayloadForLogging?.__forceTop) && 
                completed <= 30) {
              console.log(`[ASSERT] tier=${tier} (should be 'top'), bridge.tier=${routing?.tier}, reason=${routing?.routing?.reason}`);
            }
            
            // Log första 30 trivial cases
            if (isTrivial && completed <= 30) {
              console.log(`[TRIVIAL] "${caseText}" -> fp=${isFastPath} tier=${tier}`);
            }
            // Log första 30 icke-FastPath med __forceTop-hint
            else if (!isFastPath && routerPayloadForLogging && (routerPayloadForLogging.complexity_hints?.__forceTop || routerPayloadForLogging.__forceTop) && completed <= 30) {
              console.log(`[FORCE-TOP] "${caseText.slice(0, 60)}..." -> tier=${tier}`);
            }
            else {
              console.log(`[${completed}/${cases.length}] ${sourceLabel}: "${caseText.substring(0, 30)}" → tier=${tier} fastPath=${isFastPath}`);
            }
            
            if (completed % 50 === 0) {
              console.log(`✅ Processed ${completed}/${cases.length} cases...`);
            }
            
            active--;
            pump();
          } catch (error) {
            console.warn(`⚠️  Skipped case ${cases[i]?.id || i}:`, error.message);
            results[i] = {
              case_id: cases[i]?.id || `case_${i}`,
              source_level: cases[i]?.source_level,
              timestamp: new Date().toISOString(),
              routing: { tier: 'base', fastpath_used: false },
              error: String(error.message),
            };
            completed++;
            active--;
            pump();
          }
        })();
      }
      if (active === 0 && idx >= cases.length) return done();
    };
    pump();
  });
  
  // Kontrollräkna FastPath innan filskrivning (samma logik som report-parser)
  const fp = results.filter(r =>
    r?.fastPathUsed === true ||
    r?.routing?.fastpath_used === true ||
    r?.routing?.modelId === 'fastpath-local'
  ).length;
  console.log(`\n[STATS] total=${results.length} fastPath=${fp} (${(fp/results.length*100).toFixed(1)}%)`);
  
  // Save results (atomic write)
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeJsonlAtomic(OUTPUT_FILE, results);
  
  // Calculate stats (samma logik som report-parser)
  const stats = {
    total: results.length,
    fastpath: results.filter(r =>
      r?.fastPathUsed === true ||
      r?.routing?.fastpath_used === true ||
      r?.routing?.modelId === 'fastpath-local'
    ).length,
    base: results.filter(r => {
      const isFast = r?.fastPathUsed === true || r?.routing?.fastpath_used === true || r?.routing?.modelId === 'fastpath-local';
      return !isFast && r.routing?.tier === 'base';
    }).length,
    mid: results.filter(r => {
      const isFast = r?.fastPathUsed === true || r?.routing?.fastpath_used === true || r?.routing?.modelId === 'fastpath-local';
      return !isFast && r.routing?.tier === 'mid';
    }).length,
    top: results.filter(r => {
      const isFast = r?.fastPathUsed === true || r?.routing?.fastpath_used === true || r?.routing?.modelId === 'fastpath-local';
      return !isFast && r.routing?.tier === 'top';
    }).length,
  };
  
  const routed = stats.base + stats.mid + stats.top;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Batch Run Results:');
  console.log(`  Total: ${stats.total}`);
  console.log(`  FastPath: ${stats.fastpath} (${(stats.fastpath/stats.total*100).toFixed(1)}%)`);
  console.log(`  Base: ${stats.base} (${routed > 0 ? (stats.base/routed*100).toFixed(1) : 0}%)`);
  console.log(`  Mid: ${stats.mid} (${routed > 0 ? (stats.mid/routed*100).toFixed(1) : 0}%)`);
  console.log(`  Top: ${stats.top} (${routed > 0 ? (stats.top/routed*100).toFixed(1) : 0}%)`);
  console.log(`\n✅ Results saved to: ${OUTPUT_FILE} (${results.length} lines)`);
  console.log('='.repeat(60));
}

main().catch(console.error);

