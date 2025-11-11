/**
 * Coach Pipeline Checklist CSV
 * 
 * id,layer,agent/modul,syfte,output,blocker?,hook
 */
export const COACH_PIPELINE_CHECKLIST = [
  { id: 1, layer: 'pre', agent: 'consent', purpose: 'Samtycke krävs', output: 'ok|reason', blocker: true, hook: '/api/coach' },
  { id: 2, layer: 'pre', agent: 'safety_gate', purpose: 'Säkerhetsnivå', output: 'level|reason', blocker: true, hook: '/api/coach' },
  { id: 3, layer: 'pre', agent: 'risk_selfharm', purpose: 'Självskaderisk', output: 'level|immediate', blocker: true, hook: '/api/coach' },
  { id: 4, layer: 'pre', agent: 'risk_abuse', purpose: 'Abuse-risk', output: 'level', blocker: true, hook: '/api/coach' },
  { id: 5, layer: 'pre', agent: 'risk_coercion', purpose: 'Coercion-risk', output: 'level', blocker: true, hook: '/api/coach' },
  { id: 6, layer: 'pre', agent: 'crisis_router', purpose: 'Krisplan', output: 'crisis_required|plan', blocker: true, hook: '/api/coach' },
  { id: 7, layer: 'signal', agent: 'micro_mood', purpose: 'Emotionell ton', output: 'label', blocker: false, hook: '/lib/coach/orchestrateCoachReply' },
  { id: 8, layer: 'signal', agent: 'dialog_memory_v2', purpose: 'Kontextminne', output: 'facets', blocker: false, hook: '/lib/coach/orchestrateCoachReply' },
  { id: 9, layer: 'signal', agent: 'persona_agent', purpose: 'Persona-ton', output: 'style_hint', blocker: false, hook: '/lib/coach/orchestrateCoachReply' },
  { id: 10, layer: 'signal', agent: 'coach_insights', purpose: 'Bakgrundsinsikter', output: 'hints', blocker: false, hook: '/lib/coach/orchestrateCoachReply' },
  { id: 11, layer: 'reply', agent: 'templates_v1', purpose: 'Svarsmall', output: 'text', blocker: false, hook: '/lib/coach/orchestrateCoachReply' },
  { id: 12, layer: 'reply', agent: 'tone_fixer', purpose: 'Städa ton', output: 'text', blocker: false, hook: '/lib/coach/orchestrateCoachReply' },
  { id: 13, layer: 'reply', agent: 'question_guard', purpose: 'Frågebudget', output: 'text', blocker: false, hook: '/lib/coach/orchestrateCoachReply' },
  { id: 14, layer: 'reply', agent: 'gpt5_teacher', purpose: 'Kvalitetsbetyg', output: 'json', blocker: false, hook: '/lib/coach/orchestrateCoachReply' },
  { id: 15, layer: 'post', agent: 'memory_ingest', purpose: 'Spara facetter', output: 'ok', blocker: false, hook: '/lib/coach/orchestrateCoachReply' },
  { id: 16, layer: 'post', agent: 'calibration', purpose: 'Drift/poäng-logg', output: 'metrics', blocker: false, hook: '/api/coach' },
];

/**
 * Generera CSV-sträng från checklist
 */
export function generateChecklistCSV(): string {
  const header = 'id,layer,agent/modul,syfte,output,blocker?,hook\n';
  const rows = COACH_PIPELINE_CHECKLIST.map(item => 
    `${item.id},${item.layer},${item.agent},${item.purpose},${item.output},${item.blocker ? 'ja' : 'nej'},${item.hook}`
  ).join('\n');
  
  return header + rows;
}

