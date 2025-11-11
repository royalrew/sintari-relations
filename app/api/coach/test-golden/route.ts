/**
 * API route för att köra golden tests
 * GET /api/coach/test-golden - Kör alla golden tests
 */
import { NextRequest, NextResponse } from "next/server";
import { runAllGoldenTests, GOLDEN_TESTS } from "@/lib/coach/golden_tests";

export async function GET(request: NextRequest) {
  try {
    const results = await runAllGoldenTests();
    
    return NextResponse.json({
      summary: {
        total: GOLDEN_TESTS.length,
        passed: results.passed,
        failed: results.failed,
      },
      results: results.results.map(({ test, result }) => ({
        test: {
          id: test.id,
          name: test.name,
          description: test.description,
        },
        passed: result.passed,
        errors: result.errors,
        actual: result.actual,
      })),
    });
  } catch (error) {
    console.error("Golden tests error:", error);
    return NextResponse.json(
      {
        error: "Failed to run golden tests",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

