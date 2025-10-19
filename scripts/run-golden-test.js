#!/usr/bin/env node

/**
 * Golden Test Runner Script
 * 
 * Kör: npm run test:golden
 * 
 * Detta script kör golden tests för CSV-loggning och relationanalys
 */

const path = require('path');
const { execSync } = require('child_process');

async function runGoldenTest() {
  console.log('🧪 Startar Golden Test...');
  
  try {
    // Kompilera TypeScript om nödvändigt och kör testet
    const testFile = path.join(__dirname, '../lib/tests/golden-test.ts');
    
    // Kör med ts-node för enkelhet
    const command = `npx ts-node --transpile-only "${testFile}"`;
    
    console.log('Kör kommandot:', command);
    execSync(command, { stdio: 'inherit' });
    
  } catch (error) {
    console.error('❌ Golden Test misslyckades:', error.message);
    process.exit(1);
  }
}

// Kör testet
runGoldenTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
