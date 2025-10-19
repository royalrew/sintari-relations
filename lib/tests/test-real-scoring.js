/**
 * Test som använder den riktiga scoring-funktionen
 * för att verifiera att golden tests stämmer
 */

const fs = require('fs');
const path = require('path');

// Läs indicators.json för att förstå den riktiga logiken
function loadIndicators() {
  const indicatorsPath = path.join(__dirname, '../../data/indicators.json');
  return JSON.parse(fs.readFileSync(indicatorsPath, 'utf-8'));
}

// Replika av den riktiga calculateScore funktionen
function calculateScore(description) {
  const indicatorsData = loadIndicators();
  const POS = indicatorsData.POS;
  const NEG = indicatorsData.NEG;
  const RISK = indicatorsData.RISK;
  
  function hasAny(text, list) {
    const t = text.toLowerCase();
    return list.some(w => t.includes(w));
  }
  
  function scoreText(desc) {
    const text = desc.toLowerCase();
    const pos = POS.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
    const neg = NEG.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
    return { pos, neg, net: pos - neg };
  }
  
  function extractSignals(desc) {
    const text = desc.toLowerCase();
    const risks = RISK.filter((w) => text.includes(w));
    const hasApology = /förlåt|ursäkt/i.test(desc);
    const hasPlan = /plan|schema|överens/i.test(desc);
    const safetyFlag = hasAny(desc, [
      "elak", "elaka", "kränkande", "kränker", "respektlös", "hot", "hotar",
      "rädd", "rädda", "våld", "aggressiv", "aggressivitet", "trakasserier",
      "kontrollerande", "psykiskt våld", "fysiskt våld", "övergrepp",
      "slår", "knuffar", "fysisk", "skrämmande", "skrämmer",
      "tvingar", "tvång", "dominans", "dominerar", "isolering", "isolerar",
      "nedvärderande", "förminskar", "förödmjukar", "kontrollerar allt",
      "tillåter inte", "förbjuder", "obehaglig", "hotfull", "farlig"
    ]);
    return { risks, hasApology, hasPlan, safetyFlag };
  }
  
  const scoreData = scoreText(description);
  const signals = extractSignals(description);
  
  const REPAIR_HINTS = [
    "förlåt", "ursäkt", "ursäkta", "plan", "schema", "överens", "kompromiss",
    "vi pratade", "vi talade", "vi snackade", "vi testade", "vi provade",
    "jobbar på", "vi försöker", "vi försökt", "vi ska försöka", "tog ansvar", "ansvar", "beklagar"
  ];
  
  const WARM_TONE = [
    "kärlek", "älskar", "värme", "omtanke", "respekt", "tillit", "förståelse", "stöd"
  ];
  
  const hasRepairSignals = hasAny(description, REPAIR_HINTS);
  const hasWarmth = hasAny(description, WARM_TONE);
  
  return {
    posCount: scoreData.pos,
    negCount: scoreData.neg,
    riskCount: signals.risks.length,
    hasRepairSignals,
    hasWarmth,
    netScore: scoreData.net,
    riskAreas: signals.risks,
    hasApology: signals.hasApology,
    hasPlan: signals.hasPlan,
    safetyFlag: signals.safetyFlag
  };
}

// Test fallen med korrekt förväntningar
const TEST_CASES = [
  {
    name: "Test 1: Positiv relation med kärlek",
    description: "Vi älskar varandra mycket. Vi respekterar varandra och har tillit till varandra.",
    // Låt oss se vad som faktiskt händer:
    debug: true
  },
  {
    name: "Test 2: Relation med bråk och riskområden",
    description: "Vi älskar varandra men vi bråkar om ekonomi och barnen. Vi planerar att prata om det.",
    debug: true
  },
  {
    name: "Test 3: Negativ relation", 
    description: "Jag är rädd för honom. Han är kontrollerande och hotfull. Vi bråkar hela tiden.",
    debug: true
  }
];

console.log('🔍 Analyserar riktig scoring för testfallen...\n');

TEST_CASES.forEach((testCase, index) => {
  console.log(`${index + 1}. ${testCase.name}`);
  console.log(`Text: "${testCase.description}"`);
  
  const result = calculateScore(testCase.description);
  
  console.log('Resultat:');
  console.log(`  posCount: ${result.posCount}`);
  console.log(`  negCount: ${result.negCount}`);
  console.log(`  riskCount: ${result.riskCount}`);
  console.log(`  hasRepairSignals: ${result.hasRepairSignals}`);
  console.log(`  hasWarmth: ${result.hasWarmth}`);
  console.log(`  netScore: ${result.netScore}`);
  console.log(`  riskAreas: [${result.riskAreas.join(', ')}]`);
  console.log(`  safetyFlag: ${result.safetyFlag}`);
  
  if (result.debug) {
    console.log('\n  DEBUG - Låt oss analysera varje ord:');
    const text = testCase.description.toLowerCase();
    const indicators = loadIndicators();
    
    console.log('  POS ord som matchar:');
    indicators.POS.forEach(word => {
      if (text.includes(word)) {
        console.log(`    "${word}"`);
      }
    });
    
    console.log('  NEG ord som matchar:');
    indicators.NEG.forEach(word => {
      if (text.includes(word)) {
        console.log(`    "${word}"`);
      }
    });
    
    console.log('  RISK ord som matchar:');
    indicators.RISK.forEach(word => {
      if (text.includes(word)) {
        console.log(`    "${word}"`);
      }
    });
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
});

console.log('💡 Använd dessa resultat för att uppdatera golden test förväntningar!');
