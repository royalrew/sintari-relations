/**
 * Tone Fixer - Tar bort eko-fraser, lägger in kort empati, max 1 fråga
 */
export interface ToneFixParams {
  text: string;
  previousReplies?: string[];
  mood?: 'red' | 'yellow' | 'neutral' | 'plus';
}

/**
 * Fixar tonen: tar bort robot-fraser, lägger in empati, säkerställer max 1 fråga
 */
export function toneFix(params: ToneFixParams): string {
  let text = params.text;
  const previousReplies = params.previousReplies || [];
  const mood = params.mood || 'neutral';
  
  // 1) Ta bort eko-fraser (upprepning av användarens ord utan mervärde)
  text = removeEchoPhrases(text);
  
  // 2) Lägg in kort empati om mood är tyngre OCH texten saknar empati
  // OBS: Skippa detta om texten redan kommer från generateGround som har empati inbyggt
  // OBS: Känna även igen "Tack för att du säger det" och "Jag hör dig" som empati-fraser
  if ((mood === 'red' || mood === 'yellow') && !/(det låter som att|det verkar|det känns|jag hör|jag förstår|tack för att du säger|tack för att du delar)/i.test(text)) {
    text = addEmpathy(text, mood);
  }
  
  // 3) Säkerställ max 1 fråga
  text = limitQuestions(text, 1);
  
  // 4) Ta bort robot-fraser som "Jag hör att du säger hej"
  text = removeRobotPhrases(text, previousReplies);
  
  // 5) Ta bort dubbel empati-fraser (om de ändå uppstod)
  text = removeDuplicateEmpathy(text);
  
  return text.trim();
}

/**
 * Tar bort eko-fraser (upprepning utan mervärde)
 */
function removeEchoPhrases(text: string): string {
  // Ta bort överflödiga speglingar som bara upprepar
  // Ex: "Jag hör att hej" → "Hej"
  text = text.replace(/jag hör att\s+(hej|tjena|hallå)/gi, '$1');
  
  // Ta bort dubbel spegling
  text = text.replace(/(jag hör att|det låter som att)\s+(jag hör att|det låter som att)/gi, '$1');
  
  return text;
}

/**
 * Lägger in kort empati baserat på mood
 */
function addEmpathy(text: string, mood: 'red' | 'yellow' | 'neutral' | 'plus'): string {
  // Om texten redan innehåller empati-fraser, lägg inte till mer
  // Kolla både för "det låter som att" och "det känns" för att undvika dubbel empati
  // Känna även igen "Tack för att du säger det" och "Jag hör dig" som empati-fraser
  const hasEmpathy = /(det låter som att|det verkar|det känns|jag hör|jag förstår|tack för att du säger|tack för att du delar|jag hör dig)/i.test(text);
  
  if (hasEmpathy) {
    return text;
  }
  
  const empathyPhrases = {
    red: "Det låter som att det känns tungt. ",
    yellow: "Det låter som att det finns något som behöver uppmärksamhet. ",
    neutral: "",
    plus: "",
  };
  
  const empathy = empathyPhrases[mood];
  if (empathy && !text.toLowerCase().startsWith(empathy.toLowerCase().trim())) {
    return empathy + text;
  }
  
  return text;
}

/**
 * Begränsar antal frågor till max antal
 */
function limitQuestions(text: string, maxQuestions: number): string {
  const questionMatches = text.match(/\?/g);
  const questionCount = questionMatches ? questionMatches.length : 0;
  
  if (questionCount <= maxQuestions) {
    return text;
  }
  
  // Ta bort extra frågor (behåll första)
  const parts = text.split('?');
  if (parts.length > maxQuestions + 1) {
    const firstPart = parts.slice(0, maxQuestions).join('?') + '?';
    const rest = parts.slice(maxQuestions).join('?');
    return firstPart + rest.replace(/\?/g, '.');
  }
  
  return text;
}

/**
 * Tar bort dubbel empati-fraser
 */
function removeDuplicateEmpathy(text: string): string {
  // Pattern 1: Exakt upprepning av samma fras
  text = text.replace(/(Det låter som att det känns tungt[^.]*\.)\s+\1/gi, '$1');
  text = text.replace(/(Det verkar kännas tungt[^.]*\.)\s+\1/gi, '$1');
  text = text.replace(/(Det låter som att det finns något[^.]*\.)\s+\1/gi, '$1');
  
  // Pattern 2: Kombinationer av olika empati-fraser som säger samma sak om "tungt"
  // "Det låter som att det känns tungt" + "Det verkar kännas tungt" (i vilken ordning som helst)
  // Detta fångar även fall där första meningen saknar "just nu" men andra har det
  text = text.replace(/Det låter som att det känns tungt[^.]*\.\s+Det verkar kännas tungt[^.]*\./gi, 'Det låter som att det känns tungt just nu.');
  text = text.replace(/Det verkar kännas tungt[^.]*\.\s+Det låter som att det känns tungt[^.]*\./gi, 'Det låter som att det känns tungt just nu.');
  
  // Pattern 3: Variant där första meningen saknar "just nu" men andra har det
  // Ex: "Det låter som att det känns tungt. Det verkar kännas tungt just nu."
  text = text.replace(/(Det låter som att det känns tungt)([^.]*\.)\s+Det verkar kännas tungt[^.]*\./gi, 'Det låter som att det känns tungt just nu.');
  text = text.replace(/(Det verkar kännas tungt)([^.]*\.)\s+Det låter som att det känns tungt[^.]*\./gi, 'Det låter som att det känns tungt just nu.');
  
  // Pattern 4: Ta bort upprepning där samma känsla beskrivs två gånger med samma start
  // Ex: "Det låter som att det känns tungt. Det låter som att det känns tungt just nu."
  text = text.replace(/(Det låter som att det känns tungt)([^.]*\.)\s+\1[^.]*\./gi, '$1 just nu.');
  text = text.replace(/(Det verkar kännas tungt)([^.]*\.)\s+\1[^.]*\./gi, '$1 just nu.');
  
  // Pattern 5: Generell - om två meningar i rad börjar med empati-fraser om samma sak
  // Detta fångar även "Det känns tungt" + "Det låter som att det känns tungt"
  text = text.replace(/Det känns tungt[^.]*\.\s+(Det låter som att|Det verkar) det känns tungt[^.]*\./gi, 'Det låter som att det känns tungt just nu.');
  text = text.replace(/(Det låter som att|Det verkar) det känns tungt[^.]*\.\s+Det känns tungt[^.]*\./gi, 'Det låter som att det känns tungt just nu.');
  
  return text;
}

/**
 * Tar bort robot-fraser som användes nyligen
 */
function removeRobotPhrases(text: string, previousReplies: string[]): string {
  // Kolla om texten börjar med robot-fraser som användes nyligen
  const robotPhrases = [
    /^jag hör att du säger hej/i,
    /^jag hör att hej/i,
    /^det låter som att du säger hej/i,
  ];
  
  for (const phrase of robotPhrases) {
    if (phrase.test(text)) {
      // Kolla om denna fras användes nyligen
      const wasUsedRecently = previousReplies.some(prev => 
        phrase.test(prev.toLowerCase())
      );
      
      if (wasUsedRecently) {
        // Ersätt med något annat
        text = text.replace(phrase, '');
        text = text.trim();
        if (!text) {
          text = "Hej! Vad kan jag hjälpa dig med?";
        }
      }
    }
  }
  
  return text;
}

