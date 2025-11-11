#!/usr/bin/env node
/**
 * Test Golden Tests Runner - Kör golden tests direkt
 * 
 * Användning:
 *   npx ts-node --transpile-only scripts/test-golden-tests-runner.ts
 *   npm run test:golden:coach
 */
import { runAllGoldenTests, GOLDEN_TESTS } from '../lib/coach/golden_tests';

async function main() {
  console.log('🧪 Kör golden tests för coach-pipelinen...\n');
  
  const results = await runAllGoldenTests();
  
  console.log('\n📊 Resultat:');
  console.log(`✅ Passerade: ${results.passed}/${GOLDEN_TESTS.length}`);
  console.log(`❌ Misslyckade: ${results.failed}/${GOLDEN_TESTS.length}\n`);
  
  // Visa detaljerade resultat
  for (const { test, result } of results.results) {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${test.name}`);
    console.log(`   ${test.description}`);
    
    if (!result.passed && result.errors.length > 0) {
      console.log(`   Fel:`);
      result.errors.forEach(err => console.log(`   - ${err}`));
    }
    
    if (result.actual?.reply) {
      console.log(`   Svar: "${result.actual.reply.substring(0, 60)}..."`);
    }
    
    if (result.actual?.teacherReview?.feedback?.overallScore) {
      console.log(`   Teacher Score: ${result.actual.teacherReview.feedback.overallScore.toFixed(1)}/10`);
    }
    
    console.log('');
  }
  
  // Exit code baserat på resultat
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('❌ Fel vid körning av golden tests:', error);
  process.exit(1);
});

