/**
 * Script för att köra relations golden tests som coach tests
 * Usage: npm run test:coach:relations -- --level=gold --limit=10 --file=auto1
 */
import { convertAllRelationsToCoachTests } from '../lib/coach/convert_relations_tests';
import { runGoldenTest } from '../lib/coach/golden_tests';

const args = process.argv.slice(2);
const levelArg = args.find(a => a.startsWith('--level='))?.split('=')[1] || 'gold';
const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const fileArg = args.find(a => a.startsWith('--file='))?.split('=')[1] || 'auto1';

const level = levelArg as 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
const limit = limitArg ? parseInt(limitArg) : undefined;
const file = fileArg as 'auto1' | 'seed' | 'edge' | 'more';

async function main() {
  console.log(`\n🧪 Kör Relations Golden Tests som Coach Tests`);
  console.log(`========================================`);
  console.log(`Level: ${level}`);
  console.log(`File: ${file}`);
  console.log(`Limit: ${limit || 'all'}\n`);
  
  // Konvertera relations tests till coach tests
  const coachTests = convertAllRelationsToCoachTests(level, file, limit);
  
  if (coachTests.length === 0) {
    console.error(`❌ Inga tests hittades för level=${level}, file=${file}`);
    process.exit(1);
  }
  
  console.log(`📋 Laddade ${coachTests.length} tests\n`);
  
  // Kör alla tests
  const results = [];
  let passed = 0;
  let failed = 0;
  
  for (let i = 0; i < coachTests.length; i++) {
    const test = coachTests[i];
    process.stdout.write(`\r🔄 Testar ${i + 1}/${coachTests.length}: ${test.id}...`);
    
    try {
      const result = await runGoldenTest(test);
      results.push({ test, result });
      
      if (result.passed) {
        passed++;
      } else {
        failed++;
        console.log(`\n❌ ${test.name}:`);
        result.errors.forEach(err => console.log(`   - ${err}`));
      }
    } catch (error) {
      failed++;
      console.log(`\n❌ ${test.name}: Error - ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  console.log(`\n\n========================================`);
  console.log(`📊 SAMMANFATTNING`);
  console.log(`========================================`);
  console.log(`Totalt: ${coachTests.length}`);
  console.log(`✅ Passed: ${passed} (${((passed / coachTests.length) * 100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${failed} (${((failed / coachTests.length) * 100).toFixed(1)}%)`);
  
  // Beräkna genomsnittlig teacher score
  const teacherScores = results
    .map(r => r.result.actual?.teacherReview?.feedback?.overallScore)
    .filter((score): score is number => typeof score === 'number');
  
  if (teacherScores.length > 0) {
    const avgTeacherScore = teacherScores.reduce((a, b) => a + b, 0) / teacherScores.length;
    console.log(`📈 Genomsnittlig Teacher Score: ${avgTeacherScore.toFixed(2)}`);
  }
  
  // Visa top 5 failed tests
  if (failed > 0) {
    console.log(`\n🔴 Top 5 Failed Tests:`);
    results
      .filter(r => !r.result.passed)
      .slice(0, 5)
      .forEach(({ test, result }) => {
        console.log(`   - ${test.name}: ${result.errors.slice(0, 2).join(', ')}`);
      });
  }
  
  console.log(`\n`);
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

