/**
 * Coach Pipeline Telemetry Logger
 * Loggar KPI:er för coach-chatten
 */
export interface CoachTelemetry {
  timestamp: string;
  threadId: string;
  userMessage: string;
  reply: string;
  latency_ms: number;
  safety_level: 'OK' | 'WARN' | 'RED';
  mood?: {
    level: string;
    score: number;
  };
  teacher_score?: number;
  memory_facets_count?: number;
  question_count: number;
  blocked: boolean;
  crisis_required: boolean;
}

/**
 * Logga telemetry (console för nu, kan utökas till fil/database)
 */
export function logCoachTelemetry(telemetry: CoachTelemetry): void {
  const logEntry = {
    ...telemetry,
    timestamp: new Date().toISOString(),
  };
  
  // Console logging för nu
  console.log('[COACH-TELEMETRY]', JSON.stringify(logEntry));
  
  // TODO: Lägg till fil-logging eller database-logging här
  // Exempel: await writeToFile('data/coach-telemetry.jsonl', JSON.stringify(logEntry) + '\n');
}

/**
 * Samla telemetry från orchestrate-resultat
 */
export function collectTelemetry(
  threadId: string,
  userMessage: string,
  reply: string,
  latency_ms: number,
  safety_level: 'OK' | 'WARN' | 'RED',
  orchestrateResult: any,
  blocked: boolean = false,
  crisis_required: boolean = false
): CoachTelemetry {
  const questionCount = (reply.match(/\?/g) || []).length;
  
  return {
    timestamp: new Date().toISOString(),
    threadId,
    userMessage,
    reply,
    latency_ms,
    safety_level,
    mood: orchestrateResult.mood,
    teacher_score: orchestrateResult.teacherReview?.feedback?.overallScore,
    memory_facets_count: orchestrateResult.memoryFacets?.length || 0,
    question_count: questionCount,
    blocked,
    crisis_required,
  };
}

