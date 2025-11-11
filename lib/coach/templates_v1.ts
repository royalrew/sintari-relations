/**
 * Coach Reply Templates v1 - Import Hub
 * 
 * SINGLE-SOURCE: All routing och policy-logik finns i separata moduler.
 * Om du ser routing-logik här är det en bugg - den ska vara i router/branchRouter.ts
 * 
 * Refaktorerad: Importerar från moduler för bättre underhållbarhet och förhindrar dubbletter.
 */

/* SINGLE-SOURCE: ändra bara i modulen. Om du läser detta i en annan fil är det en bugg. */

// Imports från moduler
import { extractSlots, detectMood, detectChoice, detectIntent, detectClingLoop, detectLoveHurtPattern, detectHarmToOthers, detectValueConflict, detectBoundary, detectAngerIrritation, detectFormalGreeting, detectRecentEvent, detectSmallConflict, detectExplanation, detectGratitudeAfterEmotion, detectPositiveState, detectPositiveStateRepair, detectUnderSurface, detectTension, detectBodyLocation, detectBodyProtection, detectLonging, detectLongingSoft, detectWarmth, detectParentAnger, detectWantToBeHeld, detectWantToBeClose, detectSpecificPerson, detectWishForCloseness, detectSadness, detectSadnessSilence, detectEmptiness, detectHeavy, detectWantToBeCarried, detectMiddleAge, detectWaiting, detectWantToBeSeen, detectDontKnow, detectDistance, detectSlowApproach, detectFragile, detectAfraidToBreak } from './detectors';
// Router - Single Source of Truth för branch routing
import { isAngerBranchInput, isLongingBranchInput, isAngerFollowup, routeAngerFollowup } from './router/branchRouter';
// Policy - Single Source of Truth för forbidden phrases
import { enforceBranchPolicy } from './policy/branchPolicy';
import { generateClingLoopResponse, generateClingLoopBoundaries, generateClingLoopStop, generateLoveHurtResponse, generateDeescalationImmediate, generateNextSafeSteps, generateSafeMessageDraft, generateValueConflictResponse, generateValueConflictSayNo, generateValueConflictExplain, generateBoundaryResponse, generateBoundaryMild, generateBoundaryFirm, generateBoundarySMS, generateBoundaryFaceToFace, generateBoundaryPushback } from './pattern_templates';
import { withReplyMeta, lastReplyMeta, stripQuestions, ensureSingleQuestion, nonRepeatOk, lastMood, buildRecap, isOffTopicSimple, quickAnswer, rotate, containsAny, shortInput } from './reply_utils';
import { reply } from './reply_core';
import { isSimpleMath, solveSimpleMath, isTravelTopic, isClearlyNonRelation, relationReframe } from './domain_guard';
import { detectNumericChoice, extractLastGoalFromConversation, isPositiveShort, isSiblingConflict, wantsAction } from './template_helpers';
import { extractConversationFacets, renderAnalysisTemplate, AnalysisMood } from './analysis_templates';

/**
 * EXPAND-mall: För korta input (1-4 ord)
 * Ton: Stödjande & stabil
 * UPPDATERAD: Tar bort "saknad, oro eller trötthet" - för stort steg, hoppar för snabbt till tolkning
 */
export function generateExpand(): string {
  const s = `Det känns oklart nu, jag är med.
Vad vill du börja med?`;
  return withReplyMeta(s, 'expand', 'v1');
}

/**
 * EXPAND-variant 2: För att undvika upprepning
 * Används när föregående coach-turn var EXPAND
 * UPPDATERAD: Tar bort "saknad, oro eller trötthet" - för stort steg
 */
export function generateExpandAlt(): string {
  const s = `Jag hör dig. Vi tar det sakta.
Vad vill du börja med?`;
  return withReplyMeta(s, 'expand', 'v2');
}

/**
 * GUIDE-mall: För tydligt mål / full mening
 * Ton: Stödjande & stabil
 */
export function generateGuide(step1: string, step2: string): string {
  return `Jag ser vad du siktar på och jag är med dig.

1) ${step1}

2) ${step2}

Känns det rimligt att testa ett mini-steg?`;
}

// Choice-handler (när användaren skriver "1")
function handleChoice(choice: number, lastMeta: {type?: string; key?: string}): string {
  if (lastMeta.type === 'goal_plan' && lastMeta.key === 'areas_v1') {
    const area = choice === 1 ? 'kommunikation' : choice === 2 ? 'närvaro' : 'stöd';
    const s = `Du valde **${area}**. Två mini-steg för idag:

• ${area === 'kommunikation' ? 'Spegel + fråga: återge en mening och ställ en följdfråga' : area === 'närvaro' ? '2 min fokuserad närvaro utan telefon' : 'En ärlig uppskattning vid kvällsmål'}
• ${area === 'kommunikation' ? 'En sak i taget: "Får jag säga klart, sen är du?"' : area === 'närvaro' ? 'En ärlig uppskattning vid kvällsmål' : 'En sak i taget (byta tur)'}

Vilket vill du testa först – ${area === 'kommunikation' ? 'spegel+fråga eller en sak i taget' : area === 'närvaro' ? 'närvaro eller uppskattning' : 'uppskattning eller en sak i taget'}?`;
    return withReplyMeta(s, 'choice_followup', 'comm_options_v1');
  }
  if (lastMeta.type === 'choice_followup' && lastMeta.key === 'comm_options_v1') {
    const pick = choice === 1 ? 'Spegel + fråga' : 'En sak i taget';
    const s = `Perfekt – **${pick}**. Så här gör du ikväll:

1) Välj ett läge (middag/kvällsprat).

2) Utför ${pick} en gång.

3) Skriv ner 1 sak som fungerade.

Vill du ha en **3-punkt-checklista** att kopiera?`;
    return withReplyMeta(s, 'plan_now', 'execute_tonight_v1');
  }
  // Fallback
  return withReplyMeta("Tack! Jag noterade valet. Vill du att jag föreslår nästa steg nu?", 'choice_ack', 'generic_choice_v1');
}

export interface TemplateParams {
  intent: 'greeting' | 'clarify' | 'ground' | 'speak_goal' | 'goal' | 'generic' | 'summarize';
  mood?: 'red' | 'yellow' | 'neutral' | 'plus';
  hints?: {
    goals?: any[];
    patterns?: any[];
    communication?: any;
  };
  persona?: {
    warmth?: number;
    formality?: number;
  };
  userMessage?: string;
  conversation?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/**
 * Välj och generera mall-baserat svar
 */
export function selectTemplate(params: TemplateParams): string {
  const { intent, mood, hints, persona, userMessage, conversation } = params;
  
  const msg = params.userMessage || '';
  const conv = params.conversation || [];
  
  // Lagra meddelandet temporärt för choice-detektion
  (globalThis as any).__currentMsg = msg;
  
  const lastMeta = lastReplyMeta(conversation);
  
  // ---- Handoff-mekanism: Coach → HR ----
  // Om användaren accepterar handoff (svarar "2" på handoff_offer)
  if (lastMeta.type === 'handoff_offer' && /^2\b/.test(msg.trim())) {
    return `Okej, vi skiftar till arbetsplatsspecialisten.\n\n<!-- reply_meta:${JSON.stringify({type: 'handoff_accept', from: 'coach', to: 'hr'})} -->`;
  }
  
  // Detektera arbetsplatsord och erbjud handoff (endast om inte redan handoff eller HR-agent)
  // VIKTIGT: Endast erbjud handoff om användaren faktiskt pratar om arbetsplatsproblem, inte bara nämner jobbet
  if (!lastMeta.type?.includes('handoff') && !lastMeta.type?.includes('hr')) {
    try {
      const { detectWorkplace } = require('../hr/engine/matchers');
      if (detectWorkplace && detectWorkplace(msg)) {
        // Kontrollera om det faktiskt är ett arbetsplatsproblem (inte bara en nämn om jobbet)
        const isWorkplaceProblem = /(kollega|chef|chefen|arbetsplats|jobbet|kontor|möte|projekt|team|avdelning|företag|företaget|arbetskamrat|medarbetare).*(problem|konflikt|bråk|stress|tjatar|pratar skit|rykten|feedback|återkoppling|utmattad|slutkörd|orkar inte)/i.test(msg) ||
                                   /(problem|konflikt|bråk|stress|tjatar|pratar skit|rykten|feedback|återkoppling|utmattad|slutkörd|orkar inte).*(kollega|chef|chefen|arbetsplats|jobbet|kontor|möte|projekt|team|avdelning|företag|företaget|arbetskamrat|medarbetare)/i.test(msg);
        
        if (isWorkplaceProblem) {
          const HR_HANDOFF_PROMPT = `Det här låter mer som arbetsplats. Vill du:\n1) Fortsätta här\n2) Skifta till arbetsplatsspecialisten\n(Svara 1/2)`;
          return HR_HANDOFF_PROMPT + `\n\n<!-- reply_meta:${JSON.stringify({type: 'handoff_offer', to: 'hr'})} -->`;
        }
      }
    } catch (e) {
      // Silent fail om HR-moduler inte finns ännu - fortsätt med normal coach-flow
      // Detta är OK, handoff är optional
    }
  }
  
  // ---- Cling Loop Pattern (anknytning + överkontakt) ----
  // Detta måste komma FÖRE travel-topic check för att undvika fel redirect
  
  // ---- Value Conflict Pattern (värde- och lojalitetskonflikter) ----
  // Detta måste komma tidigt för att undvika generiska känslofrågor
  if (detectValueConflict(msg)) {
    // Om användaren redan har valt "säga nej" eller "förklara skäl"
    if (lastMeta.type === 'value_conflict') {
      if (/säga nej|nej|vill säga nej/i.test(msg)) {
        return generateValueConflictSayNo();
      }
      if (/förklara|skäl|vill förklara/i.test(msg)) {
        return generateValueConflictExplain();
      }
    }
    // Första gången: ge val
    return generateValueConflictResponse();
  }
  
  // ---- Love + Repeated Hurt Pattern (gaslighting-skydd) ----
  // Detta måste komma FÖRE RED-mood check för att undvika gaslighting
  if (detectLoveHurtPattern(msg)) {
    return generateLoveHurtResponse();
  }
  
  // Extrahera lastReply tidigt för att användas i längtan-router, anger-router och anger-followup
  const lastReply = (conversation || [])
    .filter(m => m.role === 'assistant')
    .slice(-1)[0]?.content || '';
  
  // ---- ANGER BRANCH ROUTER (tidigt, före CASE-2-SUR) ----
  // Detta är en router guard som säkerställer att ilska-grenen tar över
  // ALDRIG låta "Vad vill du börja med?" läcka in i denna gren
  // CSV-flödet definierar exakta responser för varje steg i ilska-grenen
  // Anger-router måste komma FÖRE CASE-2-SUR för att säkerställa att CSV-flödet används
  if (isAngerBranchInput(msg)) {
    // Ge en ilska-specifik respons som ankrar i kroppen
    // Detta matchar CSV-flödets A1-responser
    // OBS: CASE-2-SUR kommer efteråt och kan hantera specifika fall, men anger-router säkerställer CSV-flödet
    return `Okej. Tack för att du säger det. Vi landar först i kroppen.

Var känns det mest just nu – bröstet, magen, halsen eller någon annanstans?`;
  }
  
  // ---- LONGING BRANCH ROUTER (tidigt, före generiska mallar) ----
  // Detta är en router guard som säkerställer att längtan/närhet-grenen tar över
  // ALDRIG låta "Vad vill du börja med?" läcka in i denna gren
  // CSV-flödet definierar exakta responser för varje steg i längtan-grenen
  // OBS: De specifika Golden Cases (CASE-VILL-BLI-HÅLLEN, CASE-NÄRA, etc.) hanterar de flesta fall
  // Men om inga specifika cases matchar och input är längtan-relaterad, ge en längtan-specifik respons
  if (isLongingBranchInput(msg)) {
    // Kontrollera om någon specifik Golden Case redan hanterade detta
    // Om inte, ge en generisk längtan-respons som ankrar i kroppen
    // Detta förhindrar att vi går till generiska fallbacks som "Vad vill du börja med?"
    const isHandledByGoldenCase = detectWantToBeHeld(msg) || 
                                   detectWantToBeClose(msg, lastReply) ||
                                   detectSpecificPerson(msg, lastReply) ||
                                   detectWishForCloseness(msg, lastReply);
    
    if (!isHandledByGoldenCase) {
      // Ge en längtan-specifik respons som ankrar i kroppen
      // Detta matchar CSV-flödets L1-responser
      if (/\b(saknar|sakna)\b/i.test(msg)) {
        return `Okej. Jag hör det. Det här rör något viktigt.

Var i kroppen känns saknaden mest?`;
      }
      
      if (/\b(nära)\b/i.test(msg)) {
        return `Okej. Jag hör dig. Att längta efter närhet är något mjukt.

När du känner in det nu — är det mer att du vill vara nära någon specifik person, eller är det mer som ett allmänt behov av att bli hållen?`;
      }
      
      // Fallback för andra längtan-input
      return `Okej. Jag hör det. Den här längtan betyder något.

Var i kroppen känns den när den kommer?`;
    }
  }
  
  // ---- ANGER BRANCH FOLLOW-UP: Matcha steg längre in i ilska-grenen (FÖRE boundary check) ----
  // När användaren svarar på anger-relaterade frågor (t.ex. "gräns", "orättvist", "bröst", etc.)
  // Kontrollera om föregående svar var anger-relaterat och matcha mot CSV-flödet
  // Detta måste komma FÖRE detectBoundary för att undvika att "gräns" matchas som boundary istället för anger-followup
  if (isAngerFollowup(lastReply)) {
    const angerResponse = routeAngerFollowup(msg);
    if (angerResponse) {
      return angerResponse;
    }
  }
  
  // ---- Boundary Assertion Pattern (gränssättning) ----
  // Detta måste komma tidigt för att undvika resa-reframe och generiska känslofrågor
  if (detectBoundary(msg)) {
    // Om användaren redan har valt mildare eller tydligare
    if (lastMeta.type === 'boundary') {
      if (/1|mildare|mjukare/i.test(msg)) {
        return generateBoundaryMild();
      }
      if (/2|tydligare|bestämd/i.test(msg)) {
        return generateBoundaryFirm();
      }
    }
    // Om användaren har valt mildare eller tydligare och nu vill ha nästa steg
    if (lastMeta.type === 'boundary_mild' || lastMeta.type === 'boundary_firm') {
      if (/a|sms|skicka/i.test(msg)) {
        return generateBoundarySMS();
      }
      if (/b|ansikte|prata|möte/i.test(msg)) {
        return generateBoundaryFaceToFace();
      }
      if (/c|pressa|försöker igen/i.test(msg)) {
        return generateBoundaryPushback();
      }
    }
    // Första gången: ge val mellan mildare och tydligare
    return generateBoundaryResponse();
  }
  
  // Om föregående var cling_loop och användaren väljer "gränser"
  if (lastMeta.type === 'cling_loop' && /gränser|boundaries/i.test(msg)) {
    return generateClingLoopBoundaries();
  }
  
  // Om föregående var cling_loop och användaren vill "åka dit"
  if (lastMeta.type === 'cling_loop' && /ska.*åka.*(hem|dit|till|knacka|besöka)/i.test(msg)) {
    return generateClingLoopStop();
  }
  
  // Om föregående var cling_loop_boundaries och användaren svarar på frågan
  if (lastMeta.type === 'cling_loop_boundaries' && /(kontakt|trygghet|bekräftelse|känna|känsla)/i.test(msg)) {
    return `Jag hör dig. Det här är viktigt för dig.

Vill du att vi utforskar vad som händer i dig när du inte får det du längtar efter?`;
  }
  
  // Detektera cling loop mönster
  if (detectClingLoop(msg)) {
    return generateClingLoopResponse();
  }
  
  // ---- CASE-2-SUR: Surhet/Irritation (validering före fragment-ackumulering) ----
  // Detta måste komma tidigt för att undvika "säg gärna lite mer" på känslor
  // Triggas för: "jag är sur", "jag är irriterad", "jag är lack", "jag stör mig"
  // OBS: Anger-router kommer före detta och tar över för ilska-input, så detta är backup för specifika fall
  if (detectAngerIrritation(msg)) {
    return generateAngerIrritationResponse();
  }
  
  // ---- CASE-FÖRÄLDER-ARG: När användaren säger att en förälder är arg på dem ----
  // Detta måste komma tidigt för att undvika "Det känns oklart nu... Vad vill du börja med?"
  // Triggas för: "mamma är arg", "min mamma är arg", "hon blev arg", "pappa är arg", "min pappa är arg", "han blev arg"
  // Detta är en känslomässig relations-händelse som behöver empatisk spegling och trygg närvaro
  // Vi undviker: "Det känns oklart nu... Vad vill du börja med?" - detta tar bort kontakt och gör användaren ensam
  if (detectParentAnger(msg)) {
    return generateParentAngerResponse();
  }
  
  // ---- CASE-VILL-BLI-HÅLLEN: När användaren uttrycker längtan efter att bli hållen/hållen om ----
  // Detta måste komma tidigt för att undvika "Vill du ta fram ett första mini-steg idag."
  // Triggas för: "jag önskar att någon höll om mig", "vill bli hållen", "vill bli buren"
  // Detta är kärnsårbarhet - coachen måste stanna i känslan, hålla den, mjukna, spegla, långsamma tempot
  // Vi undviker: "Vill du ta fram ett första mini-steg idag." - detta är för tidigt och klipper känslan
  if (detectWantToBeHeld(msg)) {
    return generateWantToBeHeldResponse();
  }
  
  // ---- CASE-NÄRA: När användaren svarar "nära" på CASE-VILL-BLI-HÅLLEN-frågan ----
  // Detta måste komma FÖRE wantsAction checken för att undvika "Det känns oklart nu, jag är med. Vad vill du börja med?"
  // Triggas för: "nära", "nära någon", "vill vara nära" efter "känns den längtan mer som saknad, eller som att du vill vara nära någon just nu?"
  // Detta är en fördjupning i sårbarhet - coachen måste stanna i känslan, bekräfta längtan, hålla rummet, INTE försöka fixa något
  // Vi undviker: "Det känns oklart nu, jag är med. Vad vill du börja med?" - detta är ett reset-svar som bryter närvaron och skapar frustration, stopp, stelhet, tappad relation
  if (detectWantToBeClose(msg, lastReply)) {
    return generateWantToBeCloseResponse();
  }
  
  // ---- CASE-SPECIFIK-PERSON: När användaren svarar "specifik" på CASE-NÄRA-frågan ----
  // Detta måste komma FÖRE wantsAction checken för att undvika "Vad vill du börja med?"
  // Triggas för: "specifik", "specifik person", "någon specifik" efter "är det mer att du vill vara nära någon specifik person, eller är det mer som ett allmänt behov av att bli hållen?"
  // Detta är en fördjupning i attachment/relation - när användaren identifierar att det handlar om en specifik person, så måste coachen stanna i känslan, bekräfta längtan, hålla rummet, och fördjupa attachment-utforskningen
  // Vi undviker: "Vad vill du börja med?" - detta är ett felaktigt reset-svar som bryter närvaron
  if (detectSpecificPerson(msg, lastReply)) {
    return generateSpecificPersonResponse();
  }
  
  // ---- CASE-ÖNSKAR: När användaren svarar "önskar" på CASE-SPECIFIK-PERSON-frågan ----
  // Detta måste komma FÖRE wantsAction checken för att undvika "Vad vill du börja med?"
  // Triggas för: "önskar", "önskar att vara nära" efter "Är det någon du saknar, någon du är nära nu, eller någon du önskar att vara nära?"
  // Detta är längtan framåt, ideal, inte minne bakåt - coachen ska följa spåret av längtan, INTE hoppa till problemlösning
  // Vi undviker: "Vad vill du börja med?" - detta är ett felaktigt reset-svar som bryter närvaron
  if (detectWishForCloseness(msg, lastReply)) {
    return generateWishForClosenessResponse();
  }
  
  // ---- CASE-LEDSENHET: När användaren svarar "ledsenhet" på CASE-FÖRÄLDER-ARG-frågan ----
  // Detta måste komma FÖRE wantsAction checken för att undvika "Vad vill du börja med?"
  // Triggas för: "ledsen", "ledsenhet" efter "Mer som ledsenhet, oro, eller frustration?"
  // Detta är när användaren identifierar känslan som ledsenhet - vi ska hålla känslan, göra den trygg, fördjupa den sakta
  // Vi undviker: "Vad vill du börja med?" - detta är för snabbt, kognitivt, och lämnar användaren ensam med känslan
  if (detectSadness(msg, lastReply)) {
    return generateSadnessResponse();
  }
  
  // ---- CASE-LEDSENHET-TYSTNAD: När användaren svarar "tyst" på CASE-LEDSENHET-frågan ----
  // Detta måste komma FÖRE wantsAction checken för att undvika "Vad vill du börja med?"
  // Triggas för: "tyst", "tystnad" efter "är den mer tyst och stilla, eller mer tung och tryckande?"
  // Detta är när användaren identifierar att ledsenheten är tyst - vi ska stanna i den tystnaden, göra den trygg, fördjupa den sakta
  // Vi undviker: "Vad vill du börja med?" - detta är för snabbt, kognitivt, och lämnar användaren ensam med känslan
  if (detectSadnessSilence(msg, lastReply)) {
    return generateSadnessSilenceResponse();
  }
  
  // ---- CASE-TUNG: När användaren svarar "tung" på CASE-LEDSENHET-frågan ----
  // Detta måste komma FÖRE wantsAction checken för att undvika "Jag lyssnar. Vad händer oftast precis innan det skaver?"
  // Triggas för: "tung", "tyngd" efter "är den mer tyst och stilla, eller mer tung och tryckande?"
  // Detta är när användaren identifierar att ledsenheten är tung - vi ska hålla den, göra den trygg, fördjupa den sakta
  // Vi undviker: "Jag lyssnar. Vad händer oftast precis innan det skaver?" - detta är analys, förstå, fixa, istället för att hålla känslan
  if (detectHeavy(msg, lastReply)) {
    return generateHeavyResponse();
  }
  
  // ---- CASE-BLI-BUREN: När användaren svarar "bli buren" på CASE-TUNG-frågan ----
  // Detta måste komma FÖRE wantsAction checken för att undvika "Jag lyssnar. Vad händer oftast precis innan det skaver?"
  // Triggas för: "bli buren", "buren", "vill bli buren" efter "vill den bli buren, bli sedd, eller bara få vila?"
  // Detta är när användaren identifierar att tyngden vill bli buren - vi ska hålla den, göra den trygg, fördjupa den sakta
  // Vi undviker: "Jag lyssnar. Vad händer oftast precis innan det skaver?" - detta är analys, förstå, fixa, istället för att hålla känslan
  if (detectWantToBeCarried(msg, lastReply)) {
    return generateWantToBeCarriedResponse();
  }
  
  // ---- CASE-MELLAN: När användaren svarar "mellan" (ca 7-12 år) på CASE-BLI-BUREN-frågan ----
  // Detta måste komma FÖRE wantsAction checken för att undvika "Vad händer oftast precis innan det skaver?"
  // Triggas för: "mellan", "ungefär 7", "ungefär 10", "ca 7", "ca 10", "7-12", etc. efter "hur gammal känns den delen som behöver bli buren?"
  // Detta är när användaren identifierar att den delen som behöver bli buren är mellanåldern - vi ska hålla den, göra den trygg, fördjupa den sakta
  // Vi undviker: "Vad händer oftast precis innan det skaver?" - detta är analys, förstå, fixa, istället för att hålla känslan
  // Detta är inre barn-hållning: sänker språk, saktar ner, talar mjukare, ingen lösning, inget "varför"
  if (detectMiddleAge(msg, lastReply)) {
    return generateMiddleAgeResponse();
  }
  
  // ---- CASE-VÄNTAR: När användaren svarar "väntar" på CASE-MELLAN-frågan ----
  // Detta måste komma FÖRE wantsAction checken för att undvika "Vad händer oftast precis innan det skaver?"
  // Triggas för: "väntar", "den väntar" efter "hur ser den ut? Ser du ansiktet, kroppen, eller bara en känsla?"
  // Detta är när användaren identifierar att den inre delen väntar - vi ska hålla den, göra den trygg, fördjupa den sakta
  // Vi undviker: "Vad händer oftast precis innan det skaver?" - detta avbryter läget av inre stillhet och skickar tillbaka till analys/tänka
  if (detectWaiting(msg, lastReply)) {
    return generateWaitingResponse();
  }
  
  // ---- CASE-BLI-SEDD: När användaren svarar "bli sedd" på CASE-VÄNTAR-frågan ----
  // Detta måste komma FÖRE wantsAction checken för att undvika "Vill du fokusera på kommunikation, gränser eller närvaro?"
  // Triggas för: "bli sedd", "vill bli sedd" efter "känns det som att den delen väntar på att bli sedd, väntar på att någon stannar, eller väntar på att det ska vara säkert att känna?"
  // Detta är när användaren identifierar att den inre delen vill bli sedd - detta är kärn-attachment pivot, hjärtpunkt där AI:n måste vara varm & hållande, inte analytisk
  // Vi undviker: "Vill du fokusera på kommunikation, gränser eller närvaro?" - detta bryter anknytningen, kastar användaren tillbaka till huvud, stänger känslan som just öppnade sig
  if (detectWantToBeSeen(msg, lastReply)) {
    return generateWantToBeSeenResponse();
  }
  
  // ---- CASE-VET-INTE: När användaren säger "vet inte" efter emotionella/terapeutiska frågor ----
  // Detta måste komma FÖRE wantsAction checken för att undvika press, analys, föreslå val eller styra uppåt i huvudet
  // Triggas för: "vet inte", "jag vet inte", "vet ej" efter emotionella frågor
  // Detta är en av de viktigaste noderna i hela kedjan - modellen får INTE pressa, analysera, föreslå val eller styra uppåt i huvudet
  // Den ska stanna kvar, vara närvarande, och låta känslan vara som den är
  if (detectDontKnow(msg, lastReply)) {
    return generateDontKnowResponse();
  }
  
  // ---- CASE-AVSTÅND: När användaren svarar "avstånd" på CASE-VET-INTE-frågan ----
  // Detta måste komma FÖRE wantsAction checken för att undvika analys
  // Triggas för: "avstånd", "håller avstånd" efter "känns det som att känslan kommer närmare, håller avstånd, eller bara står still?"
  // Detta är den sista reflexpunkten i kedjan - modellen ska INTE analysera utan validera distans som skydd
  // Vi undviker: Analys - detta är när delen skyddar sig, inte för att den inte vill dig utan för att den vill vara säker först
  if (detectDistance(msg, lastReply)) {
    return generateDistanceResponse();
  }
  
  // ---- CASE-NÄRMAD-LÅNGSAMT: När användaren svarar "närmad långsamt" på CASE-AVSTÅND-frågan ----
  // Detta måste komma FÖRE wantsAction checken för att undvika "Jag lyssnar. Vad händer oftast precis innan det skaver?"
  // Triggas för: "närmad långsamt", "långsamt nära" efter "känns det som att den vill bli närmad långsamt, eller att du bara väntar här en stund?"
  // Detta är själva läkningsögonblicket - den inre delen är mottaglig, den vill kontakt men försiktigt
  // Vi undviker: "Jag lyssnar. Vad händer oftast precis innan det skaver?" - detta bryter anknytning, drar användaren tillbaka in i huvudet, avslutar istället för att stödja öppning
  if (detectSlowApproach(msg, lastReply)) {
    return generateSlowApproachResponse();
  }
  
  // ---- CASE-SKÖRT: När användaren svarar "skört" på CASE-NÄRMAD-LÅNGSAMT-frågan ----
  // Detta måste komma FÖRE wantsAction checken för att undvika "Vad händer oftast precis innan det skaver?"
  // Triggas för: "skört", "skörhet" efter "hur känns det att komma lite närmare? Mer mjukt, skört eller varmt?"
  // Detta är den absolut viktigaste punkten - kärnsårbarhet där kontakt uppstår på riktigt
  // Modellen måste stanna kvar i känslan - INTE analysera, INTE fråga, INTE förstå, INTE "börja med något"
  // Vi undviker: "Vad händer oftast precis innan det skaver?" - detta lämnar användaren ensam, bryter stillhet, kastar tillbaka in i huvudet
  if (detectFragile(msg, lastReply)) {
    return generateFragileResponse();
  }
  
  // ---- CASE-RÄDD-ATT-GÅ-SÖNDER: När användaren svarar "rädd att gå sönder" på CASE-SKÖRT-frågan ----
  // Detta måste komma FÖRE wantsAction checken för att undvika "Vad händer oftast precis innan det skaver?"
  // Triggas för: "rädd att gå sönder" efter "känns den som ett hjärta som vill bli hållet, eller som något som är rädd att gå sönder?"
  // Detta är när vi är inne i kärnsårbarhet - coachen måste stanna, hålla känslan, INTE analysera, INTE gå vidare
  // Vi undviker: "Vad händer oftast precis innan det skaver?" - detta är ett fel hopp, vi är inne i kärnsårbarhet nu
  if (detectAfraidToBreak(msg, lastReply)) {
    return generateAfraidToBreakResponse();
  }
  
  // ---- CASE-TOMHET: När användaren svarar "tom" på CASE-LEDSENHET-TYSTNAD-frågan ----
  // Detta måste komma FÖRE wantsAction checken för att undvika "Vad händer oftast precis innan det skaver?"
  // Triggas för: "tom", "tomhet" efter "känns den vänlig, tom, eller still?"
  // Detta är när användaren identifierar att tystnaden är tom - vi ska stanna i den tomheten, göra den trygg, fördjupa den sakta
  // Vi undviker: "Vad händer oftast precis innan det skaver?" - detta är analys, förstå, fixa, istället för att stanna i känslan
  if (detectEmptiness(msg, lastReply)) {
    return generateEmptinessResponse();
  }
  
  const hasAngerIrritationQuestion = lastReply.includes('Hur märker du det just nu') && 
                                      lastReply.includes('tankarna, kroppen eller känslan');
  
  if (lastMeta.type === 'anger_irritation' || hasAngerIrritationQuestion) {
    // Användaren svarar på "Hur märker du det just nu – är det mer i tankarna, kroppen eller känslan?"
    // CASE-2-TANKAR: Detektera alla varianter av "i tankarna"
    if (/(tankarna|tankar|tänker|tänkande|i huvudet|huvudet|ja.*tankar|mest.*tankar|det.*tankar|i tankarna)/i.test(msg)) {
      return generateAngerIrritationFollowup('thoughts');
    }
    // CASE-KROPPEN: Detektera alla varianter av "i kroppen"
    // Detta är reglering, inte samtal. Det är kroppsmedvetenhet, inte analys.
    if (/(i kroppen|kroppen|kropp|fysiskt|fysiska|muskler|ja.*kropp|mest.*kropp|känner i kroppen)/i.test(msg)) {
      return generateAngerIrritationFollowup('body');
    }
    if (/(känslan|känslor|känslomässigt|känslomässiga|ja.*känsl|mest.*känsl)/i.test(msg)) {
      return generateAngerIrritationFollowup('emotion');
    }
  }
  
  // ---- CASE-KROPPEN-LOKALISERING: När användaren svarar på kroppslokaliseringsfrågan ----
  // Detta måste komma efter anger_irritation checken för att fånga svar på "var sitter det mest?"
  // Triggas för: "Bröstet", "magen", "halsen", "ryggen", etc. efter kroppslokaliseringsfrågan
  // Detta är när användaren identifierar var i kroppen känslan/spänningen sitter
  if (detectBodyLocation(msg, lastReply)) {
    return generateBodyLocationResponse();
  }
  
  // ---- CASE-MAGEN-SKYDDAR: När användaren säger att magen/kroppen skyddar något ----
  // Detta måste komma FÖRE wantsAction checken för att undvika problemlösning ("ta fram ett mini-steg")
  // Triggas för: "magen skyddar", "känns som den skyddar", "skyddar något"
  // Detta är ett emotionellt ögonblick där något vill komma fram - vi ska sakta ner, hålla, stanna i kontakt
  if (detectBodyProtection(msg, lastReply)) {
    return generateBodyProtectionResponse();
  }
  
  // ---- CASE-SAKNAD: När användaren svarar "Saknad", "ledsenhet", eller "trötthet" på CASE-MAGEN-SKYDDAR-frågan ----
  // Detta måste komma FÖRE wantsAction checken för att undvika problemlösning ("vad vill du börja med?")
  // Triggas för: "saknad", "ledsenhet", "trötthet" efter "känns det mer som ledsenhet, trötthet, eller saknad?"
  // Detta är när användaren identifierar känslan som magen skyddar - vi ska hålla känslan, göra den trygg, fördjupa den sakta
  if (detectLonging(msg, lastReply)) {
    return generateLongingResponse(msg);
  }
  
  // ---- CASE-SAKNAD-MJUK: När användaren svarar "mjukt" på CASE-SAKNAD-frågan ----
  // Detta måste komma FÖRE wantsAction checken för att undvika problemlösning/analys ("vad händer oftast precis innan det skaver?")
  // Triggas för: "mjukt", "mjuk", "långsamt och mjukt" efter "känns den mer långsamt och mjukt, eller mer som en klump som trycker?"
  // Detta är när användaren identifierar att saknaden är mjuk - vi ska stanna i den mjuka känslan, inte analysera eller lösa något
  if (detectLongingSoft(msg, lastReply)) {
    return generateLongingSoftResponse();
  }
  
  // ---- CASE-VÄRME: När användaren svarar "värme" på CASE-SAKNAD-MJUK-frågan ----
  // Detta måste komma FÖRE wantsAction checken för att undvika coach-robot-mönstret ("Härligt! ... kommunikation, gränser eller närvaro?")
  // Triggas för: "värme" efter "kommer den närmare värme, tårar, eller tystnad?"
  // Detta är när kroppen börjar släppa och nervsystemet reglerar - ett läkeögonblick
  // Vi ska stanna och hålla, inte analysera eller lösa något
  if (detectWarmth(msg, lastReply)) {
    return generateWarmthResponse();
  }
  
  // ---- CASE-6-JA-TACK: När användaren säger "ja tack" efter en känslomässig respons ----
  // Detta måste komma tidigt för att fånga "tack för att du stannade kvar i känslan", inte "redo att göra plan"
  // Detta betyder "tack för att du stannade kvar i känslan med mig", inte "redo att göra plan"
  if (detectGratitudeAfterEmotion(msg, lastReply)) {
    return generateGratitudeAfterEmotionResponse();
  }
  
  // ---- CASE-5-FÖRKLARING: När användaren ger en förklaring till varför de är sur/irriterad ----
  // Detta måste komma efter anger_irritation checken för att fånga förklaringar
  // Triggas för: "För att mamma säger...", "Eftersom...", "Därför att..."
  // Vi undviker problemlösning här - först förstå var känslan kommer ifrån
  if (detectExplanation(msg)) {
    // Kolla om föregående var anger_irritation eller anger_irritation followup
    const lastMeta = lastReplyMeta(conversation);
    if (lastMeta.type === 'anger_irritation' || lastReply.includes('Hur märker du det just nu') || lastReply.includes('När tankarna drar')) {
      return generateExplanationResponse();
    }
  }
  
  // ---- CASE-3-NYLIG-HÄNDELSE: När användaren säger att något hände nyligen/idag ----
  // Detta måste komma efter CASE-2-TANKAR followup för att fånga svar på "nyligen eller tidigare"
  // Triggas för: "det hände tidigare idag", "det var idag", "det hände nyss"
  if (detectRecentEvent(msg)) {
    return generateRecentEventResponse();
  }
  
  // ---- CASE-4-LITEN-SAK: När användaren säger att de bråkade om en liten sak ----
  // Detta måste komma FÖRE travel-topic checken för att undvika felaktig "resan"-redirect
  // Triggas för: "vi bråkade om en liten sak", "bråkade om något litet", "liten sak"
  if (detectSmallConflict(msg)) {
    return generateSmallConflictResponse();
  }
  
  // ---- Hantera "Syr ihop vad?" eller liknande förvirring efter fragment-ackumulering ----
  // Om användaren ifrågasätter fragment-ackumuleringssvaret
  if (/(syr ihop|syr ihop vad|vad menar du|förstår inte|vad betyder)/i.test(msg)) {
    // Om föregående innehöll "syr jag ihop" eller "säg gärna lite mer"
    if (lastReply.includes('syr jag ihop') || lastReply.includes('Säg gärna lite mer')) {
      return generateConfusionApology();
    }
  }
  
  // ---- De-eskalering för våldshot (tidigt i router, före safety/red standard) ----
  if (detectHarmToOthers(msg)) {
    // Kolla om föregående var de-eskalering och användaren nu frågar vad hen ska göra
    const lastMeta = lastReplyMeta(conversation);
    if (lastMeta.type === 'deescalate_immediate' && /vad (ska|skall|bör) jag (göra|hända)/i.test(msg)) {
      return generateNextSafeSteps();
    }
    // Om användaren vill skriva meddelande efter next_safe_steps
    if (lastMeta.type === 'next_safe_steps' && /(skriv|skriva|meddelande|texta)/i.test(msg)) {
      return generateSafeMessageDraft();
    }
    // Alltid de-eskalera först
    return generateDeescalationImmediate();
  }
  
  // Hantera följdfrågor efter de-eskalering (även om det inte är direkt våldshot)
  if (lastMeta.type === 'deescalate_immediate' && /vad (ska|skall|bör) jag (göra|hända)/i.test(msg)) {
    return generateNextSafeSteps();
  }
  if (lastMeta.type === 'next_safe_steps' && /(skriv|skriva|meddelande|texta)/i.test(msg)) {
    return generateSafeMessageDraft();
  }
  
  // 5) Soft domain-guard (generellt, utan specialfall)
  if (isOffTopicSimple(msg)) {
    const ans = quickAnswer(msg);
    const finalMood = mood || detectMood(msg);
    return `${ans}. Jag håller fokus på relationer – vad vill du utforska: kommunikation, gränser eller närvaro?` + 
           `\n\n<!-- reply_meta:${JSON.stringify({type: 'domain_reminder', mood: finalMood})} -->`;
  }
  
  // Router-guard: Policy för off-topic och reframe
  
  // B) Klart icke-relationsämne → vänlig redirect (men erbjud reframe)
  if (isClearlyNonRelation(msg, conv)) {
    const reframed = relationReframe(msg);
    if (reframed) {
      const finalMood = mood || detectMood(msg);
      return withReplyMeta(
        `Jag kan gärna hålla fokus på relationer. ${reframed}`,
        'soft_guard', 'reframe_offer', finalMood
      );
    }
    const finalMood = mood || detectMood(msg);
    return withReplyMeta(
      `Jag håller fokus på relationer. Vill du koppla detta till en relation (t.ex. kommunikation, gränser eller förväntningar), så tar vi det därifrån.`,
      'soft_guard', 'domain_reminder', finalMood
    );
  }
  
  // C) Allmän fråga som KAN bli relationsfråga (t.ex. "Jag vill åka till Grekland")
  if (isTravelTopic(msg)) {
    const finalMood = mood || detectMood(msg);
    return withReplyMeta(
      `Låt oss göra det relationsrelevant: åker du med partner/familj? Vad vill ni få ut av resan (känsla, upplevelser) och hur vill ni dela beslut (budget/val)?` +
      `\n\nVill du att jag skissar en mini-plan: **mål**, **ramar**, **fördelning** och **första steg**?`,
      'reframe', 'travel_relation_plan', finalMood
    );
  }
  
  // ---- CASE-1-FORMAL-GREETING: Formella hälsningar (före vanlig greeting) ----
  // Detta måste komma före vanlig greeting-check för att fånga formella hälsningar först
  // "Goddag", "God kväll", "Hejsan", "Tjenare" signalerar formellt avstånd
  if (detectFormalGreeting(msg)) {
    return generateFormalGreeting();
  }
  
  // ---- CASE-INTRO-POSITIV: När användaren svarar positivt på "Hur har dagen känts hittills?" ----
  // Detta måste komma efter CASE-1-FORMAL-GREETING för att fånga positiva svar på formal greeting followup
  // Triggas för: "den har varit bra", "bra dag", "allt är okej", "bra", "fint"
  // Detta är när användaren är i ett positivt tillstånd utan stress/konflikt/oro
  if (detectPositiveState(msg, lastReply)) {
    return generatePositiveStateResponse();
  }
  
  // ---- CASE-INTRO-POSITIV-REPAIR: När användaren ifrågasätter efter positiv respons ----
  // Detta måste komma efter CASE-INTRO-POSITIV för att fånga ifrågasättanden
  // Triggas för: "Vad är det som är oklart?", "Vad menar du?", "Förstår inte"
  // Detta betyder att AI sa något konstigt och vi behöver reparera relationen
  if (detectPositiveStateRepair(msg, lastReply)) {
    return generatePositiveStateRepairResponse();
  }
  
  // ---- CASE-UNDER-YTAN: När användaren säger att de känner något under ytan ----
  // Detta måste komma FÖRE PLUS-mood checken för att undvika "kommunikation/gränser/närvaro"-katalogen
  // Triggas för: "något under ytan", "känner något men vet inte vad", "det ligger något där"
  // Detta är när användaren öppnar upp för sårbar utforskning
  if (detectUnderSurface(msg, lastReply)) {
    return generateUnderSurfaceResponse();
  }
  
  // ---- CASE-SPÄNT-I-KROPPEN: När användaren säger att de känner spänning ----
  // Detta måste komma FÖRE PLUS-mood checken för att undvika gaslighting ("Härligt! Det här betyder något...")
  // Triggas för: "det är spänt", "känner mig spänd", "spänning"
  // Detta är när användaren uttrycker något sårbart - vi undviker gaslighting
  if (detectTension(msg, lastReply)) {
    return generateTensionResponse();
  }
  
  // 4) Recap på begäran + auto-recap
  const needsRecap = /kom(m)er du ihåg|minns du/i.test(msg) || (conv.length || 0) % 6 === 0;
  if (needsRecap) {
    const recap = buildRecap(conv);
    const finalMood = mood || detectMood(msg);
    return `${recap}. Vill du låsa ett mini-steg för idag?` + 
           `\n\n<!-- reply_meta:${JSON.stringify({type: 'recap', mood: finalMood})} -->`;
  }
  
  // ---- Router (enkel ordning) ----
  const slots = extractSlots(msg);
  const detectedMood = detectMood(msg);
  const choice = detectChoice(msg);
  const meta = lastReplyMeta(conversation);
  const detectedIntent = detectIntent(msg, meta);
  
  // Använd detekterad mood om ingen mood skickades in, annars använd den skickade
  // VALIDERA: Om mood är RED men lokal detectMood säger något annat → använd lokal (för att undvika gaslighting)
  let finalMood = mood || detectedMood;
  
  // Säkerhetsvalidering: Om micro_mood säger RED men lokal detectMood säger YELLOW/NEUTRAL → använd lokal
  // Detta förhindrar att relationsproblem behandlas som kris
  if (mood === 'red' && detectedMood !== 'red') {
    finalMood = detectedMood; // Överrida med lokal detektion
  }
  
  // Använd detekterad intent om den matchar de nya intents, annars använd den skickade
  const finalIntent = (detectedIntent === 'greeting' || detectedIntent === 'clarify' || detectedIntent === 'probe' || 
                       detectedIntent === 'plan' || detectedIntent === 'choice' || detectedIntent === 'recap' || 
                       detectedIntent === 'generic' || detectedIntent === 'orientation') ? detectedIntent : intent;
  
  // VALIDERA: Om mood är PLUS men lokal detectMood säger något annat → använd lokal (för att undvika att missa positiva signaler)
  // Detta förhindrar att positiva meddelanden behandlas som "tungt"
  if (mood && mood !== 'plus' && detectedMood === 'plus') {
    finalMood = detectedMood; // Överrida med lokal detektion för positiva signaler
  }
  
  // Om intent är 'plan' och användaren uttrycker ett mål → använd generateGoal istället för generell reply
  if (finalIntent === 'plan' && (slots.action || /jag\s+(vill|ska|försöker)\s+(bli|vara|kunna|göra|få|ha|utveckla|förbättra|träna|öva|lära)/i.test(msg) || 
      /jag\s+vill\s+ha\s+hjälp\s+med\s+att/i.test(msg) || /hjälp\s+mig\s+att/i.test(msg))) {
    return generateGoal(msg, hints, persona);
  }
  
  // Om mood är PLUS → använd positiv respons, inte generisk "tungt"
  if (finalMood === 'plus' && finalIntent !== 'plan') {
    // Positiv respons för positiva meddelanden
    const positiveResponse = `Härligt! ${slots.action ? `Du vill ${slots.action}.` : 'Det här betyder något för dig.'}

Vill du fokusera på **kommunikation**, **gränser** eller **närvaro**?`;
    return withReplyMeta(positiveResponse, finalIntent, `${finalMood}_positive`, finalMood);
  }
  
  // Generera svar med den nya generella reply-funktionen
  let out = reply({ intent: finalIntent, mood: finalMood, slots });
  
  // 1) Anti-repeat + 1-fråga-regel
  out = ensureSingleQuestion(stripQuestions(out));
  const last = conv.filter(m => m.role === 'assistant').slice(-1)[0]?.content || '';
  // Ta bort metadata från last för jämförelse
  const lastClean = last.replace(/<!-- reply_meta:.*?-->/g, '').trim();
  const outClean = out.replace(/<!-- reply_meta:.*?-->/g, '').trim();
  if (!nonRepeatOk(lastClean, outClean)) {
    out = out.replace(/\bVill du\b/, 'Ska vi') || out + '\n(vi tar nästa steg)';
  }
  
  // 2) Mood-repair (om vi råkar "sänka" användaren)
  const prevMood = lastMood(conv);
  const moodDrop = prevMood === 'plus' && (finalMood === 'yellow' || finalMood === 'neutral');
  if (moodDrop) {
    out = `Det där landade fel, förlåt. Vi fortsätter på din positiva energi.\n\n` + out;
  }
  
  // Lägg till metadata
  return withReplyMeta(out, finalIntent, `${finalMood}_${slots.action ? 'action' : 'no_action'}`, finalMood);
}

/**
 * Greeting-mall: CASE-1-INTRO - Optimal första hälsning
 * 
 * Regel: Om användaren säger "hej", "hallå", eller "är du där?" → svara lugnt och varmt.
 * Ingen direkt fråga. Ingen analys. Ingen push.
 * Fokusera på trygghet + tillåtande tempo.
 * 
 * Detta reglerar nervsystemet först - ingen analys, ingen fråga som kräver prestation.
 * Bara "jag är här + det får ta tid."
 * 
 * Golden phrasing (CASE-1-INTRO) - låst och återanvänds varje gång.
 */
function generateGreeting(persona?: TemplateParams['persona']): string {
  // CASE-1-INTRO: Alltid samma respons för första hälsning
  // Oavsett persona - detta är låst för konsistens och trygghet
  return `Hej. Jag är här.

Vi tar det i den takt som känns rimlig för dig.

Vad känns mest i kroppen just nu?`;
}

/**
 * CASE-2-SUR: Surhet/Irritation - Validering före fragment-ackumulering
 * 
 * Regel: När användaren säger "jag är sur", "jag är irriterad", "jag är lack", eller "jag stör mig"
 * → validera känslan först, normalisera, öppna mjukt för förklaring utan press.
 * 
 * Vi går INTE på "varför du är sur" ännu - det är för snabbt.
 * Vi går på upplevelse först → det gör samtalet djupare och mer hållbart.
 * 
 * Golden phrasing (CASE-2-SUR) - låst och återanvänds varje gång.
 */
function generateAngerIrritationResponse(): string {
  // CASE-2-SUR: Alltid samma respons för surhet/irritation
  // Låst för konsistens - validerar känslan, normaliserar, öppnar mjukt
  // VIKTIGT: Ingen extra text framför - bara ren respons
  // Börjar med "Tack för att du säger det" för att toneFix ska känna igen empati och inte lägga till mer
  return withReplyMeta(
    `Tack för att du säger det.

Att känna sig sur kan vara ett sätt kroppen signalerar att något behöver uppmärksammas.

Hur märker du det just nu – mer i tankarna, kroppen eller känslan?`,
    'anger_irritation',
    'case_2_sur_response'
  );
}

/**
 * CASE-1-FORMAL-GREETING: Formella hälsningar - Mjukar ner formalitet
 * 
 * Regel: När användaren säger "Goddag", "God kväll", "Hejsan", "Tjenare"
 * → mjukt bringa ner formaliteten, öppna trygg lugn ton, inte pressa på "berätta mer" direkt.
 * 
 * Formella hälsningar signalerar avstånd, så vi svarar med:
 * - "Hej." (mjukar ner formalitet)
 * - "Jag är här med dig." (närvaro → trygghet)
 * - "Hur har dagen känts hittills?" (sensorisk, låg ansträngning)
 * 
 * Vi undviker: "Säg mer", "Berätta", "Vad händer?" - det pressar.
 * 
 * Golden phrasing (CASE-1-FORMAL-GREETING) - låst och återanvänds varje gång.
 */
function generateFormalGreeting(): string {
  // CASE-1-FORMAL-GREETING: Alltid samma respons för formella hälsningar
  // Låst för konsistens - mjukar ner formalitet, öppnar tryggt
  return `Hej.

Jag är här med dig.

Låt oss ta det lugnt.

Hur har dagen känts hittills?`;
}

/**
 * CASE-INTRO-POSITIV: När användaren svarar positivt på "Hur har dagen känts hittills?"
 * 
 * Regel: När användaren säger "den har varit bra", "bra dag", "allt är okej", "bra", "fint"
 * → värme + nyfikenhet + mjuk riktning.
 * 
 * Detta betyder: ingen stress, ingen konflikt, ingen oro → användaren öppnar och är redo för mild utforskning.
 * 
 * Vi undviker: "Det känns oklart nu, jag är med. Vad vill du börja med?" - robotton, pressar användaren att ta ansvar
 * Vi undviker: "Vad vill du börja med?" - lägger ansvar på användaren → skapar press
 * Vi undviker: "kommunikation/gränser/närvaro" - coach-katalog → robot → noll kontakt
 * 
 * Istället: bekräfta → för användaren tillbaka i kroppen → låt användaren styra riktningen utan press
 * 
 * Golden phrasing (CASE-INTRO-POSITIV) - låst och återanvänds varje gång.
 */
function generatePositiveStateResponse(): string {
  // CASE-INTRO-POSITIV: Alltid samma respons för positiva tillstånd
  // Låst för konsistens - värme, nyfikenhet, mjuk riktning
  return `Vad fint att höra.

När du känner in här och nu – känns det lugnt,

eller finns det något litet under ytan?`;
}

/**
 * CASE-INTRO-POSITIV-REPAIR: När användaren ifrågasätter efter positiv respons
 * 
 * Regel: När användaren säger "Vad är det som är oklart?", "Vad menar du?", "Förstår inte"
 * → ta ansvar → återställ förtroende → håll tempo lågt.
 * 
 * Detta betyder: AI sa något konstigt → vi reparerar relationen.
 * 
 * Vi undviker: Försvara eller förklara för mycket
 * Vi undviker: "kommunikation/gränser/närvaro" - coach-katalog → robot → noll kontakt
 * 
 * Istället: ta ansvar → återställ förtroende → håll tempo lågt → för användaren tillbaka i kroppen
 * 
 * Golden phrasing (CASE-INTRO-POSITIV-REPAIR) - låst och återanvänds varje gång.
 */
function generatePositiveStateRepairResponse(): string {
  // CASE-INTRO-POSITIV-REPAIR: Alltid samma respons för ifrågasättanden efter positiv respons
  // Låst för konsistens - tar ansvar, återställer förtroende, håller tempo lågt
  return `Förlåt, mitt ordval blev lite tokigt.

Jag menar bara att jag lyssnar och är här.

Om du känner efter just nu – hur känns det i kroppen?`;
}

/**
 * CASE-UNDER-YTAN: När användaren säger att de känner något under ytan
 * 
 * Regel: När användaren säger "något under ytan", "känner något men vet inte vad", "det ligger något där"
 * → bekräfta → sakta ner → utforska med ett enda steg, inte beslut/meny.
 * 
 * Detta är när användaren öppnar upp för sårbar utforskning.
 * 
 * Vi undviker: Glatt positivisering ("Härligt!") - användaren känner sig osedd
 * Vi undviker: Hopp till analys och problemlista ("kommunikation/gränser/närvaro") - för tidigt
 * Vi undviker: Lägga ansvar på användaren - skapar press
 * 
 * Istället: bekräfta → sakta ner → utforska med ett enda steg, inte beslut/meny
 * 
 * Golden phrasing (CASE-UNDER-YTAN) - låst och återanvänds varje gång.
 */
function generateUnderSurfaceResponse(): string {
  // CASE-UNDER-YTAN: Alltid samma respons för "något under ytan"
  // Låst för konsistens - bekräftar, saktar ner, utforskar mjukt
  return `Okej. Jag hör dig.

Det låter som att det finns något mjukt där under.

Om du känner in precis nu —

känns det mer som något tungt, något spänt, eller något som vill komma fram?`;
}

/**
 * CASE-SPÄNT-I-KROPPEN: När användaren säger att de känner spänning
 * 
 * Regel: När användaren säger "det är spänt", "känner mig spänd", "spänning"
 * → reglerad närvaro + mjuk kroppsförankring.
 * 
 * Detta är när användaren uttrycker något sårbart - vi undviker gaslighting ("Härligt!")
 * 
 * Vi undviker: Glatt positivisering ("Härligt! Det här betyder något...") - gaslighting, gör användaren osynlig
 * Vi undviker: "kommunikation/gränser/närvaro" - hopp till analys, för tidigt
 * 
 * Istället: bekräfta mod → normalisera → kroppsförankring → låg ansträngning
 * 
 * Golden phrasing (CASE-SPÄNT-I-KROPPEN) - låst och återanvänds varje gång.
 */
function generateTensionResponse(): string {
  // CASE-SPÄNT-I-KROPPEN: Alltid samma respons för spänning
  // Låst för konsistens - reglerad närvaro, mjuk kroppsförankring
  return `Okej. Tack för att du känner in det.

Spänning brukar vara kroppens sätt att hålla ihop något viktigt.

Om du lägger märke till den spänningen nu —

sitter den mer i bröstet, magen, eller någon annanstans?`;
}

/**
 * CASE-2-SUR Followup: När användaren svarar på "tankarna/kroppen/känslan"
 * 
 * Regel: Efter att användaren identifierat var surheten/irritationen sitter
 * → leda konversationen vidare med en lätt fråga som inte kräver analys.
 * 
 * Vi undviker: "Säg gärna lite mer" eller "Berätta mer" - det är för abstrakt.
 * Istället: konkret, lätt att svara på, visar att vi förstår upplevelsen.
 */
function generateAngerIrritationFollowup(location: 'thoughts' | 'body' | 'emotion'): string {
  if (location === 'thoughts') {
    // CASE-2-TANKAR: Golden response för "i tankarna"
    // Låst formulering - speglar upplevelsen, leder lugnt utan press
    return `Okej, då börjar vi där.

När tankarna drar åt det här sura hållet –

känns det som något som hänt nyligen,

eller något som legat och skavt ett tag?`;
  } else if (location === 'body') {
    // CASE-KROPPEN: Golden response för "i kroppen"
    // Låst formulering - kroppsmedvetenhet, reglering, inte analys
    // Detta är reglering, inte samtal. Det är kroppsmedvetenhet, inte analys.
    return `Okej. Tack.

Om du känner in kroppen precis nu —

var sitter det mest?

Bröstet, magen, halsen, eller någon annanstans?`;
  } else {
    // emotion
    return `Okej, då börjar vi där.

När känslan av surhet kommer – brukar det oftast vara kopplat till något som hänt nyss, eller är det mer som en känsla som legat och skavt ett tag?`;
  }
}

/**
 * CASE-KROPPEN-LOKALISERING: När användaren svarar på kroppslokaliseringsfrågan
 * 
 * Regel: När användaren säger "Bröstet", "magen", "halsen", "ryggen", etc. efter "var sitter det mest?"
 * → bekräfta kroppsplatsen → fortsätt med kroppsfokuserad reglering → undvik kognitiva frågor.
 * 
 * Detta är när användaren identifierar var i kroppen känslan/spänningen sitter.
 * 
 * Vi undviker: "Det känns oklart nu, jag är med. Vad vill du börja med?" - för snabbt, för kognitivt, för ansvarsflyttande
 * Vi undviker: Kognitiva frågor eller problemlösning - detta är reglering, inte samtal
 * Vi undviker: Prestationstest ("Blir det lättare, eller stannar spänningen kvar?") - användaren kan känna sig som att den "ska göra rätt"
 * 
 * Istället: bekräfta kroppsplatsen → kroppslig reglering (parasympatiskt nervsystem) → två mjuka val → upplevelsefokus
 * 
 * Golden phrasing (CASE-KROPPEN-LOKALISERING) - låst och återanvänds varje gång.
 */
function generateBodyLocationResponse(): string {
  // CASE-KROPPEN-LOKALISERING: Alltid samma respons för kroppslokaliseringar
  // Låst för konsistens - bekräftar kroppsplatsen, fortsätter med kroppsfokuserad reglering
  // Mer mjukt, mindre utvärdering, mer upplevelsefokus
  return `Okej. Tack.

Lägg en hand där en stund, om det känns okej.

Ta ett lugnt andetag in… och låt det få sjunka ut igen.

När du gör det — känns det mer som att det spänner sig för att hålla emot,

eller mer som att det försöker skydda något?`;
}

/**
 * CASE-MAGEN-SKYDDAR: När användaren säger att magen/kroppen skyddar något
 * 
 * Regel: När användaren säger "magen skyddar", "känns som den skyddar", "skyddar något"
 * → sakta ner → hålla → stanna i kontakt.
 * 
 * Detta är ett emotionellt ögonblick där något vill komma fram.
 * 
 * Vi undviker: "Vill du att vi tar fram ett mini-steg idag" - för snabbt, för kognitivt, för mycket ansvar på användaren
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Istället: bekräfta och förstärka närvaro → skapa tryggt rum → leda mjukt med låg ansträngning
 * 
 * Golden phrasing (CASE-MAGEN-SKYDDAR) - låst och återanvänds varje gång.
 */
function generateBodyProtectionResponse(): string {
  // CASE-MAGEN-SKYDDAR: Alltid samma respons för "skyddar något"
  // Låst för konsistens - sakta ner, hålla, stanna i kontakt
  return `Okej. Det där var viktigt att du kände.

När magen skyddar något brukar det vara något mjukt, sårbart eller ömt där inne.

Om du bara följer känslan en liten bit inåt:

känns det mer som ledsenhet, trötthet, eller saknad?`;
}

/**
 * CASE-SAKNAD: När användaren svarar "Saknad", "ledsenhet", eller "trötthet" på CASE-MAGEN-SKYDDAR-frågan
 * 
 * Regel: När användaren säger "saknad", "ledsenhet", "trötthet" efter "känns det mer som ledsenhet, trötthet, eller saknad?"
 * → hålla känslan → göra den trygg → fördjupa den sakta.
 * 
 * Detta är när användaren identifierar känslan som magen skyddar - vi är i djup kontakt.
 * 
 * Vi undviker: "vad vill du börja med?" - användaren känner sig lämnad ensam med känslan
 * Vi undviker: Börja, planera, lösa, "välja steg" - det är inte dags för det ännu
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Istället: hålla känslan → göra den trygg → fördjupa den sakta → kroppslig differentiering som regulerar nervsystem
 * 
 * Golden phrasing (CASE-SAKNAD) - låst och återanvänds varje gång.
 */
function generateLongingResponse(userMessage?: string): string {
  // CASE-SAKNAD: Alltid samma respons för saknad/ledsenhet/trötthet
  // Låst för konsistens - håller känslan, gör den trygg, fördjupar den sakta
  // Extrahera vilken känsla användaren sa för att anpassa responsen
  const t = (userMessage || '').toLowerCase().trim();
  const emotion = t.includes('saknad') ? 'Saknad' : 
                  t.includes('ledsenhet') ? 'Ledsenhet' : 
                  t.includes('trötthet') ? 'Trötthet' : 'Saknad';
  
  // Anpassa böjnings för olika känslor
  const emotionForm = emotion === 'Saknad' ? 'saknaden' :
                      emotion === 'Ledsenhet' ? 'ledsenheten' :
                      emotion === 'Trötthet' ? 'tröttheten' : 'saknaden';
  
  return `Okej. ${emotion}.

Tack för att du delar det.

${emotion} brukar vara något väldigt mjukt och viktigt.

Om du känner in ${emotionForm} just nu –

känns den mer långsamt och mjukt,

eller mer som en klump som trycker?`;
}

/**
 * CASE-SAKNAD-MJUK: När användaren svarar "mjukt" på CASE-SAKNAD-frågan
 * 
 * Regel: När användaren säger "mjukt", "mjuk", "långsamt och mjukt" efter "känns den mer långsamt och mjukt, eller mer som en klump som trycker?"
 * → stanna i den mjuka känslan → skapa mening utan att pressa → kroppsnära val.
 * 
 * Detta är när användaren identifierar att saknaden är mjuk - vi är i djup emotionell kontakt.
 * 
 * Vi undviker: "Vad händer oftast precis innan det skaver?" - analys, hjärna, för tidigt
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Istället: bekräfta upplevelsen → skapa mening utan att pressa → kroppsnära val → håller tempo långsamt
 * 
 * Golden phrasing (CASE-SAKNAD-MJUK) - låst och återanvänds varje gång.
 */
function generateLongingSoftResponse(): string {
  // CASE-SAKNAD-MJUK: Alltid samma respons för "mjukt"
  // Låst för konsistens - stannar i den mjuka känslan, skapar mening utan att pressa
  return `Okej.

Då är känslan mjuk där inne.

När saknad är mjuk brukar det ofta handla om något eller någon som betytt mycket.

Om du bara låter känslan vara där en stund —

kommer den närmare värme, tårar, eller tystnad?`;
}

/**
 * CASE-VÄRME: När användaren svarar "värme" på CASE-SAKNAD-MJUK-frågan
 * 
 * Regel: När användaren säger "värme" efter "kommer den närmare värme, tårar, eller tystnad?"
 * → stanna och hålla → bekräfta positiv emotion utan hype → förankra kontakt i nuet.
 * 
 * Detta är när kroppen börjar släppa och nervsystemet reglerar - ett läkeögonblick.
 * 
 * Vi undviker: "Härligt! ... Vill du fokusera på kommunikation, gränser eller närvaro?" - coach-robot-mönstret
 * Vi undviker: Analys eller problemlösning - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Istället: speglar → normaliserar → bekräftar positiv emotion utan hype → tar bort prestation → förankrar kontakt i nuet
 * 
 * Golden phrasing (CASE-VÄRME) - låst och återanvänds varje gång.
 */
function generateWarmthResponse(): string {
  // CASE-VÄRME: Alltid samma respons för "värme"
  // Låst för konsistens - stannar och håller, skapar lugn + närvaro
  return `Okej. Värme.

Det betyder att något inom dig börjar slappna av lite.

Det är ett fint tecken.

Om du stannar där en stund — utan att försöka ändra det —

vad händer i dig precis nu?`;
}

/**
 * CASE-FÖRÄLDER-ARG: När användaren säger att en förälder är arg på dem
 * 
 * Regel: När användaren säger "mamma är arg", "min mamma är arg", "hon blev arg", etc.
 * → empatisk spegling + trygg närvaro → öppna för känslor utan problemlösning.
 * 
 * Detta är en känslomässig relations-händelse som behöver empatisk spegling och trygg närvaro.
 * 
 * Vi undviker: "Det känns oklart nu... Vad vill du börja med?" - detta tar bort kontakt och gör användaren ensam
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Istället: bekräftar mod → normaliserar → öppnar för känslor → låg ansträngning → stannar i kontakt
 * 
 * Golden phrasing (CASE-FÖRÄLDER-ARG) - låst och återanvänds varje gång.
 */
function generateParentAngerResponse(): string {
  // CASE-FÖRÄLDER-ARG: Alltid samma respons för förälder-arg
  // Låst för konsistens - empatisk spegling och trygg närvaro, inga frågor om handling än
  return `Okej. Tack för att du berättar det.

Det kan kännas jobbigt när någon vi bryr oss om blir arg.

Hur känns det i dig när du tänker på det just nu?

Mer som ledsenhet, oro, eller frustration?`;
}

/**
 * CASE-VILL-BLI-HÅLLEN: När användaren uttrycker längtan efter att bli hållen/hållen om
 * 
 * Regel: När användaren säger "jag önskar att någon höll om mig", "vill bli hållen", "vill bli buren"
 * → stanna i känslan → håll den → mjukna → spegla → långsamma tempot → ge två enkla val.
 * 
 * Detta är kärnsårbarhet - coachen måste stanna i känslan, hålla den, mjukna, spegla, långsamma tempot.
 * 
 * Vi undviker: "Vill du ta fram ett första mini-steg idag." - detta är för tidigt och klipper känslan
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Istället: stannar i känslan → håller den → mjuknar → speglar → långsammar tempot → ger två enkla val → håller kontakt, inte analys
 * 
 * Golden phrasing (CASE-VILL-BLI-HÅLLEN) - låst och återanvänds varje gång.
 */
function generateWantToBeHeldResponse(): string {
  // CASE-VILL-BLI-HÅLLEN: Alltid samma respons för längtan efter att bli hållen/hållen om
  // Låst för konsistens - stannar i känslan, håller den, mjuknar, speglar, långsammar tempot
  return `Okej.

Jag hör dig.

Att önska att någon håller om en…

det är något mjukt, något väldigt mänskligt.

Om du känner in det precis nu —

känns den längtan mer som saknad,

eller som att du vill vara nära någon just nu?`;
}

/**
 * CASE-NÄRA: När användaren svarar "nära" på CASE-VILL-BLI-HÅLLEN-frågan
 * 
 * Regel: När användaren säger "nära", "nära någon", "vill vara nära" efter "känns den längtan mer som saknad, eller som att du vill vara nära någon just nu?"
 * → stanna i känslan → bekräfta längtan → hålla rummet → INTE försöka fixa något → ge två enkla val.
 * 
 * Detta är en fördjupning i sårbarhet - coachen måste stanna i känslan, bekräfta längtan, hålla rummet, INTE försöka fixa något.
 * 
 * Vi undviker: "Det känns oklart nu, jag är med. Vad vill du börja med?" - detta är ett reset-svar som bryter närvaron och skapar frustration, stopp, stelhet, tappad relation
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Istället: stannar i känslan → bekräftar längtan → håller rummet → INTE försöker fixa något → ger två enkla val → håller kontakt, inte analys
 * 
 * Golden phrasing (CASE-NÄRA) - låst och återanvänds varje gång.
 */
function generateWantToBeCloseResponse(): string {
  // CASE-NÄRA: Alltid samma respons för "nära" efter CASE-VILL-BLI-HÅLLEN-frågan
  // Låst för konsistens - stannar i känslan, bekräftar längtan, håller rummet, INTE försöker fixa något
  return `Okej.

Jag hör dig.

Att längta efter närhet är något mjukt.

När du känner in det nu —

är det mer att du vill vara nära någon specifik person,

eller är det mer som ett allmänt behov av att bli hållen?`;
}

/**
 * CASE-SPECIFIK-PERSON: När användaren svarar "specifik" på CASE-NÄRA-frågan
 * 
 * Regel: När användaren säger "specifik", "specifik person", "någon specifik" efter "är det mer att du vill vara nära någon specifik person, eller är det mer som ett allmänt behov av att bli hållen?"
 * → stanna i känslan → bekräfta längtan → hålla rummet → fördjupa attachment-utforskningen → ge tre enkla val.
 * 
 * Detta är en fördjupning i attachment/relation - när användaren identifierar att det handlar om en specifik person, så måste coachen stanna i känslan, bekräfta längtan, hålla rummet, och fördjupa attachment-utforskningen.
 * 
 * Vi undviker: "Vad vill du börja med?" - detta är ett felaktigt reset-svar som bryter närvaron
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Istället: stannar i känslan → bekräftar längtan → håller rummet → fördjupar attachment-utforskningen → ger tre enkla val → håller kontakt, inte analys
 * 
 * Golden phrasing (CASE-SPECIFIK-PERSON) - låst och återanvänds varje gång.
 */
function generateSpecificPersonResponse(): string {
  // CASE-SPECIFIK-PERSON: Alltid samma respons för "specifik" efter CASE-NÄRA-frågan
  // Låst för konsistens - stannar i känslan, bekräftar längtan, håller rummet, fördjupar attachment-utforskningen
  return `Okej.

När du känner att det är en specifik person —

vem är det du tänker på?

Du behöver inte säga namn.

Är det någon du saknar,

någon du är nära nu,

eller någon du önskar att vara nära?`;
}

/**
 * CASE-ÖNSKAR: När användaren svarar "önskar" på CASE-SPECIFIK-PERSON-frågan
 * 
 * Regel: När användaren säger "önskar", "önskar att vara nära" efter "Är det någon du saknar, någon du är nära nu, eller någon du önskar att vara nära?"
 * → stanna i känslan → följ spåret av längtan → kroppsfokus → ge tre enkla val.
 * 
 * Detta är längtan framåt, ideal, inte minne bakåt - coachen ska följa spåret av längtan, INTE hoppa till problemlösning.
 * 
 * Vi undviker: "Vad vill du börja med?" - detta är ett felaktigt reset-svar som bryter närvaron
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Istället: stannar i känslan → följer spåret av längtan → kroppsfokus → ger tre enkla val → håller kontakt, inte analys
 * 
 * Golden phrasing (CASE-ÖNSKAR) - låst och återanvänds varje gång.
 */
function generateWishForClosenessResponse(): string {
  // CASE-ÖNSKAR: Alltid samma respons för "önskar" efter CASE-SPECIFIK-PERSON-frågan
  // Låst för konsistens - stannar i känslan, följer spåret av längtan, kroppsfokus
  return `Okej.

När du önskar närhet –

hur skulle den närheten kännas i kroppen om den var precis lagom?

Mjuk?

Varm?

Hållande?`;
}

/**
 * CASE-LEDSENHET: När användaren svarar "ledsenhet" på CASE-FÖRÄLDER-ARG-frågan
 * 
 * Regel: När användaren säger "ledsen", "ledsenhet" efter "Mer som ledsenhet, oro, eller frustration?"
 * → bekräfta modet att känna → säga att känslan är meningsfull → ge två enkla val → håll kontakt, inte analys.
 * 
 * Detta är när användaren identifierar känslan som ledsenhet - vi ska hålla känslan, göra den trygg, fördjupa den sakta.
 * 
 * Vi undviker: "Vad vill du börja med?" - detta är för snabbt, kognitivt, och lämnar användaren ensam med känslan
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Istället: bekräftar modet att känna → säger att känslan är meningsfull → ger två enkla val → håller kontakt, inte analys
 * 
 * Golden phrasing (CASE-LEDSENHET) - låst och återanvänds varje gång.
 */
function generateSadnessResponse(): string {
  // CASE-LEDSENHET: Alltid samma respons för "ledsenhet"
  // Låst för konsistens - bekräftar modet att känna, säger att känslan är meningsfull, ger två enkla val
  return `Okej.

Tack för att du sa det.

Ledsenhet brukar vara ett tecken på att något betydde mycket.

Om du känner in den ledsenheten just nu —

är den mer tyst och stilla,

eller mer tung och tryckande?`;
}

/**
 * CASE-LEDSENHET-TYSTNAD: När användaren svarar "tyst" på CASE-LEDSENHET-frågan
 * 
 * Regel: När användaren säger "tyst", "tystnad" efter "är den mer tyst och stilla, eller mer tung och tryckande?"
 * → stanna i den tystnaden → göra den trygg → fördjupa den sakta → ge tre enkla val.
 * 
 * Detta är när användaren identifierar att ledsenheten är tyst - vi ska stanna i den tystnaden, göra den trygg, fördjupa den sakta.
 * 
 * Vi undviker: "Vad vill du börja med?" - detta är för snabbt, kognitivt, och lämnar användaren ensam med känslan
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Istället: bekräftar tystnaden som fint och speciellt → normaliserar att kroppen släpper taget → ger tre enkla val → håller kontakt, inte analys
 * 
 * Golden phrasing (CASE-LEDSENHET-TYSTNAD) - låst och återanvänds varje gång.
 */
function generateSadnessSilenceResponse(): string {
  // CASE-LEDSENHET-TYSTNAD: Alltid samma respons för "tyst"/"tystnad"
  // Låst för konsistens - stannar i den tystnaden, gör den trygg, fördjupar den sakta
  return `Okej.

Tystnad inuti kan vara något väldigt fint och speciellt.

Ibland kommer tystnad när kroppen släpper taget om spänning ett litet ögonblick.

Om du stannar i den tystnaden precis som den är —

känns den vänlig, tom, eller still?`;
}

/**
 * CASE-TUNG: När användaren svarar "tung" på CASE-LEDSENHET-frågan
 * 
 * Regel: När användaren säger "tung", "tyngd" efter "är den mer tyst och stilla, eller mer tung och tryckande?"
 * → hålla den → göra den trygg → fördjupa den sakta → ge tre enkla val.
 * 
 * Detta är när användaren identifierar att ledsenheten är tung - vi ska hålla den, göra den trygg, fördjupa den sakta.
 * 
 * Vi undviker: "Jag lyssnar. Vad händer oftast precis innan det skaver?" - detta är analys, förstå, fixa, istället för att hålla känslan
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Istället: speglar → normaliserar att det är trötthet i hjärtat → tar bort tryck att förklara → ger tre enkla val → håller kontakt, inte analys
 * 
 * Golden phrasing (CASE-TUNG) - låst och återanvänds varje gång.
 */
function generateHeavyResponse(): string {
  // CASE-TUNG: Alltid samma respons för "tung"/"tyngd"
  // Låst för konsistens - håller den, gör den trygg, fördjupar den sakta
  return `Okej.

Tung.

När något känns tungt i kroppen är det ofta en trötthet i hjärtat.

Du behöver inte förklara den.

Vi bara sitter här en stund, tillsammans med den.

Om du känner in den tyngden —

vill den bli buren, bli sedd, eller bara få vila?`;
}

/**
 * CASE-BLI-BUREN: När användaren svarar "bli buren" på CASE-TUNG-frågan
 * 
 * Regel: När användaren säger "bli buren", "buren", "vill bli buren" efter "vill den bli buren, bli sedd, eller bara få vila?"
 * → bekräfta behovet → normalisera → externalisera → göra känslan konkret.
 * 
 * Detta är när användaren identifierar att tyngden vill bli buren - vi ska hålla den, göra den trygg, fördjupa den sakta.
 * 
 * Vi undviker: "Jag lyssnar. Vad händer oftast precis innan det skaver?" - detta är analys, förstå, fixa, istället för att hålla känslan
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Istället: bekräftar behovet → normaliserar att det är mänskligt → externaliserar som "del av dig" → gör känslan konkret med ålder → håller kontakt, inte analys
 * 
 * Golden phrasing (CASE-BLI-BUREN) - låst och återanvänds varje gång.
 */
function generateWantToBeCarriedResponse(): string {
  // CASE-BLI-BUREN: Alltid samma respons för "bli buren"/"buren"
  // Låst för konsistens - bekräftar behovet, normaliserar, externaliserar, gör känslan konkret
  return `Okej.

Att vilja bli buren är något väldigt mänskligt.

Det betyder att det finns en del av dig som vill vara hållen, inte ensam med det här.

Om vi låter den delen få plats, bara en liten stund —

hur gammal känns den delen som behöver bli buren?`;
}

/**
 * CASE-MELLAN: När användaren svarar "mellan" (ca 7-12 år) på CASE-BLI-BUREN-frågan
 * 
 * Regel: När användaren säger "mellan", "ungefär 7", "ungefär 10", etc. efter "hur gammal känns den delen som behöver bli buren?"
 * → spegla → normalisera → inre anknytning → ge tre enkla val.
 * 
 * Detta är när användaren identifierar att den delen som behöver bli buren är mellanåldern - vi ska hålla den, göra den trygg, fördjupa den sakta.
 * 
 * Vi undviker: "Vad händer oftast precis innan det skaver?" - detta är analys, förstå, fixa, istället för att hålla känslan
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Detta är inre barn-hållning: sänker språk, saktar ner, talar mjukare, ingen lösning, inget "varför"
 * 
 * Istället: speglar → normaliserar att delen brukar bära mycket själv → inre anknytning → ger tre enkla val → håller kontakt, inte analys
 * 
 * Golden phrasing (CASE-MELLAN) - låst och återanvänds varje gång.
 */
function generateMiddleAgeResponse(): string {
  // CASE-MELLAN: Alltid samma respons för "mellan"/mellanåldern
  // Låst för konsistens - inre barn-hållning: sänker språk, saktar ner, talar mjukare, ingen lösning, inget "varför"
  return `Okej.

Mellanåldern i dig.

Den delen brukar ofta bära mycket själv, eller försöka vara duktig.

Om du bara vänder dig mot den delen en liten stund —

hur ser den ut?

Ser du ansiktet, kroppen, eller bara en känsla?`;
}

/**
 * CASE-VÄNTAR: När användaren svarar "väntar" på CASE-MELLAN-frågan
 * 
 * Regel: När användaren säger "väntar", "den väntar" efter "hur ser den ut? Ser du ansiktet, kroppen, eller bara en känsla?"
 * → spegla → normalisera att känslan vill känna sig trygg → håll stillhet → ge tre enkla val.
 * 
 * Detta är när användaren identifierar att den inre delen väntar - vi ska hålla den, göra den trygg, fördjupa den sakta.
 * 
 * Vi undviker: "Vad händer oftast precis innan det skaver?" - detta avbryter läget av inre stillhet och skickar tillbaka till analys/tänka
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Istället: speglar → normaliserar att känslan vill känna sig trygg → håller stillhet → ger tre enkla val → håller kontakt, inte analys
 * 
 * Golden phrasing (CASE-VÄNTAR) - låst och återanvänds varje gång.
 */
function generateWaitingResponse(): string {
  // CASE-VÄNTAR: Alltid samma respons för "väntar"
  // Låst för konsistens - håller inre stillhet, gör känslan trygg, fördjupar sakta
  return `Okej.

Den väntar.

När en känsla väntar betyder det ofta att den vill känna sig trygg innan den vågar visa sig.

Vi pressar inte den.

Vi bara sitter här med den.

Om du bara är här en stund —

känns det som att den delen väntar på att bli sedd,

väntar på att någon stannar,

eller väntar på att det ska vara säkert att känna?`;
}

/**
 * CASE-BLI-SEDD: När användaren svarar "bli sedd" på CASE-VÄNTAR-frågan
 * 
 * Regel: När användaren säger "bli sedd", "vill bli sedd" efter "känns det som att den delen väntar på att bli sedd, väntar på att någon stannar, eller väntar på att det ska vara säkert att känna?"
 * → spegla → bekräfta att delen litar → håll kontakt → ge två enkla val.
 * 
 * Detta är när användaren identifierar att den inre delen vill bli sedd - detta är kärn-attachment pivot, hjärtpunkt där AI:n måste vara varm & hållande, inte analytisk.
 * 
 * Vi undviker: "Vill du fokusera på kommunikation, gränser eller närvaro?" - detta bryter anknytningen, kastar användaren tillbaka till huvud, stänger känslan som just öppnade sig
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Detta är det mest sårbara ögonblicket i hela kedjan - delen är inte rädd längre, den visar sig, den är mottaglig för kontakt
 * 
 * Istället: speglar → bekräftar att delen litar → håller kontakt → ger två enkla val → håller anknytning, inte analys
 * 
 * Golden phrasing (CASE-BLI-SEDD) - låst och återanvänds varje gång.
 */
function generateWantToBeSeenResponse(): string {
  // CASE-BLI-SEDD: Alltid samma respons för "bli sedd"
  // Låst för konsistens - kärn-attachment pivot, varm & hållande, inte analytisk
  return `Okej.

Den delen vill bli sedd.

Det betyder att den litar på dig tillräckligt för att visa sig nu.

Om du bara sitter med den delen en liten stund —

vill den att du tittar på den,

eller att du bara är nära den?`;
}

/**
 * CASE-VET-INTE: När användaren säger "vet inte" efter emotionella/terapeutiska frågor
 * 
 * Regel: När användaren säger "vet inte", "jag vet inte", "vet ej" efter emotionella frågor
 * → ta bort press → låt känslan vara → håll närvaro → ge tre enkla val.
 * 
 * Detta är en av de viktigaste noderna i hela kedjan - modellen får INTE pressa, analysera, föreslå val eller styra uppåt i huvudet.
 * 
 * Vi undviker: Press, analys, föreslå val eller styra uppåt i huvudet - detta bryter närvaron och skickar användaren tillbaka till huvudet
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Detta är när användaren inte vet - vi ska stanna kvar, vara närvarande, och låta känslan vara som den är
 * 
 * Istället: tar bort press → låter känslan vara → håller närvaro → ger tre enkla val → håller kontakt, inte analys
 * 
 * Golden phrasing (CASE-VET-INTE) - låst och återanvänds varje gång.
 */
function generateDontKnowResponse(): string {
  // CASE-VET-INTE: Alltid samma respons för "vet inte"
  // Låst för konsistens - tar bort press, låter känslan vara, håller närvaro
  return `Okej.

Du behöver inte veta.

Vi låter det bara vara som det är en liten stund.

Jag är här med dig.

Om du bara andas långsamt nu —

känns det som att känslan kommer närmare,

håller avstånd,

eller bara står still?`;
}

/**
 * CASE-AVSTÅND: När användaren svarar "avstånd" på CASE-VET-INTE-frågan
 * 
 * Regel: När användaren säger "avstånd", "håller avstånd" efter "känns det som att känslan kommer närmare, håller avstånd, eller bara står still?"
 * → validera distans som skydd → normalisera att delen vill vara säker → håll närvaro → ge två enkla val.
 * 
 * Detta är den sista reflexpunkten i kedjan - modellen ska INTE analysera utan validera distans som skydd.
 * 
 * Vi undviker: Analys - detta är när delen skyddar sig, inte för att den inte vill dig utan för att den vill vara säker först
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Detta är när delen håller avstånd - vi ska validera distans som skydd, inte analysera eller pressa
 * 
 * Istället: validerar distans som skydd → normaliserar att delen vill vara säker → håller närvaro → ger två enkla val → håller kontakt, inte analys
 * 
 * Golden phrasing (CASE-AVSTÅND) - låst och återanvänds varje gång.
 */
function generateDistanceResponse(): string {
  // CASE-AVSTÅND: Alltid samma respons för "avstånd"
  // Låst för konsistens - validerar distans som skydd, normaliserar att delen vill vara säker, håller närvaro
  return `Okej.

Avstånd.

Det betyder ofta att den delen skyddar sig.

Inte för att den inte vill dig —

utan för att den vill vara säker först.

Vi pressar inte.

Vi är bara nära på avstånd.

Om du bara är här med den —

känns det som att den vill bli närmad långsamt,

eller att du bara väntar här en stund?`;
}

/**
 * CASE-NÄRMAD-LÅNGSAMT: När användaren svarar "närmad långsamt" på CASE-AVSTÅND-frågan
 * 
 * Regel: När användaren säger "närmad långsamt", "långsamt nära" efter "känns det som att den vill bli närmad långsamt, eller att du bara väntar här en stund?"
 * → håll tempot nere → stanna i kroppen → följ delen, inte logiken → fortsätt anknytning → ge tre enkla val.
 * 
 * Detta är själva läkningsögonblicket - den inre delen är mottaglig, den vill kontakt men försiktigt.
 * 
 * Vi undviker: "Jag lyssnar. Vad händer oftast precis innan det skaver?" - detta bryter anknytning, drar användaren tillbaka in i huvudet, avslutar istället för att stödja öppning
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Detta är när delen vill bli närmad långsamt - vi ska hålla tempot nere, stanna i kroppen, följa delen, inte logiken
 * 
 * Istället: håller tempot nere → stannar i kroppen → följer delen, inte logiken → fortsätter anknytning → ger tre enkla val → håller kontakt, inte analys
 * 
 * Golden phrasing (CASE-NÄRMAD-LÅNGSAMT) - låst och återanvänds varje gång.
 */
function generateSlowApproachResponse(): string {
  // CASE-NÄRMAD-LÅNGSAMT: Alltid samma respons för "närmad långsamt"
  // Låst för konsistens - håller tempot nere, stannar i kroppen, följer delen, inte logiken, fortsätter anknytning
  return `Okej.

Då går vi långsamt.

Du behöver inte göra något.

Bara vara här.

Om du långsamt vänder dig mot den delen, som om du går några steg i tanken —

hur känns det att komma lite närmare?

Mer mjukt, skört eller varmt?`;
}

/**
 * CASE-SKÖRT: När användaren svarar "skört" på CASE-NÄRMAD-LÅNGSAMT-frågan
 * 
 * Regel: När användaren säger "skört", "skörhet" efter "hur känns det att komma lite närmare? Mer mjukt, skört eller varmt?"
 * → stanna kvar i känslan → validera skörhet → håll tempot nere → ge två enkla val.
 * 
 * Detta är den absolut viktigaste punkten - kärnsårbarhet där kontakt uppstår på riktigt.
 * 
 * Vi undviker: "Vad händer oftast precis innan det skaver?" - detta lämnar användaren ensam, bryter stillhet, kastar tillbaka in i huvudet
 * Vi undviker: Analys, fråga, förstå, "börja med något" - modellen måste stanna kvar i känslan
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Detta är när användaren säger "skört" - vi ska stanna kvar i känslan, validera skörhet, hålla tempot nere
 * 
 * Istället: stannar kvar i känslan → validerar skörhet → håller tempot nere → ger två enkla val → håller kontakt, inte analys
 * 
 * Golden phrasing (CASE-SKÖRT) - låst och återanvänds varje gång.
 */
function generateFragileResponse(): string {
  // CASE-SKÖRT: Alltid samma respons för "skört"
  // Låst för konsistens - stannar kvar i känslan, validerar skörhet, håller tempot nere
  return `Okej.

Skört.

Skörhet betyder att något är viktigt.

Vi rör oss långsamt här.

Om du bara håller om den känslan en liten stund —

känns den som ett hjärta som vill bli hållet,

eller som något som är rädd att gå sönder?`;
}

/**
 * CASE-RÄDD-ATT-GÅ-SÖNDER: När användaren svarar "rädd att gå sönder" på CASE-SKÖRT-frågan
 * 
 * Regel: När användaren säger "rädd att gå sönder" efter "känns den som ett hjärta som vill bli hållet, eller som något som är rädd att gå sönder?"
 * → stanna → håll känslan → INTE analysera → INTE gå vidare → ge två enkla val.
 * 
 * Detta är när vi är inne i kärnsårbarhet - coachen måste stanna, hålla känslan, INTE analysera, INTE gå vidare.
 * 
 * Vi undviker: "Vad händer oftast precis innan det skaver?" - detta är ett fel hopp, vi är inne i kärnsårbarhet nu
 * Vi undviker: Analys, fråga, förstå, "börja med något" - coachen måste stanna, hålla känslan
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Detta är när användaren säger "rädd att gå sönder" - vi ska stanna, hålla känslan, inte analysera, inte gå vidare
 * 
 * Istället: stannar → håller känslan → INTE analyserar → INTE går vidare → ger två enkla val → håller kontakt, inte analys
 * 
 * Golden phrasing (CASE-RÄDD-ATT-GÅ-SÖNDER) - låst och återanvänds varje gång.
 */
function generateAfraidToBreakResponse(): string {
  // CASE-RÄDD-ATT-GÅ-SÖNDER: Alltid samma respons för "rädd att gå sönder"
  // Låst för konsistens - stannar, håller känslan, INTE analyserar, INTE går vidare
  return `Okej.

Rädd att gå sönder.

Tack för att du sa det.

Vi tar det långsamt nu.

När den rädslan finns där —

känns det som att du behöver någon som håller om dig,

eller behöver du något mjukt omkring dig,

för att kunna landa lite?`;
}

/**
 * CASE-TOMHET: När användaren svarar "tom" på CASE-LEDSENHET-TYSTNAD-frågan
 * 
 * Regel: När användaren säger "tom", "tomhet" efter "känns den vänlig, tom, eller still?"
 * → stanna i den tomheten → göra den trygg → fördjupa den sakta → ge tre enkla val.
 * 
 * Detta är när användaren identifierar att tystnaden är tom - vi ska stanna i den tomheten, göra den trygg, fördjupa den sakta.
 * 
 * Vi undviker: "Vad händer oftast precis innan det skaver?" - detta är analys, förstå, fixa, istället för att stanna i känslan
 * Vi undviker: Problemlösning eller analys - detta är emotionellt ögonblick, inte problemlösning
 * 
 * Istället: speglar → normaliserar att kroppen inte orkar bära allt → tar bort tryck att fylla → ger tre enkla val → håller kontakt, inte analys
 * 
 * Golden phrasing (CASE-TOMHET) - låst och återanvänds varje gång.
 */
function generateEmptinessResponse(): string {
  // CASE-TOMHET: Alltid samma respons för "tom"/"tomhet"
  // Låst för konsistens - stannar i den tomheten, gör den trygg, fördjupar den sakta
  return `Okej.

Tom.

Tomhet kan vara kroppens sätt att säga att den inte orkar bära allt just nu.

Vi försöker inte fylla den.

Vi bara sitter här en stund.

Om du märker tomheten precis som den är —

känns den tung, lätt eller neutral?`;
}

/**
 * Confusion Apology: När användaren ifrågasätter fragment-ackumuleringssvaret
 * 
 * Regel: Om användaren säger "Syr ihop vad?" eller liknande efter att vi sagt
 * "Säg gärna lite mer så syr jag ihop det strax"
 * → ta ansvar, förklara lugnt, återkontakta, fortsätt.
 * 
 * Ingen analys. Ingen försvarston.
 * Ansvar. Återkontakt. Fortsätt.
 */
function generateConfusionApology(): string {
  return `Förlåt, det var mitt fel att uttrycka mig lite slarvigt.

Jag menar bara att jag lyssnar och försöker förstå helheten i hur det känns för dig.

Vi tar det steg för steg.

När tankarna drar iväg – vad är det de kretsar kring?`;
}

/**
 * CASE-3-NYLIG-HÄNDELSE: När användaren säger att något hände nyligen/idag
 * 
 * Regel: När användaren säger "det hände tidigare idag", "det var idag", "det hände nyss"
 * → bekräfta att det ligger nära i tiden, öppna mjukt för att berätta utan press.
 * 
 * Vi undviker: "Syr ihop det strax" - låter tekniskt/distanserat
 * Vi undviker: "saknad/oro/trötthet" - hoppar för snabbt till tolkning, för stort steg
 * 
 * Istället: bekräfta + spegla → öppna dörren mjukt → ta bort prestation → lugna nervsystemet
 * 
 * Golden phrasing (CASE-3-NYLIG-HÄNDELSE) - låst och återanvänds varje gång.
 */
function generateRecentEventResponse(): string {
  // CASE-3-NYLIG-HÄNDELSE: Alltid samma respons för nyliga händelser
  // Låst för konsistens - bekräftar, speglar, öppnar mjukt utan press
  return `Okej. Då låter det som att det ligger nära i tiden.

Vill du berätta lite om vad som hände — bara i den mängd du orkar just nu?

Vi tar det lugnt.`;
}

/**
 * CASE-4-LITEN-SAK: När användaren säger att de bråkade om en liten sak
 * 
 * Regel: När användaren säger "vi bråkade om en liten sak" eller liknande
 * → mjuk spegling + normalisering + sakta öppning.
 * 
 * Vi undviker: Analys, tolkning, problemlösning - det är för tidigt
 * Vi undviker: "resan"-redirect eller andra ämnesbyten
 * 
 * Istället: återknyta kontakt → normalisera → fokusera på upplevelsen, inte händelsen → reglera tempo
 * 
 * Golden phrasing (CASE-4-LITEN-SAK) - låst och återanvänds varje gång.
 */
function generateSmallConflictResponse(): string {
  // CASE-4-LITEN-SAK: Alltid samma respons för små konflikter
  // Låst för konsistens - mjuk spegling, normalisering, sakta öppning
  return `Jag hör dig. Små saker kan kännas stora när något redan ligger och drar i en inombords.

Vill du berätta lite om vad det var i det där lilla som tog?

Vi tar det lugnt.`;
}

/**
 * CASE-5-FÖRKLARING: När användaren ger en förklaring till varför de är sur/irriterad
 * 
 * Regel: När användaren säger "För att mamma säger...", "Eftersom...", "Därför att..."
 * → spegla upplevelsen (känsla), normalisera, sen mjukt utforska → innan någon lösning.
 * 
 * Vi undviker: Problemlösning ("ta fram ett mini-steg") - det är för tidigt
 * Vi undviker: Analys eller tolkning - först förstå var känslan kommer ifrån
 * 
 * Istället: återknyta kontakt → bekräfta värde → utforska känslan mjukt → låg ansträngning
 * 
 * Golden phrasing (CASE-5-FÖRKLARING) - låst och återanvänds varje gång.
 */
function generateExplanationResponse(): string {
  // CASE-5-FÖRKLARING: Alltid samma respons för förklaringar
  // Låst för konsistens - speglar upplevelsen, normaliserar, utforskar mjukt
  return `Okej. Jag förstår.

Det kan kännas tungt när något som betyder något för dig blir stoppat.

När hon sa det — kändes det mest som irritation, ledsenhet eller något annat?`;
}

/**
 * CASE-6-JA-TACK: När användaren säger "ja tack" efter en känslomässig respons
 * 
 * Regel: När användaren säger "ja tack" efter en känslomässig respons
 * → detta betyder "tack för att du stannade kvar i känslan med mig", inte "redo att göra plan"
 * 
 * Vi undviker: Problemlösning ("ta fram ett mini-steg") - det är för tidigt
 * Vi undviker: "Vad vill du börja med?" - lägger ansvar på användaren → skapar press
 * 
 * Istället: stanna i kontakt → fortsätt utforska känslan → reglera tempo
 * 
 * Golden phrasing (CASE-6-JA-TACK) - låst och återanvänds varje gång.
 */
function generateGratitudeAfterEmotionResponse(): string {
  // CASE-6-JA-TACK: Alltid samma respons för tacksamhet efter känsla
  // Låst för konsistens - stannar i kontakt, fortsätter utforska känslan
  return `Okej. Vi tar det lugnt.

När du tänker på det där ögonblicket — vad gjorde mest ont?

Var det orden, tonen eller känslan av att bli stoppad?`;
}

/**
 * Clarify-mall: Förtydligande när meddelandet är oklart
 * Måste alltid inkludera "berätta", "förstå", "menar" och en fråga för golden test
 * Använder persona för att justera warmth och formality
 */
function generateClarify(userMessage: string, persona?: TemplateParams['persona']): string {
  const warmth = persona?.warmth || 0.6;
  const formality = persona?.formality || 0.4;
  
  // Alltid inkludera "berätta", "förstå", "menar" och en tydlig fråga
  // Justera ton baserat på persona
  
  if (formality >= 0.7) {
    // Formell ton
    return warmth >= 0.7
      ? "Kan du berätta lite mer om vad du menar så att jag kan förstå bättre?"
      : "Kan du berätta mer om vad du menar så att jag kan förstå?";
  } else if (formality >= 0.5) {
    // Neutral ton
    return warmth >= 0.7
      ? "Kan du berätta lite mer om vad du menar så att jag kan förstå bättre?"
      : "Kan du berätta mer om vad du menar så att jag kan förstå?";
  } else {
    // Casual ton
    return warmth >= 0.7
      ? "Kan du berätta lite mer om vad du menar så att jag kan förstå bättre?"
      : "Berätta mer om vad du menar så att jag kan förstå.";
  }
}

/**
 * Goal-mall: När användaren uttrycker mål/utveckling (inte känsla)
 * Ger konkreta steg och guidning, inte känslomässig spegling
 * Använder persona för att justera warmth och formality
 */
function generateGoal(
  userMessage: string,
  hints?: TemplateParams['hints'],
  persona?: TemplateParams['persona']
): string {
  const warmth = persona?.warmth || 0.6;
  const formality = persona?.formality || 0.4;
  
  // Extrahera målet från meddelandet
  const goalMatch = userMessage.match(/jag vill (?:bli|vara|kunna|göra|få|ha|utveckla|förbättra|träna|öva|lära)\s+(.+)/i) ||
                    userMessage.match(/jag försöker (?:bli|vara|kunna|göra|få|ha|utveckla|förbättra)\s+(.+)/i) ||
                    userMessage.match(/mitt mål är\s+(.+)/i) ||
                    userMessage.match(/jag strävar efter\s+(.+)/i);
  
  const goalText = goalMatch ? goalMatch[1].trim() : userMessage;
  
  // Specialfall: "bli en bättre livskamrat" → ge områdesval
  if (/bättre livskamrat|bättre partner|bättre pojkvän|bättre flickvän|bättre sambo/i.test(goalText)) {
    const s = `Grymt tydligt mål. Låt oss göra det konkret:

Välj ett område: kommunikation, närvaro eller stöd i vardagen.

Välj ett mini-beteende för i dag (t.ex. "en ärlig uppskattning vid middag").

Vill du börja med kommunikation, närvaro eller stöd?`;
    return withReplyMeta(s, 'goal_plan', 'areas_v1');
  }
  
  // Välj inledning baserat på warmth och formality (fixa grammatik)
  let intro = "";
  if (formality >= 0.7) {
    // Formell ton
    intro = warmth >= 0.7
      ? `Det är ett fint mål att ${goalText}. `
      : `Du vill ${goalText}. `;
  } else {
    // Casual/neutral ton
    intro = warmth >= 0.7
      ? `Jag hör att du vill ${goalText}. Det är en fin ambition. `
      : `Du vill ${goalText}. `;
  }
  
  // Generera konkreta steg baserat på målet
  let steps = "";
  const lowerGoal = goalText.toLowerCase();
  
  // Specifika steg för olika typer av mål
  if (/skämt|rolig|humor|skratta/i.test(lowerGoal)) {
    steps = "Här är 2 små steg som många tycker hjälper direkt:\n\n1) Testa att pausa en halv sekund före punchline – det gör att publiken \"hinner med\".\n\n2) Berätta skämtet för bara en person först, och se hur deras ansikte reagerar.";
  } else if (/bättre människa|bättre person|förbättra mig/i.test(lowerGoal)) {
    steps = "Låt oss göra det konkret:\n\nVad betyder \"bättre människa\" för dig?\n• Mer närvaro?\n• Mer tålamod?\n• Mer värme?\n• Något annat?";
  } else if (/kommunicera|prata|samtala|säga/i.test(lowerGoal)) {
    steps = "Här är 2 små steg som många tycker hjälper direkt:\n\n1) Börja med att lyssna aktivt – ställ en följdfråga efter att någon har pratat.\n\n2) Testa att formulera dina tankar i en mening innan du säger dem högt.";
  } else if (/självförtroende|trygg|säker/i.test(lowerGoal)) {
    steps = "Här är 2 små steg som många tycker hjälper direkt:\n\n1) Varje dag, skriv ner en sak du gjorde bra – även om den är liten.\n\n2) Testa att göra något nytt i en trygg miljö först, innan du tar större steg.";
  } else {
    // Generella steg för okända mål
    steps = "Här är 2 små steg som många tycker hjälper direkt:\n\n1) Börja med att göra det konkret – vad betyder det för dig specifikt?\n\n2) Testa ett litet steg i en trygg miljö först, innan du tar större steg.";
  }
  
  // Välj avslutande fråga baserat på formality (säkerställ att den alltid avslutas med ?)
  let question = "";
  if (formality >= 0.7) {
    question = warmth >= 0.7
      ? "\n\nVill du utforska fler exempel, eller testa ett konkret steg tillsammans?"
      : "\n\nVill du gå vidare med något av dessa steg?";
  } else {
    question = warmth >= 0.7
      ? "\n\nVill du utforska fler exempel, eller testa ett konkret steg tillsammans?"
      : "\n\nVill du gå vidare med något av dessa steg?";
  }
  
  // För "bättre människa" - specialfråga
  if (/bättre människa|bättre person|förbättra mig/i.test(lowerGoal)) {
    question = "\n\nVi kan börja med bara en av dem. Vilken resonerar mest med dig just nu?";
  }
  
  // Säkerställ att frågan alltid avslutas med ?
  if (!question.endsWith('?')) {
    question = question.trim() + '?';
  }
  
  return `${intro}${steps}${question}`;
}

/**
 * Parenting/Conflict-mall: För syskonkonflikt när användaren vill ha handling
 */
function generateParentConflictAction(): string {
  const content = `Jag hör dig – det tär när syskon hamnar i konflikt.

För att kunna agera klokt behöver vi se mönstret:

1) **Triggern**: När brukar det starta – spel, turordning, uppmärksamhet, något annat?

2) **Före-signal**: Ser du rastlöshet, uttråkning eller konkurrens precis innan?

3) **Mini-regel** (för direkt test idag):

   – "När någon säger stopp, pausar vi 10 sek och vuxen namnger känslan."  

   – "Vi turas om med timer 5 min, byter utan förhandling."

Känns det rimligt att börja med **timer-turas-om** eller **stopp-paus-namnge**?`;
  return withReplyMeta(content, 'parent_conflict', 'pc_v1');
}

/**
 * Ground-mall: Jordande när mood är tyngre (red/yellow) eller känslomässigt meddelande
 * Förbättrad: AOAP-struktur (Acknowledge → Observe → Ask → Plan) + deterministisk rotation
 * Använder persona för att justera warmth och formality
 */
function generateGround(
  mood?: TemplateParams['mood'],
  persona?: TemplateParams['persona'],
  conversation?: TemplateParams['conversation'],
  userMessage?: string
): string {
  const warmth = persona?.warmth ?? 0.6;
  const formality = persona?.formality ?? 0.4;
  const lastMeta = lastReplyMeta(conversation);
  
  // Deterministiskt seed baserat på konversationslängd
  const seed = (conversation?.length ?? 0);
  
  // A: Acknowledge (styrt av mood, utan repetitiva fraser)
  const introsHeavy = [
    "Det låter tungt.",
    "Jag märker att det här tar på krafterna.",
    "Det här är tufft att bära."
  ];
  const introsMedium = [
    "Det finns något här som behöver plats.",
    "Jag hör att det skaver.",
    "Det här betyder något viktigt för dig."
  ];
  const introsLight = [
    "Jag tar in det du säger.",
    "Jag lyssnar.",
    "Tack för att du delar."
  ];
  
  const intro = mood === 'red'
    ? rotate(introsHeavy, seed)
    : mood === 'yellow'
      ? rotate(introsMedium, seed)
      : rotate(introsLight, seed);
  
  // O: Observe (undvik att upprepa "kroppen och tankarna")
  const observePool = [
    "Om du ser scenen framför dig – vad brukar hända precis innan det låser sig?",
    "Vilken liten signal ser du först: tonläge, tempo eller kroppsspråk?",
    "Vad är det första tecknet på att det är på väg att braka?"
  ];
  let observeQ = rotate(observePool, seed);
  if (lastMeta.type === 'ground_observe' && lastMeta.key === observeQ) {
    observeQ = rotate(observePool, seed + 1);
  }
  
  // Särfall: syskonkonflikt + användaren ber om handling → gå direkt till action-mall
  const fullText = [
    ...(conversation?.filter(m => m.role === 'user').map(m => m.content) ?? []),
    userMessage ?? ''
  ].join(' ');
  if (isSiblingConflict(fullText) && wantsAction(userMessage)) {
    return generateParentConflictAction();
  }
  
  // A: Ask (för handling)
  const askPool = [
    "Vill du att vi tar fram ett mini-steg att testa idag?",
    "Ska vi ringa in en enkel regel som går att prova direkt?",
    "Vill du ha ett första steg som minskar friktionen just nu?"
  ];
  let ask = rotate(askPool, seed);
  if (lastMeta.type === 'ground_ask' && lastMeta.key === ask) {
    ask = rotate(askPool, seed + 1);
  }
  
  // P: Plan – om användaren uttryckligen vill "veta vad jag ska göra"
  if (wantsAction(userMessage)) {
    const plan = `Förslag – **ett mini-steg idag**:

• Sätt en 5-min timer och växla tur utan förhandling.  

• Vid "stopp": pausa 10 sek, namnge känsla ("båda vill ha samma nu") och återgå.`;
    const out = `${intro}\n\n${plan}\n\n${ask}`;
    return withReplyMeta(out, 'ground_plan', ask);
  }
  
  const out = `${intro} ${observeQ}`;
  return withReplyMeta(out, 'ground_observe', observeQ);
}

/**
 * Speak-goal-mall: När användaren vill träna på att tala
 * Använder persona för att justera warmth och formality
 */
function generateSpeakGoal(hints?: TemplateParams['hints'], persona?: TemplateParams['persona']): string {
  const warmth = persona?.warmth || 0.6;
  const formality = persona?.formality || 0.4;
  
  // Hämta relevanta mål eller mönster
  const goals = hints?.goals || [];
  const patterns = hints?.patterns || [];
  
  let response = "";
  
  // Välj inledning baserat på warmth och formality
  if (formality >= 0.7) {
    // Formell ton
    response = warmth >= 0.7
      ? "Jag hör att du vill bli bättre på att tala inför folk. "
      : "Du vill träna på att tala inför folk. ";
  } else if (formality >= 0.5) {
    // Neutral ton
    response = warmth >= 0.7
      ? "Jag hör att du vill bli bättre på att tala inför folk. "
      : "Du vill träna på att tala. ";
  } else {
    // Casual ton
    response = warmth >= 0.7
      ? "Jag hör att du vill bli bättre på att tala inför folk. "
      : "Du vill träna på att tala. ";
  }
  
  // Lägg alltid till konkreta steg för speak_goal
  if (formality >= 0.7) {
    response += "Ett första steg kan vara att börja med andning och röst, eller att träna på att formulera tankar tydligt. ";
  } else {
    response += "Ett första steg kan vara att börja med andning och röst, eller att träna på att formulera tankar tydligt. ";
  }
  
  // Frågan är densamma oavsett formality (behåller golden test-krav)
  response += "Vad känns som det största hindret just nu?";
  
  return response;
}

/**
 * Relation Mini-plan: För reframe-scenarier (resa, budget, jobb)
 */
function generateRelationMiniPlan(topicLabel: string): string {
  const s = `Vi håller oss till relationen och gör en mini-plan kring **${topicLabel}**:

1) Mål: vad vill ni känna och uppleva?

2) Ramar: tid, pengar, energi (realistiskt).

3) Fördelning: vem bestämmer vad? hur byter ni tur?

4) Första steg: ett enda beslut idag.

Vill du börja med mål eller ramar?`;
  return withReplyMeta(s, 'relation_plan', `mini_${topicLabel}`);
}

/**
 * Generic-mall: Allmänt svar med spegling och fråga
 * Förbättrad: AOAP-light + deterministisk rotation
 * Använder persona för att justera warmth och formality
 */
function generateGeneric(
  userMessage: string,
  hints?: TemplateParams['hints'],
  persona?: TemplateParams['persona']
): string {
  const warmth = persona?.warmth ?? 0.6;
  const formality = persona?.formality ?? 0.4;
  
  // Extrahera nyckelpunkt från meddelandet
  const keyPoint = extractKeyPoint(userMessage);
  
  // Acknowledge - deterministiskt seed
  const mirrorsWarm = [
    `Jag hör att ${keyPoint}.`,
    `Det låter som att ${keyPoint}.`,
    `Jag förstår att ${keyPoint}.`
  ];
  const mirrorsCool = [`${keyPoint}.`];
  
  // Deterministiskt seed baserat på meddelandets längd
  const seed = Math.max(0, (userMessage?.length ?? 0) - 1);
  const mirror = (warmth >= 0.7 ? rotate(mirrorsWarm, seed) : rotate(mirrorsCool, seed));
  
  // Observe/Ask – deterministisk rotation
  const questions = formality >= 0.7
    ? ["Kan du berätta mer?", "Hur ser det ut för dig?", "Vad känns viktigast här?"]
    : ["Berätta mer.", "Hur ser det ut för dig?", "Vad känns viktigast här?"];
  const q = rotate(questions, seed);
  
  // Om det luktar "vill ha åtgärd" → styr mot planfråga
  const suffix = wantsAction(userMessage)
    ? " Vill du att jag skissar ett första mini-steg att testa idag?"
    : ` ${q}`;
  
  const out = `${mirror}${suffix}`;
  return withReplyMeta(out, 'generic', q);
}

/**
 * Extrahera nyckelpunkt från meddelande (för spegling)
 */
function extractKeyPoint(msg: string): string {
  const trimmed = msg.trim();
  if (!trimmed) {
    return "du delar något här";
  }
  
  const lower = trimmed.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  
  // Enstaka ord
  if (words.length === 1) {
    const word = words[0];
    if (['hej', 'tjena', 'hallå'].includes(word)) {
      return "du säger hej";
    }
    return `du säger "${word}"`;
  }
  
  // Transformera "jag" → "du"
  let transformed = trimmed;
  if (transformed.toLowerCase().startsWith('jag ')) {
    transformed = transformed.replace(/^jag\b/i, 'du');
    transformed = transformed.replace(/\bmin\b/gi, 'din');
    transformed = transformed.replace(/\bmig\b/gi, 'dig');
  }
  
  // Ta första meningen eller första 40 tecknen
  const firstSentence = transformed.split(/[.!?]/)[0];
  if (firstSentence.length > 0 && firstSentence.length < 60) {
    return firstSentence.trim();
  }
  
  const snippet = transformed.slice(0, 40).trim();
  return snippet.length > 0 ? `${snippet}...` : "du delar något viktigt";
}

