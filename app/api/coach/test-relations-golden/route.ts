/**
 * API route för att köra relations golden tests som coach tests
 * GET /api/coach/test-relations-golden?level=gold&limit=10&file=auto1
 */
import { NextRequest, NextResponse } from "next/server";
import { convertAllRelationsToCoachTests } from "@/lib/coach/convert_relations_tests";
import { runGoldenTest } from "@/lib/coach/golden_tests";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const level = (searchParams.get('level') || 'gold') as 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;
    const file = (searchParams.get('file') || 'auto1') as 'auto1' | 'seed' | 'edge' | 'more';
    
    // Konvertera relations tests till coach tests
    const coachTests = convertAllRelationsToCoachTests(level, file, limit);
    
    if (coachTests.length === 0) {
      return NextResponse.json({
        error: 'No tests found',
        message: `No relations golden tests found for level=${level}, file=${file}`,
      }, { status: 404 });
    }
    
    // Kör alla tests
    const results = [];
    let passed = 0;
    let failed = 0;
    
    for (const test of coachTests) {
      const result = await runGoldenTest(test);
      results.push({
        test: {
          id: test.id,
          name: test.name,
          description: test.description,
        },
        passed: result.passed,
        errors: result.errors,
        actual: result.actual,
      });
      
      if (result.passed) {
        passed++;
      } else {
        failed++;
      }
    }
    
    // Beräkna genomsnittlig teacher score
    const teacherScores = results
      .map(r => r.actual?.teacherReview?.feedback?.overallScore)
      .filter((score): score is number => typeof score === 'number');
    const avgTeacherScore = teacherScores.length > 0
      ? teacherScores.reduce((a, b) => a + b, 0) / teacherScores.length
      : 0;
    
    return NextResponse.json({
      summary: {
        level,
        file,
        total: coachTests.length,
        passed,
        failed,
        passRate: ((passed / coachTests.length) * 100).toFixed(1) + '%',
        avgTeacherScore: avgTeacherScore.toFixed(2),
      },
      results: results.slice(0, 50), // Begränsa output till första 50 för läsbarhet
    });
  } catch (error) {
    console.error("Relations golden tests error:", error);
    return NextResponse.json(
      {
        error: "Failed to run relations golden tests",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

