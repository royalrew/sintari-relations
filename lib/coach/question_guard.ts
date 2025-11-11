/**
 * Question Guard - Säkerställer frågebudget (max 1 fråga per 3 coach-turer)
 */
export interface QuestionGuardParams {
  text: string;
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/**
 * Kontrollerar och justerar frågebudget
 * Max 1 fråga per 3 coach-turer
 */
export function questionGuard(params: QuestionGuardParams): string {
  const { text, conversation } = params;
  
  // Räkna antal frågor i nuvarande text
  const currentQuestionCount = (text.match(/\?/g) || []).length;
  
  // Hämta senaste 3 assistant-svar
  const recentReplies = conversation
    .filter(m => m.role === 'assistant')
    .slice(-3)
    .map(m => m.content);
  
  // Räkna totalt antal frågor i senaste 3 svaren
  const recentQuestionCount = recentReplies.reduce((count, reply) => {
    return count + (reply.match(/\?/g) || []).length;
  }, 0);
  
  // Om vi redan har 1+ frågor i senaste 3 svaren, ta bort alla frågor från nuvarande text
  if (recentQuestionCount >= 1 && currentQuestionCount > 0) {
    // Ersätt frågetecken med punkter
    return text.replace(/\?/g, '.');
  }
  
  // Om vi har fler än 1 fråga i nuvarande text, behåll bara första
  if (currentQuestionCount > 1) {
    const parts = text.split('?');
    return parts.slice(0, 2).join('?') + parts.slice(2).join('.');
  }
  
  return text;
}

/**
 * Kontrollerar om frågebudget tillåter en ny fråga
 */
export function canAskQuestion(conversation: Array<{ role: 'user' | 'assistant'; content: string }>): boolean {
  const recentReplies = conversation
    .filter(m => m.role === 'assistant')
    .slice(-3)
    .map(m => m.content);
  
  const recentQuestionCount = recentReplies.reduce((count, reply) => {
    return count + (reply.match(/\?/g) || []).length;
  }, 0);
  
  return recentQuestionCount < 1;
}

