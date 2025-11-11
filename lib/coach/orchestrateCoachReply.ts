/**
 * Orchestrate Coach Reply - Huvudorchestration för coach-svar
 * Pipeline: micro_mood → memory → persona_agent → insights → templates → tone_fixer → question_guard → gpt5_teacher → memory_ingest → calibration
 */
import { callMicroMood } from '@/backend/ai/py_bridge';
import { DialogMemoryV2 } from '@/lib/memory/dialog_memory_v2';
import { shouldUseMemory } from '@/lib/memory/memory_feature_flag';
import { selectTemplate, TemplateParams, generateExpandAlt, generateExpand } from './templates_v1';
import { toneFix } from './tone_fixer';
import { questionGuard } from './question_guard';
// Live-review är stängd av - batch-review körs manuellt via /api/coach/quality-teacher
import { callPersonaAgent, getCoachInsights, logCalibration } from './refinement_helpers';
import { join } from 'path';
import { existsSync } from 'fs';
import { FragAcc, shouldAccumulate, readyToAggregate, aggregateSummary } from './fragment_accumulator';
import { consolidateReply } from './templates_consolidate';
import { detectIntent, detectAngerIrritation, detectFormalGreeting, detectBodyLocation, detectBodyProtection, detectLonging, detectLongingSoft, detectWarmth, detectParentAnger, detectWantToBeHeld, detectWantToBeClose, detectSpecificPerson, detectWishForCloseness, detectSadness, detectSadnessSilence, detectEmptiness, detectHeavy, detectWantToBeCarried, detectMiddleAge, detectWaiting, detectWantToBeSeen, detectDontKnow, detectDistance, detectSlowApproach, detectFragile, detectAfraidToBreak } from './detectors';
import { isLongingBranchInput, isAngerBranchInput } from './coach_helpers';
// Router - Single Source of Truth för branch detection
import { detectBranch, isAngerFollowup, routeAngerFollowup } from './router/branchRouter';
// Policy - Single Source of Truth för forbidden phrases
import { enforceBranchPolicy } from './policy/branchPolicy';

export interface OrchestrateParams {
  userMessage: string;
  conversation: Array<{ role: 'user' | 'assistant'; content: string; ts?: number }>;
  threadId: string;
  language?: string;
  consent?: boolean;
  lastInsights?: any;
}

export interface OrchestrateResult {
  reply: string;
  mood?: {
    level: 'red' | 'yellow' | 'neutral' | 'plus';
    score: number;
  };
  memoryFacets?: string[];
  personaHints?: {
    warmth?: number;
    formality?: number;
  };
  teacherReview?: any;
  latency_ms: number;
  reply_meta?: { type?: string; key?: string; mood?: string }; // Reply metadata (för testning)
}

/**
 * Huvudorchestration för coach-svar
 */
export async function orchestrateCoachReply(params: OrchestrateParams): Promise<OrchestrateResult> {
  const startTime = Date.now();
  const { userMessage, conversation, threadId, language = 'sv', consent = true, lastInsights } = params;
  
  // Validera input
  if (!userMessage || typeof userMessage !== 'string') {
    throw new Error('userMessage is required and must be a string');
  }
  if (!threadId || typeof threadId !== 'string') {
    throw new Error('threadId is required and must be a string');
  }
  
  // 0) Fragment-ackumulering och CONSOLIDATE-check (tidigt i pipeline)
  // VIKTIGT: Skippa fragment-ackumulering för hälsningar (CASE-1-INTRO, CASE-1-FORMAL-GREETING) och surhet/irritation (CASE-2-SUR)
  // Hälsningar och känslor ska alltid hanteras direkt, inte som fragment
  let detectedIntent: ReturnType<typeof detectIntent> = 'generic';
  let isGreeting = false;
  let isAngerIrritation = false;
  let isFormalGreeting = false;
  
  try {
    detectedIntent = detectIntent(userMessage);
    isGreeting = detectedIntent === 'greeting';
    isAngerIrritation = detectAngerIrritation(userMessage);
    isFormalGreeting = detectFormalGreeting(userMessage);
  } catch (error) {
    // Om detectIntent kraschar, logga och fortsätt med generic
    console.warn('[ORCHESTRATE] detectIntent failed, using generic:', error);
    detectedIntent = 'generic';
  }
  
  // Kolla om användaren säger att en förälder är arg på dem
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-FÖRÄLDER-ARG
  const isParentAnger = detectParentAnger(userMessage);
  
  // Hämta senaste coach-svaret för att kunna detektera följdfrågor
  const lastCoachReply = conversation
    .filter(m => m.role === 'assistant')
    .slice(-1)[0]?.content || '';
  
  // Kolla om användaren uttrycker längtan efter att bli hållen/hållen om
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-VILL-BLI-HÅLLEN
  // Detta är kärnsårbarhet - coachen måste stanna i känslan, hålla den, mjukna, spegla, långsamma tempot
  const isWantToBeHeld = detectWantToBeHeld(userMessage);
  
  // Kolla om användaren svarar "nära" på CASE-VILL-BLI-HÅLLEN-frågan
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-NÄRA
  // Detta är en fördjupning i sårbarhet - coachen måste stanna i känslan, bekräfta längtan, hålla rummet, INTE försöka fixa något
  const isWantToBeClose = detectWantToBeClose(userMessage, lastCoachReply);
  
  // Kolla om användaren svarar "specifik" på CASE-NÄRA-frågan
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-SPECIFIK-PERSON
  // Detta är en fördjupning i attachment/relation - när användaren identifierar att det handlar om en specifik person, så måste coachen stanna i känslan, bekräfta längtan, hålla rummet, och fördjupa attachment-utforskningen
  const isSpecificPerson = detectSpecificPerson(userMessage, lastCoachReply);
  
  // Kolla om användaren svarar "önskar" på CASE-SPECIFIK-PERSON-frågan
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-ÖNSKAR
  // Detta är längtan framåt, ideal, inte minne bakåt - coachen ska följa spåret av längtan, INTE hoppa till problemlösning
  const isWishForCloseness = detectWishForCloseness(userMessage, lastCoachReply);
  
  const isFirstMessage = conversation.filter(m => m.role === 'user').length === 0;
  
  // Kolla om användaren svarar på anger_irritation-frågan ("Hur märker du det just nu – är det mer i tankarna, kroppen eller känslan?")
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-KROPPEN/TANKAR/KÄNSLAN
  const isAnsweringAngerIrritationQuestion = lastCoachReply.includes('Hur märker du det just nu') && 
                                             lastCoachReply.includes('tankarna, kroppen eller känslan');
  const isAngerIrritationFollowup = /(i kroppen|kroppen|kropp|i tankarna|tankarna|känslan|känslor)/i.test(userMessage);
  
  // Kolla om användaren svarar på kroppslokaliseringsfrågan ("var sitter det mest? Bröstet, magen, halsen...")
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-KROPPEN-LOKALISERING
  const isAnsweringBodyLocationQuestion = detectBodyLocation(userMessage, lastCoachReply);
  
  // Kolla om användaren säger att magen/kroppen skyddar något
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-MAGEN-SKYDDAR
  const isBodyProtection = detectBodyProtection(userMessage, lastCoachReply);
  
  // Kolla om användaren svarar "Saknad", "ledsenhet", eller "trötthet" på CASE-MAGEN-SKYDDAR-frågan
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-SAKNAD
  const isLonging = detectLonging(userMessage, lastCoachReply);
  
  // Kolla om användaren svarar "mjukt" på CASE-SAKNAD-frågan
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-SAKNAD-MJUK
  const isLongingSoft = detectLongingSoft(userMessage, lastCoachReply);
  
  // Kolla om användaren svarar "värme" på CASE-SAKNAD-MJUK-frågan
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-VÄRME
  const isWarmth = detectWarmth(userMessage, lastCoachReply);
  
  // Kolla om användaren svarar "ledsenhet" på CASE-FÖRÄLDER-ARG-frågan
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-LEDSENHET
  const isSadness = detectSadness(userMessage, lastCoachReply);
  
  // Kolla om användaren svarar "tyst" på CASE-LEDSENHET-frågan
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-LEDSENHET-TYSTNAD
  const isSadnessSilence = detectSadnessSilence(userMessage, lastCoachReply);
  
  // Kolla om användaren svarar "tom" på CASE-LEDSENHET-TYSTNAD-frågan
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-TOMHET
  const isEmptiness = detectEmptiness(userMessage, lastCoachReply);
  
  // Kolla om användaren svarar "tung" på CASE-LEDSENHET-frågan
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-TUNG
  const isHeavy = detectHeavy(userMessage, lastCoachReply);
  
  // Kolla om användaren svarar "bli buren" på CASE-TUNG-frågan
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-BLI-BUREN
  const isWantToBeCarried = detectWantToBeCarried(userMessage, lastCoachReply);
  
  // Kolla om användaren svarar "mellan" (ca 7-12 år) på CASE-BLI-BUREN-frågan
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-MELLAN
  const isMiddleAge = detectMiddleAge(userMessage, lastCoachReply);
  
  // Kolla om användaren svarar "väntar" på CASE-MELLAN-frågan
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-VÄNTAR
  const isWaiting = detectWaiting(userMessage, lastCoachReply);
  
  // Kolla om användaren svarar "bli sedd" på CASE-VÄNTAR-frågan
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-BLI-SEDD
  // Detta är kärn-attachment pivot, hjärtpunkt där AI:n måste vara varm & hållande, inte analytisk
  const isWantToBeSeen = detectWantToBeSeen(userMessage, lastCoachReply);
  
  // Kolla om användaren säger "vet inte" efter emotionella/terapeutiska frågor
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-VET-INTE
  // Detta är en av de viktigaste noderna i hela kedjan - modellen får INTE pressa, analysera, föreslå val eller styra uppåt i huvudet
  const isDontKnow = detectDontKnow(userMessage, lastCoachReply);
  
  // Kolla om användaren svarar "avstånd" på CASE-VET-INTE-frågan
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-AVSTÅND
  // Detta är den sista reflexpunkten i kedjan - modellen ska INTE analysera utan validera distans som skydd
  const isDistance = detectDistance(userMessage, lastCoachReply);
  
  // Kolla om användaren svarar "närmad långsamt" på CASE-AVSTÅND-frågan
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-NÄRMAD-LÅNGSAMT
  // Detta är själva läkningsögonblicket - den inre delen är mottaglig, den vill kontakt men försiktigt
  const isSlowApproach = detectSlowApproach(userMessage, lastCoachReply);
  
  // Kolla om användaren svarar "skört" på CASE-NÄRMAD-LÅNGSAMT-frågan
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-SKÖRT
  // Detta är den absolut viktigaste punkten - kärnsårbarhet där kontakt uppstår på riktigt
  const isFragile = detectFragile(userMessage, lastCoachReply);
  
  // Kolla om användaren svarar "rädd att gå sönder" på CASE-SKÖRT-frågan
  // Dessa svar ska INTE gå genom fragment-ackumulering - de ska gå direkt till selectTemplate för CASE-RÄDD-ATT-GÅ-SÖNDER
  // Detta är när vi är inne i kärnsårbarhet - coachen måste stanna, hålla känslan, INTE analysera, INTE gå vidare
  const isAfraidToBreak = detectAfraidToBreak(userMessage, lastCoachReply);
  
  // Om det är en hälsning (vanlig eller formell) ELLER surhet/irritation → skippa fragment-ackumulering och gå direkt till hantering
  // Särskilt viktigt för första hälsningen (CASE-1-INTRO, CASE-1-FORMAL-GREETING) och känslor (CASE-2-SUR)
  // OCH om användaren säger att en förälder är arg → skippa fragment-ackumulering för att fånga CASE-FÖRÄLDER-ARG
  // OCH om användaren uttrycker längtan efter att bli hållen/hållen om → skippa fragment-ackumulering för att fånga CASE-VILL-BLI-HÅLLEN
  // OCH om användaren svarar "nära" på CASE-VILL-BLI-HÅLLEN-frågan → skippa fragment-ackumulering för att fånga CASE-NÄRA
  // OCH om användaren svarar "specifik" på CASE-NÄRA-frågan → skippa fragment-ackumulering för att fånga CASE-SPECIFIK-PERSON
  // OCH om användaren svarar "önskar" på CASE-SPECIFIK-PERSON-frågan → skippa fragment-ackumulering för att fånga CASE-ÖNSKAR
  // OCH om användaren svarar "ledsenhet" → skippa fragment-ackumulering för att fånga CASE-LEDSENHET
  // OCH om användaren svarar "tyst" → skippa fragment-ackumulering för att fånga CASE-LEDSENHET-TYSTNAD
  // OCH om användaren svarar "tung" → skippa fragment-ackumulering för att fånga CASE-TUNG
  // OCH om användaren svarar "bli buren" → skippa fragment-ackumulering för att fånga CASE-BLI-BUREN
  // OCH om användaren svarar "mellan" → skippa fragment-ackumulering för att fånga CASE-MELLAN
  // OCH om användaren svarar "väntar" → skippa fragment-ackumulering för att fånga CASE-VÄNTAR
  // OCH om användaren svarar "bli sedd" → skippa fragment-ackumulering för att fånga CASE-BLI-SEDD
  // OCH om användaren säger "vet inte" → skippa fragment-ackumulering för att fånga CASE-VET-INTE
  // OCH om användaren svarar "avstånd" → skippa fragment-ackumulering för att fånga CASE-AVSTÅND
  // OCH om användaren svarar "närmad långsamt" → skippa fragment-ackumulering för att fånga CASE-NÄRMAD-LÅNGSAMT
  // OCH om användaren svarar "skört" → skippa fragment-ackumulering för att fånga CASE-SKÖRT
  // OCH om användaren svarar "rädd att gå sönder" → skippa fragment-ackumulering för att fånga CASE-RÄDD-ATT-GÅ-SÖNDER
  // OCH om användaren svarar "tom" → skippa fragment-ackumulering för att fånga CASE-TOMHET
  // OCH om användaren svarar på anger_irritation-frågan → skippa fragment-ackumulering för att fånga CASE-KROPPEN/TANKAR/KÄNSLAN
  // OCH om användaren svarar på kroppslokaliseringsfrågan → skippa fragment-ackumulering för att fånga CASE-KROPPEN-LOKALISERING
  // OCH om användaren säger att magen/kroppen skyddar något → skippa fragment-ackumulering för att fånga CASE-MAGEN-SKYDDAR
  // OCH om användaren svarar "Saknad"/"ledsenhet"/"trötthet" → skippa fragment-ackumulering för att fånga CASE-SAKNAD
  // OCH om användaren svarar "mjukt" → skippa fragment-ackumulering för att fånga CASE-SAKNAD-MJUK
  // OCH om användaren svarar "värme" → skippa fragment-ackumulering för att fånga CASE-VÄRME
  // OCH om användaren uttrycker längtan/närhet → skippa fragment-ackumulering för att fånga längtan-grenen
  // OCH om användaren uttrycker ilska → skippa fragment-ackumulering för att fånga ilska-grenen
  const isLongingBranch = isLongingBranchInput(userMessage);
  const isAngerBranch = isAngerBranchInput(userMessage);
  
  // 2.5) ANGER BRANCH FOLLOW-UP CHECK (FÖRE fragment accumulator)
  // Detta säkerställer att anger follow-up routing körs även om fragment accumulator är aktiv
  // VIKTIGT: Detta måste komma FÖRE fragment accumulator för att undvika generiska EXPAND-svar
  const lastReply = conversation
    .filter(m => m.role === 'assistant')
    .slice(-1)[0]?.content || '';
  
  let angerFollowupMatched = false;
  if (isAngerFollowup(lastReply)) {
    const angerResponse = routeAngerFollowup(userMessage);
    if (angerResponse) {
      // Anger follow-up matchad - hoppa över fragment accumulator
      angerFollowupMatched = true;
    }
  }
  
  if (isGreeting || isFormalGreeting || isAngerIrritation || isParentAnger || isWantToBeHeld || isWantToBeClose || isSpecificPerson || isWishForCloseness || isSadness || isSadnessSilence || isHeavy || isWantToBeCarried || isMiddleAge || isWaiting || isWantToBeSeen || isDontKnow || isDistance || isSlowApproach || isFragile || isAfraidToBreak || isEmptiness || (isAnsweringAngerIrritationQuestion && isAngerIrritationFollowup) || isAnsweringBodyLocationQuestion || isBodyProtection || isLonging || isLongingSoft || isWarmth || isLongingBranch || isAngerBranch || angerFollowupMatched) {
    // Gå direkt till normal pipeline för greeting, anger/irritation, förälder-arg, vill-bli-hållen, nära, specifik-person, önskar, ledsenhet, ledsenhet-tystnad, tung, bli-buren, mellan, väntar, bli-sedd, vet-inte, avstånd, närmad-långsamt, skört, rädd-att-gå-sönder, tomhet, anger_irritation followup, kroppslokalisering, kroppsskydd, saknad, saknad-mjuk, värme, längtan/närhet, ilska, eller anger follow-up
    // Fortsätt nedan utan fragment-ackumulering
  } else if (shouldAccumulate(threadId, userMessage)) {
    FragAcc.push(threadId, userMessage);
    
    // Om vi inte är redo att aggregera ännu, returnera ackumulerings-svar
    // Växla mellan EXPAND-variabler för att undvika upprepning
    if (!readyToAggregate(threadId)) {
      // Kolla om föregående coach-svar var EXPAND-variant
      const lastCoachReply = conversation
        .filter(m => m.role === 'assistant')
        .slice(-1)[0]?.content || '';
      
      const wasExpand = lastCoachReply.includes('Det känns oklart nu, jag är med') || 
                         lastCoachReply.includes('Jag hör dig. Vi tar det sakta');
      
      // VIKTIGT: Använd EXPAND-variant istället för "Jag är med. Säg gärna lite mer..."
      // Denna fras är borttagen från modellen - den är för abstrakt och pressar
      let accumulateReply = wasExpand 
        ? generateExpandAlt() // Variant 2 om föregående var EXPAND
        : generateExpand(); // Använd EXPAND istället för "Säg gärna lite mer"
      
      // Ta bort reply_meta från fragment-ackumuleringssvaret
      // VIKTIGT: Metadata ska ALDRIG visas för användaren
      accumulateReply = accumulateReply.replace(/<!--\s*reply_meta:[\s\S]*?-->/g, '').trim();
      accumulateReply = accumulateReply.replace(/\n\n+/g, '\n\n'); // Ta bort extra tomma rader
      
      return {
        reply: accumulateReply,
        mood: { level: 'neutral', score: 0.5 },
        latency_ms: Date.now() - startTime,
        reply_meta: undefined, // Inga reply_meta för fragment-ackumulering
      };
    }
    
    // Dags att konsolidera - samla fragment och generera CONSOLIDATE-svar
    const acc = FragAcc.get(threadId);
    const rawTexts = acc.frags.map(f => f.text);
    
    // Memory V2 (valfritt, om tillgängligt)
    let memoryTheme = "";
    const USE_MEMORY = process.env.MEMORY_V2 === 'on' && shouldUseMemory(threadId);
    if (USE_MEMORY) {
      try {
        const memoryPath = process.env.MEMORY_PATH || 'data/memory';
        if (existsSync(memoryPath) || existsSync(join(process.cwd(), memoryPath))) {
          const memory = await DialogMemoryV2.open(memoryPath);
          // Försök hämta tema från memory (om det finns en sådan metod)
          // För nu, använd en enkel heuristik baserat på memory facets
          const memCtx = await memory.retrieve({
            threadId,
            kEpisodic: 3,
            kSemantic: 5,
            queryText: rawTexts.join(' '),
          });
          
          if (memCtx && Array.isArray(memCtx) && memCtx.length > 0) {
            // Extrahera tema från första resultatet
            const firstResult = memCtx[0];
            if (firstResult?.facets?.topic) {
              memoryTheme = String(firstResult.facets.topic);
            }
          }
        }
      } catch (error) {
        console.debug('[ORCHESTRATE] Memory theme extraction failed (non-critical):', error);
      }
    }
    
    // Aggregera fragment till tema och sammanfattning
    const { summary, theme } = aggregateSummary(rawTexts);
    const mergedTheme = [memoryTheme, theme].filter(Boolean).join(", ").trim();
    
    // Generera CONSOLIDATE-svar
    let draft = consolidateReply(mergedTheme, summary);
    
    // Rensa fragment-ackumulator efter konsolidering
    FragAcc.clear(threadId);
    
    // Post-processing: tone fixer och question guard
    const previousReplies = conversation
      .filter(m => m.role === 'assistant')
      .map(m => m.content);
    
    draft = toneFix({
      text: draft,
      previousReplies,
      mood: 'neutral',
    });
    
    draft = questionGuard({
      text: draft,
      conversation,
    });
    
    // Ta bort reply_meta från CONSOLIDATE-svaret också
    // VIKTIGT: Metadata ska ALDRIG visas för användaren
    draft = draft.replace(/<!--\s*reply_meta:[\s\S]*?-->/g, '').trim();
    draft = draft.replace(/\n\n+/g, '\n\n'); // Ta bort extra tomma rader
    
    return {
      reply: draft,
      mood: { level: 'neutral', score: 0.5 },
      latency_ms: Date.now() - startTime,
      reply_meta: undefined, // CONSOLIDATE har inga reply_meta
    };
  }
  
  // 1) Micro Mood Detection
  let moodResult: any = null;
  try {
    // Validera language för att säkerställa korrekt typ
    const validLanguage = (language === 'sv' || language === 'en' || language === 'auto') ? language : 'sv';
    moodResult = await callMicroMood(userMessage, validLanguage, threadId);
  } catch (error) {
    console.warn('[ORCHESTRATE] Micro mood failed:', error);
    moodResult = { ok: true, level: 'neutral', score: 0.5 };
  }
  
  const mood = moodResult?.ok ? {
    level: (moodResult.level || 'neutral') as 'red' | 'yellow' | 'neutral' | 'plus',
    score: moodResult.score || 0.5,
  } : { level: 'neutral' as const, score: 0.5 };
  
  // 2) Memory Retrieval (om aktiverad)
  let memoryFacets: string[] = [];
  const USE_MEMORY = process.env.MEMORY_V2 === 'on' && shouldUseMemory(threadId);
  
  if (USE_MEMORY) {
    try {
      const memoryPath = process.env.MEMORY_PATH || 'data/memory';
      // Kontrollera om memory-path finns
      if (existsSync(memoryPath) || existsSync(join(process.cwd(), memoryPath))) {
        const memory = await DialogMemoryV2.open(memoryPath);
        const memCtx = await memory.retrieve({
          threadId,
          kEpisodic: 3,
          kSemantic: 5,
          queryText: userMessage,
        });
        
        // Extrahera facetter från memory
        if (memCtx && Array.isArray(memCtx)) {
          for (const item of memCtx) {
            const facets = item?.facets;
            if (facets && typeof facets === 'object') {
              for (const key of Object.keys(facets)) {
                if (facets[key] && !memoryFacets.includes(key)) {
                  memoryFacets.push(key);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('[ORCHESTRATE] Memory retrieval failed:', error);
    }
  }
  
  // 3) Persona Agent (om aktiverad)
  let personaHints: TemplateParams['persona'] = undefined;
  if (process.env.PERSONA_V1 === 'on') {
    try {
      const personaResult = await callPersonaAgent(userMessage, language);
      if (personaResult) {
        personaHints = {
          warmth: personaResult.warmth || 0.6,
          formality: personaResult.formality || 0.4,
        };
        console.log(`[ORCHESTRATE] Persona detected: warmth=${personaHints.warmth}, formality=${personaHints.formality}`);
      }
    } catch (error) {
      console.warn('[ORCHESTRATE] Persona agent failed:', error);
      personaHints = { warmth: 0.6, formality: 0.4 };
    }
  }
  
  // 4) Coach Insights (bakgrundsanalys - använd lastInsights om tillgängligt, annars hämta)
  let insights = lastInsights;
  if (!insights) {
    try {
      insights = await getCoachInsights(threadId, conversation);
    } catch (error) {
      console.warn('[ORCHESTRATE] Failed to get insights:', error);
      insights = {
        goals: [],
        patterns: [],
        communication: null,
      };
    }
  }
  
  // 5) Kolla om handoff till HR har accepterats eller om vi redan är i HR-läge
  const lastAssistantMsg = conversation
    .filter(m => m.role === 'assistant')
    .slice(-1)[0]?.content || '';
  const handoffAccepted = lastAssistantMsg.includes('handoff_accept') && lastAssistantMsg.includes('"to":"hr"');
  // Om något tidigare meddelande innehåller handoff_accept, fortsätt med HR
  const isInHRMode = conversation.some(m => 
    m.role === 'assistant' && 
    m.content.includes('handoff_accept') && 
    m.content.includes('"to":"hr"')
  );
  
  // Om handoff accepterats eller vi redan är i HR-läge, använd HR-router
  let reply: string;
  let intent: TemplateParams['intent'] = 'generic'; // Deklarera intent här så den är tillgänglig senare
  
  if (handoffAccepted || isInHRMode) {
    try {
      // Dynamisk import för att undvika build-time problem
      const hrModule = await import('../hr/engine/router_hr').catch(() => null);
      if (hrModule && hrModule.routeHR) {
        const hrResult = hrModule.routeHR({
          userMessage,
          conversation,
          intent: undefined,
          mood: mood.level,
          hints: insights,
        });
        reply = hrResult.reply;
        intent = 'generic'; // HR-läge använder generic intent
      } else {
        throw new Error('HR router module not available');
      }
    } catch (e) {
      // Fallback till coach om HR-router inte finns eller kraschar
      console.error('[ORCHESTRATE] HR router failed, falling back to coach:', e);
      try {
        intent = determineIntent(userMessage, mood, insights, conversation);
      } catch (error) {
        console.warn('[ORCHESTRATE] determineIntent failed in HR fallback:', error);
        intent = 'generic';
      }
      const templateParams: TemplateParams = {
        intent,
        mood: mood.level,
        hints: insights,
        persona: personaHints,
        userMessage,
        conversation,
      };
      try {
        reply = selectTemplate(templateParams);
      } catch (templateError) {
        console.error('[ORCHESTRATE] selectTemplate failed in HR fallback:', templateError);
        // Fallback till enkel reply från reply_core
        const { reply: simpleReply } = await import('./reply_core');
        reply = simpleReply({ intent: 'generic', mood: mood.level, slots: {} });
      }
    }
  } else {
    // 5) Bestäm intent (inkluderar summarize-logik)
    try {
      intent = determineIntent(userMessage, mood, insights, conversation);
    } catch (error) {
      console.warn('[ORCHESTRATE] determineIntent failed, using generic:', error);
      intent = 'generic';
    }
    
    // 6) Select Template
    const templateParams: TemplateParams = {
      intent,
      mood: mood.level,
      hints: insights,
      persona: personaHints,
      userMessage,
      conversation, // Lägg till för summarize-intent
    };
    
    try {
      reply = selectTemplate(templateParams);
    } catch (templateError) {
      console.error('[ORCHESTRATE] selectTemplate failed:', templateError);
      // Fallback till enkel reply från reply_core
      const { reply: simpleReply } = await import('./reply_core');
      reply = simpleReply({ intent: intent || 'generic', mood: mood.level, slots: {} });
    }
  }
  
  // 7) Tone Fixer
  const previousReplies = conversation
    .filter(m => m.role === 'assistant')
    .map(m => m.content);
  
  reply = toneFix({
    text: reply,
    previousReplies,
    mood: mood.level,
  });
  
  // 8) Question Guard (skippa för clarify, greeting och goal som alltid behöver frågor)
  if (intent !== 'clarify' && intent !== 'greeting' && intent !== 'goal') {
    reply = questionGuard({
      text: reply,
      conversation,
    });
  }
  
  // 8.5) Forbidden Phrase Gate för längtan/närhet-grenen och ilska-grenen
  // Detta säkerställer att "Vad vill du börja med?" ALDRIG läcker in i dessa grenar
  // Använd detectBranch för att identifiera vilken branch vi är i
  const currentBranch = detectBranch(userMessage) || 
    (conversation.some(m => 
      m.role === 'assistant' && 
      (m.content.includes('längtan') || 
       m.content.includes('närhet') || 
       m.content.includes('önskar') ||
       m.content.includes('bli hållen'))
    ) ? 'longing' : null) ||
    (conversation.some(m =>
      m.role === 'assistant' &&
      (m.content.includes('ilska') ||
       m.content.includes('sur') ||
       m.content.includes('irriterad') ||
       m.content.includes('arg') ||
       m.content.includes('Var känns det mest') ||
       m.content.includes('bröstet, magen, halsen') ||
       m.content.includes('tryck, värme eller brännande') ||
       m.content.includes('knut, pirr eller spänning') ||
       m.content.includes('en gräns passerats') ||
       m.content.includes('något varit orättvist') ||
       m.content.includes('blivit överväldigad'))
    ) ? 'anger' : null);
  
  // Enforce branch policy - kastar error om forbidden phrase hittas
  if (currentBranch) {
    try {
      reply = enforceBranchPolicy(reply, currentBranch);
    } catch (error) {
      // Om forbidden phrase hittades, logga och använd fallback
      console.error(`[FORBIDDEN] Reset phrase detected in ${currentBranch} branch:`, error);
      // Fallback: Använd branch-specifik respons istället för generisk reset
      if (currentBranch === 'longing') {
        reply = `Okej.

Jag hör dig.

Vi tar det långsamt nu.

Om du känner in det precis nu — var i kroppen känns det mest?`;
      } else if (currentBranch === 'anger') {
        reply = `Okej. Tack för att du säger det. Vi landar först i kroppen.

Var känns det mest just nu – bröstet, magen, halsen eller någon annanstans?`;
      }
    }
  }
  
  // 8.6) Extrahera reply_meta innan det tas bort (för testning)
  let replyMeta: { type?: string; key?: string; mood?: string } | undefined = undefined;
  const metaMatch = reply.match(/<!-- reply_meta:(.*?)-->/);
  if (metaMatch) {
    try {
      replyMeta = JSON.parse(metaMatch[1]);
    } catch (e) {
      // Ignorera parse-fel
    }
  }
  
  // Ta bort reply_meta från svaret innan det skickas till användaren
  // VIKTIGT: Metadata ska ALDRIG visas för användaren - det är developermetadata
  // Ta bort alla varianter: <!-- reply_meta:... -->, med eller utan newlines
  reply = reply.replace(/<!--\s*reply_meta:[\s\S]*?-->/g, '').trim();
  reply = reply.replace(/\n\n+/g, '\n\n'); // Ta bort extra tomma rader efter borttagning
  
  // 9) Batch Review Hook (endast om ENABLE_QUALITY_TEACHER === "batch")
  // Live-review är stängd av för att coachen ska vara stabil och konsekvent
  // Batch-review körs manuellt när du vill analysera konversationer via /api/coach/quality-teacher
  // Denna hook loggar endast minimal metadata för batch-analys (ingen GPT-anrop här)
  if (process.env.ENABLE_QUALITY_TEACHER === "batch") {
    // Emit minimal hook för offline/batch-analys; ingen UI, ingen await
    queueMicrotask(() => {
      try {
        // Lazy import för att inte påverka p95 latency
        import("@/lib/coach/telemetry").then(m => {
          // Logga minimal metadata för batch-analys
          // Teacher score fylls i senare vid manuell batch-review
          m.logCoachTelemetry({
            timestamp: new Date().toISOString(),
            threadId,
            userMessage,
            reply,
            latency_ms: Date.now() - startTime,
            safety_level: 'OK', // Sätts av safety_gate tidigare
            mood,
            teacher_score: undefined, // Batch fyller detta senare
            memory_facets_count: memoryFacets.length,
            question_count: (reply.match(/\?/g) || []).length,
            blocked: false,
            crisis_required: false,
          });
        }).catch(() => {
          // Silent fail - batch review är optional
        });
      } catch {
        // Silent fail
      }
    });
  }
  
  // 10) Memory Ingest (post)
  if (USE_MEMORY) {
    try {
      const memoryPath = process.env.MEMORY_PATH || 'data/memory';
      if (existsSync(memoryPath) || existsSync(join(process.cwd(), memoryPath))) {
        const memory = await DialogMemoryV2.open(memoryPath);
        await memory.ingest({
          threadId,
          text: userMessage,
          facets: {
            lang: language,
            topic: 'coach_chat',
            mood: mood.level,
            intent: intent,
          },
          ttlDays: 90,
          piiMask: true,
          speaker: 'user',
        });
      }
    } catch (error) {
      console.warn('[ORCHESTRATE] Memory ingest failed:', error);
    }
  }
  
  // 10) Calibration Logging (post, non-blocking)
  // Endast om batch-review är aktiverad och review finns
  // (Live-review är stängd av, så detta körs endast vid manuell batch-review)
  
  const latency_ms = Date.now() - startTime;
  
  return {
    reply,
    mood,
    memoryFacets,
    personaHints,
    // teacherReview tas bort - batch-review körs manuellt
    latency_ms,
    reply_meta: replyMeta, // Inkludera reply_meta för testning
  };
}

/**
 * Bestämmer intent från användarens meddelande
 * Inkluderar logik för summarize när samtalet naturligt "vänder"
 * 
 * VIKTIGT: Kontrollera mål FÖRE mood för att undvika att behandla mål som känslor
 */
function determineIntent(
  userMessage: string,
  mood: { level: string; score: number },
  insights: any,
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>
): TemplateParams['intent'] {
  const lower = userMessage.toLowerCase().trim();
  
  // Greeting - förbättrad matchning
  const greetingWords = ['hej', 'tjena', 'hallå', 'hejsan', 'hello', 'hi'];
  if (greetingWords.some(g => {
    const trimmed = lower.replace(/[!?.,]+$/g, ''); // Ta bort skiljetecken
    return trimmed === g || trimmed.startsWith(g + ' ');
  })) {
    return 'greeting';
  }
  
  // MÅL/UTVECKLING - Kontrollera FÖRST innan mood-check
  // Detta fångar mål som "Jag vill bli en bättre människa", "Jag vill kunna göra X"
  // OBS: Undvik att matcha känslomässiga uttryck som "Jag vill att det ska kännas bättre"
  const goalPatterns = [
    /jag vill (bli|vara|kunna|göra|få|ha|utveckla|förbättra|träna|öva|lära)/i,
    /jag försöker (bli|vara|kunna|göra|få|ha|utveckla|förbättra)/i,
    /jag strävar efter/i,
    /mitt mål är/i,
    /jag hoppas (bli|vara|kunna|göra|få|ha)/i,
    /jag önskar (bli|vara|kunna|göra|få|ha)/i,
  ];
  
  // Kontrollera om det är ett mål (men inte om det är känslomässigt)
  const isGoal = goalPatterns.some(pattern => pattern.test(userMessage));
  const isFeelingExpression = /känns|känsla|känslor|svårt|tungt|jobbigt|tråkigt|ledsen|arg|rädd|oro/i.test(userMessage);
  
  // Om det är ett mål OCH inte en känslomässig uttryck → goal
  if (isGoal && !isFeelingExpression) {
    return 'goal';
  }
  
  // Speak goal (tala inför folk, bli bättre talare) - specifik kategori
  if (/tala|talar|talare|prata inför|presentera|föreläsa/i.test(userMessage)) {
    return 'speak_goal';
  }
  
  // Ground (tyngre mood ELLER känslomässiga meddelanden)
  // OBS: Körs EFTER goal-check så att mål inte behandlas som känslor
  if (mood.level === 'red' || mood.level === 'yellow') {
    // Men bara om det INTE är ett mål
    if (!isGoal) {
      return 'ground';
    }
  }
  
  // Explicit matchning för känslomässiga meddelanden (känns, känsla, svårt, tungt, etc.)
  if (isFeelingExpression && !isGoal) {
    return 'ground';
  }
  
  // Clarify (kort/oklart meddelande)
  if (userMessage.length < 20 || /vad menar|hur menar|vad är|vad betyder/i.test(userMessage)) {
    return 'clarify';
  }
  
  // Summarize: När samtalet naturligt "vänder" (turn >= 4 och stabil konversation)
  const userTurnCount = conversation.filter(m => m.role === 'user').length;
  if (userTurnCount >= 4) {
    // Kolla om konversationen är stabil (flera utbyten, inte bara korta meddelanden)
    const recentMessages = conversation.slice(-6);
    const avgLength = recentMessages
      .filter(m => m.role === 'user')
      .reduce((sum, m) => sum + m.content.length, 0) / Math.max(1, recentMessages.filter(m => m.role === 'user').length);
    
    // Om medel-längd är rimlig (>30 tecken) och vi har haft ett samtal
    if (avgLength > 30) {
      // Kolla om användaren verkar vilja sammanfatta eller gå vidare
      const lower = userMessage.toLowerCase();
      if (/sammanfatta|sammanfattning|vad har vi|vad tar vi med|nästa steg|hur går vi/i.test(lower)) {
        return 'summarize';
      }
      
      // Eller om konversationen är lång och stabil, erbjud sammanfattning var 5:e tur
      if (userTurnCount % 5 === 0 && avgLength > 50) {
        return 'summarize';
      }
    }
  }
  
  // Generic (default)
  return 'generic';
}

/**
 * Targeted repair baserat på teacher feedback
 */
function targetedRepair(reply: string, lowEmpathy: boolean, lowClarity: boolean): string {
  if (lowEmpathy) {
    // Lägg till empati
    if (!/jag hör|jag förstår|det låter|det känns/i.test(reply)) {
      reply = "Jag hör dig. " + reply;
    }
  }
  
  if (lowClarity) {
    // Förtydliga frågan
    const questionMatch = reply.match(/([^?]*\?)/);
    if (questionMatch) {
      const question = questionMatch[1];
      const clearerQuestions: Record<string, string> = {
        "Vad känns det som?": "Vad känns det som när du tänker på det?",
        "Berätta mer.": "Kan du berätta mer om vad du menar?",
        "Hur ser det ut för dig?": "Hur ser det ut för dig just nu?",
      };
      
      if (clearerQuestions[question]) {
        reply = reply.replace(question, clearerQuestions[question]);
      }
    }
  }
  
  return reply;
}

