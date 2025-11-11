/**
 * Analysis Templates - Sammanfattande analysmallar baserat på känslostyrka
 * Används när samtalet naturligt "vänder" och behöver sammanfattning
 */

export interface AnalysisFacets {
  goal?: string;
  difficulty?: string;
  longing?: string;
  emotion?: string;
  context?: string;
}

export type AnalysisMood = 'light' | 'neutral' | 'heavy' | 'sad' | 'overwhelm' | 'shame';

/**
 * Extrahera facetter från konversation för analysmallar
 */
export function extractConversationFacets(
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>,
  insights?: any
): AnalysisFacets {
  const facets: AnalysisFacets = {};
  
  // Hämta från insights om tillgängligt
  if (insights) {
    // Goals från insights
    if (insights.goals && Array.isArray(insights.goals) && insights.goals.length > 0) {
      facets.goal = insights.goals[0]?.text || insights.goals[0];
    }
    
    // Patterns kan innehålla difficulty
    if (insights.patterns && Array.isArray(insights.patterns) && insights.patterns.length > 0) {
      const pattern = insights.patterns[0];
      if (typeof pattern === 'string') {
        facets.difficulty = pattern;
      } else if (pattern?.text) {
        facets.difficulty = pattern.text;
      }
    }
    
    // Communication insights kan innehålla emotion och context
    if (insights.communication) {
      if (insights.communication.emotion) {
        facets.emotion = insights.communication.emotion;
      }
      if (insights.communication.context) {
        facets.context = insights.communication.context;
      }
    }
  }
  
  // Fallback: Extrahera från konversationstext
  const userMessages = conversation
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join(' ');
  
  // Extrahera mål (jag vill, jag hoppas, jag önskar)
  if (!facets.goal) {
    const goalMatch = userMessages.match(/(?:jag\s+(?:vill|hoppas|önskar|skulle\s+vilja|tänker|planerar)\s+)([^.?!]+)/i);
    if (goalMatch) {
      facets.goal = goalMatch[1].trim();
    }
  }
  
  // Extrahera svårighet (svårt, problem, hindrar, skaver)
  if (!facets.difficulty) {
    const difficultyMatch = userMessages.match(/(?:det\s+(?:är|känns|verkar)\s+)([^.?!]+(?:svårt|tungt|jobbigt|hindrar|skaver|problem))/i);
    if (difficultyMatch) {
      facets.difficulty = difficultyMatch[1].trim();
    }
  }
  
  // Extrahera längtan (jag längtar efter, jag vill ha mer av)
  if (!facets.longing) {
    const longingMatch = userMessages.match(/(?:jag\s+(?:längtar\s+efter|vill\s+ha\s+mer\s+av|hoppas\s+på)\s+)([^.?!]+)/i);
    if (longingMatch) {
      facets.longing = longingMatch[1].trim();
    }
  }
  
  // Extrahera känsla (jag känner, jag mår)
  if (!facets.emotion) {
    const emotionMatch = userMessages.match(/(?:jag\s+(?:känner|mår|upplever)\s+)([^.?!]+)/i);
    if (emotionMatch) {
      facets.emotion = emotionMatch[1].trim();
    }
  }
  
  // Extrahera kontext (när, i situationer där)
  if (!facets.context) {
    const contextMatch = userMessages.match(/(?:när|i\s+situationer\s+(?:där|när)|vid)\s+([^.?!]+)/i);
    if (contextMatch) {
      facets.context = contextMatch[1].trim();
    }
  }
  
  return facets;
}

/**
 * Välj analysmall baserat på mood
 * Mappar micro_mood levels (light/neutral/plus/yellow/red) till analysmallar
 */
export function selectAnalysisTemplate(mood: AnalysisMood | 'yellow' | 'red' | 'plus'): 'soft' | 'deep' | 'grounding' {
  // Mappa micro_mood levels till analysmallar
  if (mood === 'light' || mood === 'neutral' || mood === 'plus') {
    return 'soft';
  }
  
  if (mood === 'heavy' || mood === 'sad' || mood === 'yellow') {
    return 'deep';
  }
  
  if (mood === 'overwhelm' || mood === 'shame' || mood === 'red') {
    return 'grounding';
  }
  
  // Fallback: använd soft för okända moods
  return 'soft';
}

/**
 * Renderera analysmall baserat på mood och facetter
 */
export function renderAnalysisTemplate(
  mood: AnalysisMood,
  facets: AnalysisFacets,
  persona?: { warmth?: number; formality?: number }
): string {
  const templateType = selectAnalysisTemplate(mood);
  const warmth = persona?.warmth || 0.6;
  const formality = persona?.formality || 0.4;
  
  // Ersätt placeholders med faktiska värden eller fallback
  const goal = facets.goal || "det du vill uppnå";
  const difficulty = facets.difficulty || "det som skaver eller hindrar";
  const longing = facets.longing || "det du hoppas få mer av";
  const emotion = facets.emotion || "känslan som kommer upp";
  const context = facets.context || "i situationer som triggar detta";
  
  switch (templateType) {
    case 'soft':
      return renderSoftTemplate(goal, difficulty, longing, warmth, formality);
    
    case 'deep':
      return renderDeepTemplate(emotion, context, longing, warmth, formality);
    
    case 'grounding':
      return renderGroundingTemplate(warmth, formality);
    
    default:
      return renderSoftTemplate(goal, difficulty, longing, warmth, formality);
  }
}

/**
 * ANALYS_SOFT: När stämningen är lugn / utforskande
 */
function renderSoftTemplate(
  goal: string,
  difficulty: string,
  longing: string,
  warmth: number,
  formality: number
): string {
  const intro = warmth >= 0.7
    ? "Jag tar med mig detta från vårt samtal:"
    : "Från vårt samtal:";
  
  const closing = warmth >= 0.7
    ? "Det låter som att du redan har tänkt mycket på detta – och att du vill något fint här."
    : "Det låter som att du har tänkt på detta.";
  
  const question = formality >= 0.7
    ? "Vilket av dessa alternativ känns mest hjälpsamt just nu?"
    : "Vilket känns mest hjälpsamt just nu?";
  
  return `${intro}

• Det som är viktigt för dig här är: ${goal}

• Det som skaver eller hindrar just nu är: ${difficulty}

• Det du hoppas få mer av framåt är: ${longing}

${closing}

Vi kan gå vidare på två sätt:

A) Utforska lite till vad som händer i de där stunderna

B) Testa ett litet, snällt mikro-steg i vardagen

${question}`;
}

/**
 * ANALYS_DEEP: När känslan är tyngre / sårbarhet finns
 */
function renderDeepTemplate(
  emotion: string,
  context: string,
  longing: string,
  warmth: number,
  formality: number
): string {
  const intro = warmth >= 0.7
    ? "Det här verkar betyda mycket för dig.\n\nJag hör både mod och trötthet i det du beskriver."
    : "Det här verkar betyda mycket för dig.";
  
  const summaryIntro = warmth >= 0.7
    ? "Jag sammanfattar varsamt vad vi rört vid:"
    : "Jag sammanfattar vad vi rört vid:";
  
  const validation = warmth >= 0.7
    ? "Det är helt rimligt att det känns mycket. Du bär detta med dig av en anledning."
    : "Det är rimligt att det känns mycket.";
  
  const question = formality >= 0.7
    ? "Vilket alternativ känns snällast mot dig just nu?"
    : "Vilket känns snällast mot dig just nu?";
  
  return `${intro}

${summaryIntro}

• Känslan som kommer upp är: ${emotion}

• Det brukar hända i situationer som: ${context}

• Och det du innerst inne längtar efter är: ${longing}

${validation}

Vi kan fortsätta på det sätt som känns tryggt:

A) Vi stannar i känslan och utforskar den långsamt, steg för steg

B) Jag hjälper dig med ett litet mikro-steg som lindrar trycket lite i stunden

${question}`;
}

/**
 * ANALYS_GROUNDING: Om personen är överväldigad / dissociation / hög stress
 */
function renderGroundingTemplate(
  warmth: number,
  formality: number
): string {
  const intro = warmth >= 0.7
    ? "Det blev mycket på en gång, och det är okej.\n\nVi tar det lugnt. Jag är här med dig."
    : "Det blev mycket på en gång. Vi tar det lugnt.";
  
  const body = warmth >= 0.7
    ? "Just nu verkar kroppen signalera något viktigt:\n\n• Kanske spänning\n\n• Kanske tryck i bröstet\n\n• Kanske tankar som rusar\n\nVi behöver inte lösa något direkt."
    : "Kroppen signalerar något. Vi behöver inte lösa något direkt.";
  
  const question = formality >= 0.7
    ? "Vill du göra en snabb, snäll 'landnings-övning' tillsammans?"
    : "Vill du göra en snabb landnings-övning?";
  
  const closing = warmth >= 0.7
    ? "Jag följer ditt tempo."
    : "";
  
  return `${intro}

${body}

${question}

A) Ja, vi gör den kort (30 sek)

B) Nej, hellre bara fortsätta prata i lugn takt

${closing}`;
}

