import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile, unlink } from "fs/promises";
import { join } from "path";

/**
 * GET /api/teacher-reviews
 * Hämtar alla GPT-5 Teacher reviews från data/teacher-reviews/
 */
export async function GET(request: NextRequest) {
  try {
    const reviewsDir = join(process.cwd(), "data", "teacher-reviews");
    
    // Försök läsa filer
    let files: string[] = [];
    try {
      files = await readdir(reviewsDir);
    } catch (error) {
      // Om mappen inte finns, returnera tom lista
      return NextResponse.json({ reviews: [] });
    }

    // Filtrera JSON-filer och läs dem
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    const reviews = [];

    for (const file of jsonFiles.slice(-50)) {
      // Läsa senaste 50 reviews
      try {
        const content = await readFile(join(reviewsDir, file), "utf-8");
        const review = JSON.parse(content);
        reviews.push(review);
      } catch (error) {
        console.error(`Failed to read ${file}:`, error);
      }
    }

    // Sortera efter timestamp (nyaste först)
    reviews.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    return NextResponse.json({
      reviews,
      count: reviews.length,
      totalFiles: jsonFiles.length,
    });
  } catch (error) {
    console.error("Error reading teacher reviews:", error);
    return NextResponse.json(
      {
        error: "Failed to read reviews",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/teacher-reviews
 * Rensar alla GPT-5 Teacher reviews
 */
export async function DELETE(request: NextRequest) {
  try {
    const reviewsDir = join(process.cwd(), "data", "teacher-reviews");
    
    // Läs alla filer i mappen
    let files: string[] = [];
    try {
      files = await readdir(reviewsDir);
    } catch (error) {
      // Om mappen inte finns, returnera success
      return NextResponse.json({ 
        success: true, 
        message: "No reviews directory found",
        deleted: 0 
      });
    }

    // Filtrera JSON-filer
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    
    // Ta bort alla JSON-filer
    let deleted = 0;
    for (const file of jsonFiles) {
      try {
        await unlink(join(reviewsDir, file));
        deleted++;
      } catch (error) {
        console.error(`Failed to delete ${file}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Deleted ${deleted} review files`,
      deleted,
    });
  } catch (error) {
    console.error("Error deleting teacher reviews:", error);
    return NextResponse.json(
      {
        error: "Failed to delete reviews",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
