import { NextRequest, NextResponse } from 'next/server';
import { LearningSystem } from '@/lib/learning/learning_system.mjs';

export async function GET() {
  console.log('🧠 TESTING LEARNING SYSTEM...\n');
  
  try {
    const learningSystem = new LearningSystem();
    
    console.log('📊 Loading performance history...');
    await learningSystem.loadPerformanceHistory();
    console.log(`✅ Loaded ${learningSystem.performanceHistory.length} historical runs`);
    
    console.log('\n🔍 Analyzing performance trends...');
    const trends = learningSystem.analyzePerformanceTrends();
    console.log(`✅ Trends analyzed: ${Object.keys(trends).length} metrics`);
    
    console.log('\n💡 Generating learning suggestions...');
    const suggestions = learningSystem.generateLearningSuggestions();
    console.log(`✅ Generated ${suggestions.length} suggestions`);
    
    console.log('\n🔧 Running autoheal...');
    await learningSystem.autoheal();
    console.log('✅ Autoheal completed');
    
    console.log('\n📈 Running learning cycle...');
    await learningSystem.runLearningCycle();
    console.log('✅ Learning cycle completed');
    
    return NextResponse.json({
      success: true,
      summary: {
        historical_runs: learningSystem.performanceHistory.length,
        trends_analyzed: Object.keys(trends).length,
        suggestions_generated: suggestions.length,
        autoheal_completed: true,
        learning_cycle_completed: true
      },
      trends: trends,
      suggestions: suggestions.slice(0, 5), // Top 5 suggestions
      message: 'Learning system test successful!'
    });
    
  } catch (error) {
    console.error('❌ Learning system test failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
