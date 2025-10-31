import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  console.log('🧠 TESTING LEARNING SYSTEM (Simple)...\n');
  
  try {
    // Test 1: Check if files exist
    console.log('📁 Checking files...');
    const learningFile = path.join(process.cwd(), 'lib', 'learning', 'learning_system.mjs');
    const autohealFile = path.join(process.cwd(), 'lib', 'learning', 'autoheal_system_v2.mjs');
    
    const learningExists = fs.existsSync(learningFile);
    const autohealExists = fs.existsSync(autohealFile);
    
    console.log(`Learning system: ${learningExists ? '✅' : '❌'}`);
    console.log(`Autoheal system: ${autohealExists ? '✅' : '❌'}`);
    
    // Test 2: Check if output directory exists
    console.log('\n📂 Checking output directory...');
    const outputDir = path.join(process.cwd(), '..', 'tests', 'golden', 'output');
    const outputExists = fs.existsSync(outputDir);
    console.log(`Output directory: ${outputExists ? '✅' : '❌'}`);
    
    let reportFiles = [];
    let latestRunData = null;
    
    if (outputExists) {
      const files = fs.readdirSync(outputDir);
      reportFiles = files.filter(f => f.startsWith('golden_run_report_') && f.endsWith('.json'));
      console.log(`Report files found: ${reportFiles.length}`);
      
      // Test 3: Check if we can read a report file
      console.log('\n📖 Testing report reading...');
      const latestRunFile = path.join(outputDir, 'latest_run.json');
      if (fs.existsSync(latestRunFile)) {
        latestRunData = JSON.parse(fs.readFileSync(latestRunFile, 'utf8'));
        console.log(`✅ Latest run loaded: ${latestRunData.meta?.summary ? 'Has summary' : 'No summary'}`);
      }
    }
    
    return NextResponse.json({
      success: true,
      summary: {
        learning_system_exists: learningExists,
        autoheal_system_exists: autohealExists,
        output_directory_exists: outputExists,
        report_files_found: reportFiles.length,
        latest_run_loaded: !!latestRunData
      },
      files: {
        learning_system: learningFile,
        autoheal_system: autohealFile,
        output_directory: outputDir
      },
      latest_run: latestRunData ? {
        has_summary: !!latestRunData.meta?.summary,
        coverage: latestRunData.meta?.summary?.explain_coverage,
        flags_f1: latestRunData.meta?.summary?.flags_f1,
        worldclass: latestRunData.meta?.summary?.worldclass_score
      } : null,
      message: 'Learning system files test successful!'
    });
    
  } catch (error) {
    console.error('❌ Learning system test failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
