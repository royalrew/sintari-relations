/**
 * HR-specific matchers for workplace-related intents
 * Återanvänds från shared matchers när agent === 'hr'
 */

export function workRumour(s?: string): { intent: 'work_rumour' } | null {
  if (!s) return null;
  const t = s.toLowerCase();
  return /\b(pratar skit|rykten|bakom ryggen|ryktesspridning|skvallrar|bakom min rygg)\b/.test(t) 
    ? { intent: 'work_rumour' as const } 
    : null;
}

export function workBoundary(s?: string): { intent: 'work_boundary' } | null {
  if (!s) return null;
  const t = s.toLowerCase();
  return /\b(tjatar|respektlös|gräns|sluta prata om|orkar inte höra|vill att.*slutar|behöver.*sluta)\b/.test(t) 
    ? { intent: 'work_boundary' as const } 
    : null;
}

export function workFeedback(s?: string): { intent: 'work_feedback' } | null {
  if (!s) return null;
  const t = s.toLowerCase();
  return /\b(feedback|återkoppling|ge kritik|ta upp|konstruktiv kritik|säga ifrån|ge återkoppling)\b/.test(t) 
    ? { intent: 'work_feedback' as const } 
    : null;
}

export function workStress(s?: string): { intent: 'work_stress' } | null {
  if (!s) return null;
  const t = s.toLowerCase();
  return /\b(stress|utmattad|orkar inte på jobbet|slutkörd|utbränd|överarbetad|mår dåligt på jobbet)\b/.test(t) 
    ? { intent: 'work_stress' as const } 
    : null;
}

/**
 * Detekterar arbetsplatsrelaterade ord för handoff från coach
 */
export function detectWorkplace(s?: string): boolean {
  if (!s) return false;
  const t = s.toLowerCase();
  return /\b(kollega|chef|chefen|arbetsplats|jobbet|kontor|möte|projekt|team|avdelning|företag|företaget|arbetskamrat|medarbetare)\b/.test(t) ||
         workRumour(s) !== null ||
         workBoundary(s) !== null ||
         workFeedback(s) !== null ||
         workStress(s) !== null;
}

