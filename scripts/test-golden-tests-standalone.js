#!/usr/bin/env node
/**
 * Standalone Golden Tests Runner
 * Kör golden tests direkt utan att behöva servern
 * 
 * Användning:
 *   npm run test:golden:coach:standalone
 * 
 * Detta script kompilerar TypeScript och kör tests direkt
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Ladda .env
try {
  const envPath = path.join(__dirname, '..', 'backend', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        if (!process.env[key.trim()]) {
          process.env[key.trim()] = value;
        }
      }
    });
  }
} catch (e) {
  console.warn('Kunde inte ladda .env:', e.message);
}

// Sätt miljövariabler för Next.js
process.env.NODE_ENV = 'test';
process.env.NEXT_RUNTIME = 'nodejs';

async function runTests() {
  console.log('🧪 Kör golden tests för coach-pipelinen (standalone)...\n');
  
  try {
    // Försök använda tsx (snabbare än ts-node)
    let command;
    
    // Kolla om tsx finns installerat
    try {
      execSync('npx tsx --version', { stdio: 'ignore' });
      command = `npx tsx scripts/test-golden-tests-runner.ts`;
    } catch {
      // Fallback till ts-node
      command = `npx ts-node --transpile-only --compiler-options '{"module":"commonjs"}' scripts/test-golden-tests-runner.ts`;
    }
    
    console.log(`Kör: ${command}\n`);
    
    execSync(command, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        TS_NODE_PROJECT: path.join(__dirname, '..', 'tsconfig.json'),
      },
    });
  } catch (error) {
    console.error('\n❌ Fel vid körning av golden tests:', error.message);
    console.error('\n💡 Tips:');
    console.error('   1. Installera tsx: npm install --save-dev tsx');
    console.error('   2. Eller installera ts-node: npm install --save-dev ts-node');
    console.error('   3. Eller starta servern och använd API-route');
    process.exit(1);
  }
}

runTests();

