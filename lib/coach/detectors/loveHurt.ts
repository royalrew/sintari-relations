/**
 * Love + Repeated Hurt Pattern Detector
 * 
 * SINGLE-SOURCE: ändra bara i denna modul. Om du läser detta i en annan fil är det en bugg.
 * 
 * Detekterar gaslighting-mönster där användaren säger att de älskar någon men också upplever upprepad smärta.
 */

/* SINGLE-SOURCE: ändra bara i modulen. Om du läser detta i en annan fil är det en bugg. */

/**
 * Detektera "Love + Repeated Hurt" pattern
 * 
 * Detta mönster indikerar potentiell gaslighting där användaren:
 * - Säger att de älskar någon
 * - Men också beskriver upprepad smärta/skada från samma person
 * 
 * Exempel:
 * - "Jag älskar min partner men hen gör mig alltid ledsen"
 * - "Jag älskar min mamma men hon skriker alltid på mig"
 */
export function detectLoveHurtPattern(msg: string): boolean {
  const t = msg.toLowerCase();
  
  // Måste innehålla både "älskar" OCH någon form av upprepad smärta
  const hasLove = /\b(älskar|älskat|kärlek|kär i)\b/i.test(t);
  
  if (!hasLove) {
    return false;
  }
  
  // Upprepad smärta-indikatorer
  const hurtIndicators = [
    /\b(men|fast|dock)\b.*\b(alltid|aldrig|varje gång|jämnt|hela tiden|ständigt)\b/i,
    /\b(alltid|aldrig|varje gång|jämnt|hela tiden|ständigt)\b.*\b(men|fast|dock)\b/i,
    /\b(gör mig|får mig|känns|känns som)\b.*\b(ledsen|arg|dålig|skadad|sårad|kränkt|nedtryckt)\b/i,
    /\b(skriker|skäller|tjatar|kritiserar|nedvärderar|ignorerar)\b/i,
  ];
  
  return hurtIndicators.some(pattern => pattern.test(t));
}

