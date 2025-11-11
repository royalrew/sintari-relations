#!/usr/bin/env node
/**
 * Test Golden Tests - Kör alla golden tests för coach-pipelinen
 * 
 * Användning:
 *   npm run test:golden:coach
 * 
 * Detta script använder ts-node för att köra TypeScript-filer direkt
 */
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ladda .env
try {
  const { readFileSync } = await import('fs');
  const envPath = join(__dirname, '..', 'backend', '.env');
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = value;
      }
    }
  });
} catch (e) {
  console.warn('Kunde inte ladda .env:', e.message);
}

// Kör golden tests med ts-node
try {
  const testFile = join(__dirname, '..', 'lib', 'coach', 'golden_tests.ts');
  const command = `npx ts-node --transpile-only --esm "${testFile}"`;
  
  console.log('🧪 Kör golden tests för coach-pipelinen...\n');
  console.log(`Kör: ${command}\n`);
  
  execSync(command, { 
    stdio: 'inherit',
    cwd: join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_OPTIONS: '--loader ts-node/esm',
    },
  });
} catch (error) {
  console.error('❌ Fel vid körning av golden tests:', error.message);
  console.error('\n💡 Tips: Installera ts-node om det saknas:');
  console.error('   npm install --save-dev ts-node');
  process.exit(1);
}

