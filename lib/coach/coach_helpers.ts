/**
 * Coach Helper Utilities
 * 
 * Micro-patchar och helper-funktioner för att säkerställa konsekvent ton och undvika reset-fraser.
 */

/**
 * Svarskalor för olika emotionella tillstånd
 * Används för att ge användaren enkla val utan press
 */
export const SCALES = {
  near_quality: ["mjuk", "varm", "hållande"],
  silence_quality: ["vänlig", "tom", "still"],
  sadness_quality: ["tyst", "tung"],
  body_location: ["bröstet", "magen", "halsen"],
  emotional_quality: ["trygg", "osäker", "blandad"],
} as const;

/**
 * Minimal "hållande" prefix - alltid tillgänglig när användaren behöver närvaro
 * Används när coachen behöver stanna i känslan utan att analysera
 */
export function holdingPrefix(): string {
  return `Okej.

Jag hör dig.

Vi tar det långsamt nu.

`;
}

/**
 * Skydds-normalisering - återanvänds i tom/avstånd/tung
 * Normaliserar att kroppen skyddar sig och att vi inte behöver pressa något
 */
export function normalizeProtection(line: string): string {
  return `${line}

Det där låter som att kroppen skyddar sig.

Vi behöver inte pressa något.`;
}

/**
 * Forbidden phrases som ALDRIG ska förekomma i längtan/närhet-grenen
 */
export const FORBIDDEN_PHRASES = [
  "vad vill du börja med?",
  "det känns oklart nu, jag är med.",
  "vill du ta fram ett första mini-steg",
  "vad händer oftast precis innan",
  "vill du fokusera på kommunikation, gränser eller närvaro",
] as const;

/**
 * Forbidden phrases som ALDRIG ska förekomma i ilska-grenen
 */
export const ANGER_FORBIDDEN = [
  "vad vill du börja med?",
  "det känns oklart nu, jag är med.",
  "vill du att vi tar fram ett första mini-steg",
  "härligt! det här betyder något för dig.",
] as const;

/**
 * Kontrollera om text innehåller förbjudna fraser
 */
export function containsForbiddenPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_PHRASES.some(phrase => lower.includes(phrase.toLowerCase()));
}

/**
 * Blockera förbjudna fraser i längtan-grenen
 * Kastar error om förbjuden fras hittas - detta tvingar systemet att använda CSV-flödet
 */
export function blockForbiddenInLongingBranch(text: string, branch: string): string {
  if (branch !== "longing") return text;
  
  if (containsForbiddenPhrase(text)) {
    console.error("[FORBIDDEN] Reset phrase detected in longing branch:", text);
    throw new Error("Forbidden fallback detected in longing-branch - must use CSV flow");
  }
  
  return text;
}

/**
 * Longing branch triggers för intent routing
 * Används tidigt i selectTemplate för att routa till längtan-grenen
 */
export const LONGING_TRIGGERS = [
  "önskar",
  "saknar",
  "vill ha närhet",
  "vill bli hållen",
  "vill bli buren",
  "någon som håller om mig",
  "bli hörd",
  "nära",
] as const;

/**
 * Regex patterns för längtan/närhet-detektion
 * Mer precist än enkel substring-match
 */
export const LONGING_REGEX = [
  /\bönskar\b/i,
  /\bsaknar\b/i,
  /höll\s+om\s+mig/i,
  /håller\s+om\s+mig/i,
  /hålla\s+om\s+mig/i,
  /bli\s+(hållen|buren)/i,
  /vill\s+ha\s+närhet/i,
  /\bnära\b/i,
  /vill\s+bli\s+hörd/i,
  /någon\s+som\s+håller/i,
  /\blängtar\b/i,
] as const;

/**
 * Kontrollera om text matchar längtan/närhet-grenen
 * Används för intent routing tidigt i selectTemplate
 */
export function isLongingBranchInput(text: string): boolean {
  const lower = text.toLowerCase();
  
  // Exakt regex match
  if (LONGING_REGEX.some(rx => rx.test(text))) {
    return true;
  }
  
  // Fallback: substring match med triggers
  return LONGING_TRIGGERS.some(trigger => lower.includes(trigger));
}

/**
 * Anger branch triggers för intent routing
 * Används tidigt i selectTemplate för att routa till ilska-grenen
 */
export const ANGER_TRIGGERS = [
  "sur",
  "irriterad",
  "arg",
  "frustrerad",
  "lack",
  "provocerad",
] as const;

/**
 * Regex patterns för ilska-detektion
 * Mer precist än enkel substring-match
 */
export const ANGER_REGEX = [
  /\bsur\b/i,
  /\birriterad\b/i,
  /\barg\b/i,
  /\bfrustrerad\b/i,
  /\black\b/i,
  /\bprovocerad\b/i,
] as const;

/**
 * Kontrollera om text matchar ilska-grenen
 * Används för intent routing tidigt i selectTemplate
 */
export function isAngerBranchInput(text: string): boolean {
  const lower = text.toLowerCase();
  
  // Exakt regex match
  if (ANGER_REGEX.some(rx => rx.test(text))) {
    return true;
  }
  
  // Fallback: substring match med triggers
  return ANGER_TRIGGERS.some(trigger => lower.includes(trigger));
}

/**
 * Blockera förbjudna fraser i ilska-grenen
 * Kastar error om förbjuden fras hittas - detta tvingar systemet att använda CSV-flödet
 */
export function blockForbiddenInAngerBranch(text: string, branch: string): string {
  if (branch !== "anger") return text;
  
  const lower = text.toLowerCase();
  if (ANGER_FORBIDDEN.some(phrase => lower.includes(phrase.toLowerCase()))) {
    console.error("[FORBIDDEN] Reset phrase detected in anger branch:", text);
    throw new Error("Forbidden fallback detected in anger-branch - must use CSV flow");
  }
  
  return text;
}

