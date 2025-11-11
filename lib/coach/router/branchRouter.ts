/**
 * Branch Router - Single Source of Truth för anger/longing routing
 * 
 * SINGLE-SOURCE: ändra bara i denna modul. Om du läser detta i en annan fil är det en bugg.
 * 
 * Detta modul hanterar routing till anger- och longing-branches baserat på användarinput.
 * All routing-logik ska vara här - aldrig kopiera till andra filer.
 */

/* SINGLE-SOURCE: ändra bara i modulen. Om du läser detta i en annan fil är det en bugg. */

import { norm } from '../text/normalize';

/**
 * Anger branch triggers för intent routing
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
 * Anger regex patterns för robust matching (använder normaliserad text)
 */
export const ANGER_REGEX = [
  /\bsur\b/i,
  /\birriterad\b/i,
  /\barg\b/i,
  /\bfrustrerad\b/i,
  /\black\b/i,
  /\bprovocerad\b/i,
];

/**
 * Gräns-variationer för anger follow-up routing
 * Matchar: gräns, gransen, grans, gräns passerats, grans passerats, övertramp, etc.
 */
export const GRANS_RX = /\b(grans?|gransen|grans? passerats?|overtramp|gransoverskrid(en|it))\b/i;

/**
 * Longing branch triggers för intent routing
 */
export const LONGING_TRIGGERS = [
  "önskar",
  "saknar",
  "vill ha närhet",
  "vill bli hållen",
  "vill bli buren",
  "någon som håller om mig",
  "bli hörd",
  "bli sedd",
  "nära",
  "närhet",
] as const;

/**
 * Kontrollera om input matchar anger branch
 * Använder fuzzy matching för vanliga stavfel (t.ex. "iriterad", "frustred")
 */
export function isAngerBranchInput(text: string): boolean {
  const normalized = norm(text);
  
  // Direkt match mot triggers (normaliserade)
  if (ANGER_REGEX.some(rx => rx.test(normalized))) {
    return true;
  }
  
  // Fuzzy matching för vanliga stavfel (Levenshtein distance ≤ 1)
  const fuzzyAngerPatterns = [
    /iriterad/i,  // "iriterad" istället för "irriterad"
    /frustred/i,  // "frustred" istället för "frustrerad"
    /provcera/i,  // "provcera" istället för "provocerad"
  ];
  
  if (fuzzyAngerPatterns.some(p => p.test(normalized))) {
    return true;
  }
  
  return false;
}

/**
 * Kontrollera om input matchar longing branch
 */
export function isLongingBranchInput(text: string): boolean {
  const lower = text.toLowerCase();
  
  // Direkt match mot triggers
  if (LONGING_TRIGGERS.some(trigger => lower.includes(trigger))) {
    return true;
  }
  
  // Regex patterns för längtan-relaterade uttryck
  const longingPatterns = [
    /\b(saknar|sakna)\b/i,
    /\b(önskar|önskat)\b/i,
    /\b(vill.*nära|vill.*närhet)\b/i,
    /\b(vill.*hållen|vill.*buren)\b/i,
    /\b(någon.*håller|håller.*om)\b/i,
  ];
  
  if (longingPatterns.some(p => p.test(lower))) {
    return true;
  }
  
  return false;
}

/**
 * Detektera vilken branch input matchar (anger, longing, eller none)
 */
export function detectBranch(text: string): 'anger' | 'longing' | null {
  if (isAngerBranchInput(text)) {
    return 'anger';
  }
  if (isLongingBranchInput(text)) {
    return 'longing';
  }
  return null;
}

/**
 * Kontrollera om föregående svar var anger-relaterat (för follow-up routing)
 */
export function isAngerFollowup(lastReply: string): boolean {
  // Ta bort markdown-formatering för robust matching
  const cleaned = lastReply.replace(/\*\*/g, '').toLowerCase();
  
  return cleaned.includes('var känns det mest') ||
         cleaned.includes('bröstet, magen, halsen') ||
         cleaned.includes('tryck, värme eller brännande') ||
         cleaned.includes('knut, pirr eller spänning') ||
         cleaned.includes('en gräns passerats') ||
         cleaned.includes('gräns passerats') ||
         cleaned.includes('något varit orättvist') ||
         cleaned.includes('blivit överväldigad') ||
         cleaned.includes('ilska:') ||
         cleaned.includes('landar först i kroppen') ||
         cleaned.includes('bröstet bär mycket') ||
         cleaned.includes('magen försöker ofta') ||
         cleaned.includes('halsen bär ofta') ||
         cleaned.includes('säger ilska');
}

/**
 * Route anger follow-up inputs till rätt respons baserat på CSV-flödet
 * Använder normaliserad text för robust matching
 */
export function routeAngerFollowup(msg: string): string | null {
  const normalized = norm(msg);
  
  // A2: Kroppslokalisering
  if (/^(brost)$/i.test(normalized)) {
    return `Okej. Bröstet bär mycket. Om du andas långsamt där – känns det mer tryck, värme eller brännande?`;
  }
  if (/^(mage)$/i.test(normalized)) {
    return `Okej. Magen försöker ofta skydda. När du lägger handen där – känns det mer knut, pirr eller spänning?`;
  }
  if (/^(hals)$/i.test(normalized)) {
    return `Okej. Halsen bär ofta det som inte får komma ut. Känns det trångt, fastnat eller tomt?`;
  }
  if (/^(annanstans|oklart|vet inte)$/i.test(normalized)) {
    return `Okej. Vi tar det enkelt. Om du bara märker kroppen – känns ilskan mer som utåt-energi eller inåt-tryck?`;
  }
  
  // A3: Sensation quality → meaning triage
  if (/^(tryck|brannande|varme|knut|spanning|trangt|fastnat|tomt|utat|inat)$/i.test(normalized)) {
    return `Tack. Vi ska inte trycka bort det. Ibland säger ilska: 'något viktigt hände'. Känns det som att **en gräns passerats**, **något varit orättvist**, eller **att du blivit överväldigad**?`;
  }
  
  // A4: Meaning triage → path choice
  // Matchar: gräns, gransen, grans, gräns passerats, grans passerats, övertramp, etc.
  if (GRANS_RX.test(normalized) || /^(grans|gransen|grans passerats|overtramp)$/i.test(normalized)) {
    return `Okej. När en gräns gåtts över vill kroppen skydda dig. Vill du **stanna i känslan en stund** eller **utforska ett vänligt gräns-språk**?`;
  }
  if (/^(orattvist|orattvisa)$/i.test(normalized)) {
    return `Okej. Orättvisa svider. Ska vi **hålla om känslan först** eller **sätta ord på vad som blev skevt**?`;
  }
  if (/^(overvaldigad|overvaldigade)$/i.test(normalized)) {
    return `Okej. Då sänker vi tempot. Vill du **reglera kroppen** först eller **sätta ord efteråt**?`;
  }
  
  return null;
}

