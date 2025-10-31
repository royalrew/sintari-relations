import { NextRequest, NextResponse } from 'next/server';
import { runAllAgents } from '@/lib/agents/agent_orchestrator';

export async function GET() {
  console.log('🚀 TESTING ALL 29 AGENTS...\n');
  
  const testInput = {
    person1: "Anna",
    person2: "Erik", 
    description: `Vi har varit tillsammans i 3 år och älskar varandra väldigt mycket. Men vi slåss ibland och han säger hemska saker till mig när han är arg. Sedan ber han om förlåtelse och lovar att inte göra det igen, men det händer ändå. Jag känner mig rädd och osäker i vår relation.`,
    consent: true
  };
  
  const context = {
    run_id: "test_all_agents_" + Date.now(),
    timestamp: new Date().toISOString(),
    language: "sv"
  };
  
  console.log('📝 Test Input:');
  console.log(`Person1: ${testInput.person1}`);
  console.log(`Person2: ${testInput.person2}`);
  console.log(`Description: ${testInput.description.slice(0, 100)}...`);
  console.log(`Consent: ${testInput.consent}\n`);
  
  try {
    console.log('⏳ Running all agents...');
    const startTime = Date.now();
    
    const result = await runAllAgents(testInput, context);
    
    const totalTime = Date.now() - startTime;
    
    console.log('\n📊 RESULTS:');
    console.log(`Total time: ${totalTime}ms`);
    console.log(`Success count: ${result.success_count}`);
    console.log(`Error count: ${result.error_count}`);
    console.log(`Total agents: ${result.agents.length}\n`);
    
    // Gruppera resultat per status
    const successAgents = result.agents.filter(a => a.status === 'success');
    const errorAgents = result.agents.filter(a => a.status === 'error');
    
    console.log('✅ SUCCESSFUL AGENTS:');
    successAgents.forEach(agent => {
      console.log(`  • ${agent.agent_id} (${agent.latency_ms}ms)`);
    });
    
    if (errorAgents.length > 0) {
      console.log('\n❌ FAILED AGENTS:');
      errorAgents.forEach(agent => {
        console.log(`  • ${agent.agent_id}: ${agent.error}`);
      });
    }
    
    // Visa viktiga outputs
    console.log('\n🔍 KEY OUTPUTS:');
    
    const safetyAgent = result.agents.find(a => a.agent_id === 'safety_gate');
    if (safetyAgent?.output?.emits) {
      console.log(`Safety: ${safetyAgent.output.emits.safety || 'N/A'}`);
      if (safetyAgent.output.emits.risk_areas) {
        console.log(`Risk areas: ${safetyAgent.output.emits.risk_areas.join(', ')}`);
      }
    }
    
    const planAgent = result.agents.find(a => a.agent_id === 'plan_focus');
    if (planAgent?.output?.emits?.top3) {
      console.log(`Top3 focus: ${planAgent.output.emits.top3.join(', ')}`);
    }
    
    const explainAgent = result.agents.find(a => a.agent_id === 'explain_linker');
    if (explainAgent?.output?.emits?.explain_spans) {
      console.log(`Explain spans: ${explainAgent.output.emits.explain_spans.length} spans`);
    }
    
    const metaAgent = result.agents.find(a => a.agent_id === 'meta_patterns');
    if (metaAgent?.output?.emits?.archetypes) {
      console.log(`Meta patterns: ${metaAgent.output.emits.archetypes.length} archetypes`);
    }
    
    // Sammanfattning
    console.log('\n📈 SUMMARY:');
    console.log(`✅ ${successAgents.length}/29 agents successful`);
    console.log(`❌ ${errorAgents.length}/29 agents failed`);
    console.log(`⏱️  Average latency: ${Math.round(result.agents.reduce((sum, a) => sum + a.latency_ms, 0) / result.agents.length)}ms`);
    
    if (result.success_count >= 25) {
      console.log('\n🎉 EXCELLENT! Most agents are working!');
    } else if (result.success_count >= 20) {
      console.log('\n👍 GOOD! Most agents are working, some issues to fix.');
    } else {
      console.log('\n⚠️  NEEDS ATTENTION! Many agents are failing.');
    }
    
    return NextResponse.json({
      success: true,
      summary: {
        total_agents: result.agents.length,
        success_count: result.success_count,
        error_count: result.error_count,
        total_time_ms: totalTime,
        average_latency_ms: Math.round(result.agents.reduce((sum, a) => sum + a.latency_ms, 0) / result.agents.length)
      },
      agents: result.agents.map(agent => ({
        id: agent.agent_id,
        status: agent.status,
        latency_ms: agent.latency_ms,
        error: agent.error
      })),
      key_outputs: {
        safety: safetyAgent?.output?.emits?.safety,
        risk_areas: safetyAgent?.output?.emits?.risk_areas,
        top3_focus: planAgent?.output?.emits?.top3,
        explain_spans_count: explainAgent?.output?.emits?.explain_spans?.length,
        meta_patterns_count: metaAgent?.output?.emits?.archetypes?.length
      }
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
