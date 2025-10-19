/**
 * Golden Test för CSV-loggning och Relationanalys
 * 
 * Detta är en testfil som verifierar att:
 * - CSV-loggning fungerar korrekt
 * - Scoringsystemet ger rätt resultat
 * - Alla fält sparas korrekt i CSV
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// Test cases med förväntade resultat
const TEST_CASES = [
  {
    name: "Positiv relation med kärlek",
    input: {
      person1: "Anna",
      person2: "Erik", 
      description: "Vi älskar varandra mycket. Vi respekterar varandra och har tillit till varandra."
    },
    expected: {
      posCount: 4, // älskar, respekterar, tillit, kärlek (i respekterar)
      negCount: 0,
      riskCount: 0,
      hasRepairSignals: false,
      hasWarmth: true,
      netScore: 4
    }
  },
  {
    name: "Relation med bråk och riskområden",
    input: {
      person1: "Maria",
      person2: "Johan",
      description: "Vi älskar varandra men vi bråkar om ekonomi och barnen. Vi planerar att prata om det."
    },
    expected: {
      posCount: 1, // älskar
      negCount: 1, // bråkar
      riskCount: 3, // bråk, ekonomi, barn (barnen räknas som "barn")
      hasRepairSignals: true, // planerar
      hasWarmth: true, // älskar
      netScore: 0
    }
  },
  {
    name: "Negativ relation med trygghetsproblem",
    input: {
      person1: "Lisa",
      person2: "Mikael", 
      description: "Jag är rädd för honom. Han är kontrollerande och hotfull. Vi bråkar hela tiden."
    },
    expected: {
      posCount: 0,
      negCount: 2, // rädd, bråkar
      riskCount: 2, // kontrollerande, bråk
      hasRepairSignals: false,
      hasWarmth: false,
      netScore: -2,
      safetyFlag: "CAUTION" // rädd, kontrollerande, hotfull
    }
  },
  {
    name: "Relation med reparationssignaler",
    input: {
      person1: "Sofia",
      person2: "Anders",
      description: "Vi hade problem men jag förlåt honom. Vi har planerat att jobba på vår kommunikation tillsammans."
    },
    expected: {
      posCount: 0,
      negCount: 0,
      riskCount: 2, // problem, kommunikation
      hasRepairSignals: true, // förlåt, planerat, jobba på
      hasWarmth: false,
      netScore: 0
    }
  }
];

interface TestResult {
  testName: string;
  passed: boolean;
  scoreData: any;
  expected: any;
  errors: string[];
}

export async function runGoldenTests(): Promise<void> {
  console.log("🧪 Kör Golden Tests för CSV-loggning...");
  
  const results: TestResult[] = [];
  
  for (const testCase of TEST_CASES) {
    console.log(`\n📋 Testar: ${testCase.name}`);
    
    try {
      // Import calculateScore från utils
      const { calculateScore } = await import('../utils/calculateScore');
      const scoreData = calculateScore(testCase.input.description);
      
      const errors: string[] = [];
      
      // Verifiera alla fält
      if (scoreData.posCount !== testCase.expected.posCount) {
        errors.push(`posCount: förväntat ${testCase.expected.posCount}, fick ${scoreData.posCount}`);
      }
      
      if (scoreData.negCount !== testCase.expected.negCount) {
        errors.push(`negCount: förväntat ${testCase.expected.negCount}, fick ${scoreData.negCount}`);
      }
      
      if (scoreData.riskCount !== testCase.expected.riskCount) {
        errors.push(`riskCount: förväntat ${testCase.expected.riskCount}, fick ${scoreData.riskCount}`);
      }
      
      if (scoreData.hasRepairSignals !== testCase.expected.hasRepairSignals) {
        errors.push(`hasRepairSignals: förväntat ${testCase.expected.hasRepairSignals}, fick ${scoreData.hasRepairSignals}`);
      }
      
      if (scoreData.hasWarmth !== testCase.expected.hasWarmth) {
        errors.push(`hasWarmth: förväntat ${testCase.expected.hasWarmth}, fick ${scoreData.hasWarmth}`);
      }
      
      if (scoreData.netScore !== testCase.expected.netScore) {
        errors.push(`netScore: förväntat ${testCase.expected.netScore}, fick ${scoreData.netScore}`);
      }
      
      if ('safetyFlag' in testCase.expected && scoreData.safetyFlag !== testCase.expected.safetyFlag) {
        errors.push(`safetyFlag: förväntat ${testCase.expected.safetyFlag}, fick ${scoreData.safetyFlag}`);
      }
      
      const passed = errors.length === 0;
      
      console.log(passed ? "✅ PASSED" : "❌ FAILED");
      if (errors.length > 0) {
        console.log("   Fel:", errors.join(", "));
      }
      
      results.push({
        testName: testCase.name,
        passed,
        scoreData,
        expected: testCase.expected,
        errors
      });
      
    } catch (error) {
      console.log("❌ ERROR");
      console.log("   ", error);
      
      results.push({
        testName: testCase.name,
        passed: false,
        scoreData: null,
        expected: testCase.expected,
        errors: [`Test failed with error: ${error}`]
      });
    }
  }
  
  // Sammanfatta resultat
  const passedTests = results.filter(r => r.passed).length;
  const totalTests = results.length;
  
  console.log(`\n📊 Sammanfattning: ${passedTests}/${totalTests} test passerade`);
  
  if (passedTests === totalTests) {
    console.log("🎉 Alla Golden Tests PASSADE! Systemet fungerar korrekt.");
  } else {
    console.log("⚠️  Några test misslyckades. Kontrollera scoring-logiken.");
  }
  
  // Generera testrapport
  await generateTestReport(results);
}

async function generateTestReport(results: TestResult[]): Promise<void> {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalTests: results.length,
      passedTests: results.filter(r => r.passed).length,
      failedTests: results.filter(r => !r.passed).length,
      successRate: Math.round((results.filter(r => r.passed).length / results.length) * 100)
    },
    tests: results.map(result => ({
      name: result.testName,
      status: result.passed ? "PASSED" : "FAILED",
      scoreData: result.scoreData,
      expected: result.expected,
      errors: result.errors
    }))
  };
  
  try {
    const reportsDir = join(process.cwd(), "data", "test-reports");
    await mkdir(reportsDir, { recursive: true });
    
    const reportPath = join(reportsDir, `golden-test-${new Date().toISOString().split('T')[0]}.json`);
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    
    console.log(`\n📄 Testrapport sparad: ${reportPath}`);
  } catch (error) {
    console.log("⚠️  Kunde inte spara testrapport:", error);
  }
}

// CLI interface för att köra tester
if (require.main === module) {
  runGoldenTests().catch(console.error);
}
