/**
 * Test Golden Tests - Kör alla golden tests via API
 * 
 * Användning (när servern körs):
 *   node scripts/test-golden-tests-api.mjs
 * 
 * Eller via npm:
 *   npm run test:golden:coach:api
 */
import fetch from 'node-fetch';

const API_URL = process.env.COACH_API_URL || 'http://localhost:3000';

async function runTests() {
  console.log('🧪 Kör golden tests för coach-pipelinen via API...\n');
  console.log(`API URL: ${API_URL}\n`);
  
  try {
    const response = await fetch(`${API_URL}/api/coach/test-golden`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log('\n📊 Resultat:');
    console.log(`✅ Passerade: ${data.summary.passed}/${data.summary.total}`);
    console.log(`❌ Misslyckade: ${data.summary.failed}/${data.summary.total}\n`);
    
    // Visa detaljerade resultat
    for (const result of data.results) {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${result.test.name}`);
      console.log(`   ${result.test.description}`);
      
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
    process.exit(data.summary.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Fel vid körning av golden tests:', error.message);
    console.error('\n💡 Tips: Se till att Next.js-servern körs på port 3000:');
    console.error('   npm run dev');
    process.exit(1);
  }
}

runTests();

