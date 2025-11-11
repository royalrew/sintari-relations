/**
 * Detectors - Alla detektorer för intent, mood, slots och patterns
 * 
 * SINGLE-SOURCE: ändra bara i modulen. Om du läser detta i en annan fil är det en bugg.
 */

// Re-export från specialiserade detector-moduler
export { detectLoveHurtPattern } from './detectors/loveHurt';

export type Slots = { 
  topic?: string; 
  action?: string; 
  obstacle?: string; 
  target?: string; 
  actor?: string;
  relation?: string;
};

export function extractSlots(msg: string): Slots {
  const t = msg.toLowerCase();
  const s: Slots = {};

  // action (jag vill … / jag ska …)
  const mGoal = t.match(/jag\s+(?:vill|ska|försöker)\s+([^,.!?]+)/i);
  if (mGoal) s.action = mGoal[1].trim(); 

  // obstacle (men … / fast …)
  const mObs = t.match(/\bmen\s+([^,.!?]+)/i) || t.match(/\bfast\s+([^,.!?]+)/i);
  if (mObs) s.obstacle = mObs[1].trim();

  // target (till/på/med + namn/roll)
  const mTgt = t.match(/\bmed\s+([a-zåäöé\- ]{2,})$/i) || t.match(/\btill\s+([a-zåäöé\- ]{2,})$/i);
  if (mTgt) s.target = mTgt[1].trim();

  // topic (fallback: första substantivfrasen-ish)
  if (!s.topic) {
    const mTop = t.match(/\b(relation|kommunikation|gränser|närvaro|bråk|konflikt)\b/i);
    if (mTop) s.topic = mTop[1].toLowerCase();
  }

  return s;
}

export function detectMood(s: string): 'red' | 'yellow' | 'neutral' | 'plus' { 
  const t = s.toLowerCase();
  // RED: Endast för självskada eller omedelbar fara
  if (/(jag vill dö|ta livet av mig|självmord|orkar inte mer|vill inte leva)/i.test(t)) return 'red';
  // PLUS: Positiva känslor (expanderad för att fånga humor, skoj, rolig)
  if (/(haha|hahaha|rolig|roligt|skojar|skoj|skämt|skratt|glad|pepp|underbart|yay|kul|mysigt|trevligt|fint|bra|toppen|grymt|fantastiskt|perfekt|jättebra|super|awesome|cool|schysst)/i.test(t)) return 'plus';
  // YELLOW: Negativa känslor (men inte kris)
  if (/(ledsen|orolig|jobbigt|stress|arg|upprörd|retar|mår inte bra)/i.test(t)) return 'yellow';
  return 'neutral';
}

export function detectChoice(s: string): number | null { 
  const m = s.trim().match(/^(1|2|3)\b/); 
  return m ? +m[1] : null; 
}

export function detectIntent(s: string, meta?: any): 'greeting' | 'clarify' | 'probe' | 'plan' | 'choice' | 'recap' | 'generic' | 'orientation' {
  const t = s.toLowerCase();
  // Orientation har högsta prioritet (meta-frågor om vem AI:n är)
  if (/\b(är du en ai|pratar jag med en|bot|är du riktig|hur funkar du)\b/i.test(t)) {
    return 'orientation';
  }
  // Choice har företräde
  if (detectChoice(s) !== null) return 'choice';
  if (/^hej|tjena|hallå/.test(t)) return 'greeting';
  if (/vad\s+menar\s+du\??$/.test(t)) return 'clarify';
  // Goal-intent: "jag vill bli", "jag vill ha hjälp med att", "hjälp mig att"
  if (/jag\s+(vill|ska|försöker)\s+(bli|vara|kunna|göra|få|ha|utveckla|förbättra|träna|öva|lära)/i.test(t) || 
      /jag\s+vill\s+ha\s+hjälp\s+med\s+att/i.test(t) ||
      /hjälp\s+mig\s+att\s+(bli|vara|kunna|göra|få|ha|utveckla|förbättra)/i.test(t)) {
    return 'plan';
  }
  if (/kommer du ihåg|minns du/i.test(t)) return 'recap';
  if (t.length < 24) return 'probe';
  return 'generic';
}

// Pattern-detektorer
export function detectClingLoop(text?: string): boolean {
  if (!text) return false;
  const s = text.toLowerCase();
  // Många meddelanden: 20, 30, 50+ sms
  const hasManyMessages = /(20|30|50|många|massor).*(sms|meddelanden|gånger)/i.test(s);
  // Jagande efter kärlek: "jag vill att X ska älska mig"
  const hasLoveChase = /jag vill att .* ska älska mig/i.test(s);
  // Frustration över inget svar: "varför svarar hen inte"
  const hasNoResponse = /varför svarar.*inte|svarar inte|ignorerar/i.test(s);
  // Överväger att åka dit: "ska åka hem", "knacka på"
  const hasGoingThere = /ska.*åka.*(hem|dit|till|knacka|besöka)/i.test(s);
  
  return hasManyMessages || hasLoveChase || hasNoResponse || hasGoingThere;
}

export function detectHarmToOthers(text?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  // enkla triggers: slå, slå sönder, förstöra, döda, bränna, krossa
  return /slag(a|n)|slå sönder|förstöra|krossa|döda|bränna|ge (hen|honom|henne) vad|ta livet av någon/i.test(t);
}

// Detekterar värde- och lojalitetskonflikter (t.ex. "mamma vill att jag ska X, men jag vill inte")
export function detectValueConflict(text?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  // Mönster: "X vill att jag ska Y, men jag vill inte" eller "X vill att jag ska Y, det vill inte jag"
  const hasParentalPressure = /(mamma|pappa|förälder|familj|mormor|morfar|farmor|farfar).*vill.*att.*jag.*ska/i.test(t);
  const hasConflict = /(vill inte|vill jag inte|det vill inte jag|men jag|men det vill inte|men jag vill inte)/i.test(t);
  const hasReligiousContext = /(religion|islam|kristendom|judendom|budskap|tro|respektera|lyda)/i.test(t);
  
  // Kombination: föräldertryck + konflikt + (eventuellt religiös kontext)
  return hasParentalPressure && hasConflict && (hasReligiousContext || /gifta|äktenskap|partner|relation/i.test(t));
}

// Detekterar gränssättning (boundary assertion) - irritation + behov av att sätta stopp
export function detectBoundary(text?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  // Mönster: irritation + behov av stopp
  const hasIrritation = /(trött på|orkar inte|hatar att|vill inte|vill att.*slutar|vill att.*släpper)/i.test(t);
  const hasRepetition = /(tjatar|tjata|upprepar|frågar om|frågar igen|frågar hela tiden)/i.test(t);
  const hasBoundaryNeed = /(sluta|stopp|gräns|behöver.*sluta|måste.*sluta|vill.*sluta)/i.test(t);
  
  // Kombination: irritation + repetition/boundary need
  return hasIrritation && (hasRepetition || hasBoundaryNeed);
}

// CASE-2-SUR: Detekterar surhet/irritation som behöver validering före fragment-ackumulering
export function detectAngerIrritation(text?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  // Mönster för surhet/irritation som behöver CASE-2-SUR-respons
  const angerPatterns = [
    /\b(jag är|känner mig|känns)\s+(sur|lite sur|irriterad|lack|stör mig|störs)/i,
    /\b(sur|irriterad|lack|stör mig)\b/i,
    /\batt jag är (sur|lite sur|irriterad|lack)/i,
  ];
  
  return angerPatterns.some(pattern => pattern.test(t));
}

// CASE-1-FORMAL-GREETING: Detekterar formella hälsningar som behöver mjukare respons
// "Goddag", "God kväll", "Hejsan", "Tjenare" signalerar formellt avstånd
export function detectFormalGreeting(text?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  // Formella hälsningar som signalerar avstånd
  const formalGreetings = [
    'goddag',
    'god dag',
    'god kväll',
    'godkväll',
    'god morgon',
    'godmorgon',
    'hejsan',
    'tjenare',
  ];
  
  // Matcha exakt eller med skiljetecken i slutet
  return formalGreetings.some(greeting => {
    const normalized = t.replace(/[!?.,]+$/g, ''); // Ta bort skiljetecken
    return normalized === greeting || normalized.startsWith(greeting + ' ');
  });
}

// CASE-3-NYLIG-HÄNDELSE: Detekterar när användaren säger att något hände nyligen/idag
// Triggas för: "det hände tidigare idag", "det var idag", "det hände nyss"
export function detectRecentEvent(text?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  // Mönster för nyliga händelser
  const recentEventPatterns = [
    /\b(det hände|det var|det skedde|det inträffade).*(tidigare idag|idag|nyss|nyligen|tidigare|förut idag)/i,
    /\b(tidigare idag|idag tidigare|nyss|nyligen).*(hände|var|skedde|inträffade)/i,
    /\b(hände|var|skedde).*(tidigare idag|idag|nyss|nyligen)/i,
  ];
  
  return recentEventPatterns.some(pattern => pattern.test(t));
}

// CASE-4-LITEN-SAK: Detekterar när användaren säger att de bråkade om en liten sak
// Triggas för: "vi bråkade om en liten sak", "bråkade om något litet", "liten sak"
export function detectSmallConflict(text?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  // Mönster för små konflikter/bråk
  const smallConflictPatterns = [
    /\b(bråkade|bråk|grälade|gräl).*(om|över).*(en liten|liten sak|litet|något litet)/i,
    /\b(en liten|liten sak|litet).*(bråkade|bråk|grälade|gräl)/i,
    /\b(bråkade|bråk|grälade|gräl).*(liten sak|litet)/i,
  ];
  
  return smallConflictPatterns.some(pattern => pattern.test(t));
}

// CASE-5-FÖRKLARING: Detekterar när användaren ger en förklaring till varför de är sur/irriterad
// Triggas för: "För att mamma säger...", "Eftersom...", "Därför att..."
// Detta är när användaren förklarar orsaken till sin känsla
export function detectExplanation(text?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  // Mönster för förklaringar som börjar med "för att", "eftersom", "därför att"
  const explanationPatterns = [
    /^(för att|eftersom|därför att|därför|för|när|om)/i,
    /\b(för att|eftersom|därför att).*(säger|sa|måste|vill|ska|gör|gjorde)/i,
  ];
  
  return explanationPatterns.some(pattern => pattern.test(t));
}

// CASE-6-JA-TACK: Detekterar när användaren säger "ja tack" efter en känslomässig respons
// Detta betyder "tack för att du stannade kvar i känslan med mig", inte "redo att göra plan"
export function detectGratitudeAfterEmotion(text?: string, lastReply?: string): boolean {
  if (!text || !lastReply) return false;
  const t = text.toLowerCase().trim();
  
  // Kolla om användaren säger "ja tack", "tack", "ja", "okej tack" etc.
  // Måste vara kort och enkelt - inte en lång mening
  const gratitudePatterns = [
    /^(ja tack|tack|ja|okej tack|ok tack)$/i,
    /^(ja|tack|okej)$/i,
  ];
  
  const isGratitude = gratitudePatterns.some(pattern => pattern.test(t));
  
  // Kolla om föregående svar var känslomässigt (innehåller känslor, spegling, empati)
  // Kolla även om föregående var CASE-5-FÖRKLARING eller liknande känslomässiga responser
  const isEmotionalReply = /(känns|känsla|känslan|irritation|ledsenhet|ont|tungt|jag förstår|jag hör|speglar|när hon sa|när du tänker|vad gjorde mest ont)/i.test(lastReply);
  
  return isGratitude && isEmotionalReply;
}

// CASE-INTRO-POSITIV: Detekterar när användaren svarar positivt på "Hur har dagen känts hittills?"
// Triggas för: "den har varit bra", "bra dag", "allt är okej", "bra", "fint"
// Detta är när användaren är i ett positivt tillstånd utan stress/konflikt/oro
export function detectPositiveState(text?: string, lastReply?: string): boolean {
  if (!text || !lastReply) return false;
  const t = text.toLowerCase().trim();
  
  // Kolla om föregående svar var formal greeting med "Hur har dagen känts hittills?"
  const isFormalGreetingFollowup = /hur har dagen känts hittills/i.test(lastReply);
  
  if (!isFormalGreetingFollowup) return false;
  
  // Mönster för positiva svar
  const positivePatterns = [
    /\b(den har varit|det har varit|det var|den var).*(bra|fint|okej|ok|trevligt|bra dag)/i,
    /\b(bra dag|bra|fint|okej|ok|trevligt|allt är okej|allt är bra|allt är fint|bra faktiskt)/i,
    /^(bra|fint|okej|ok|trevligt)$/i,
  ];
  
  return positivePatterns.some(pattern => pattern.test(t));
}

// CASE-INTRO-POSITIV-REPAIR: Detekterar när användaren ifrågasätter efter positiv respons
// Triggas för: "Vad är det som är oklart?", "Vad menar du?", "Förstår inte"
// Detta betyder att AI sa något konstigt och vi behöver reparera relationen
export function detectPositiveStateRepair(text?: string, lastReply?: string): boolean {
  if (!text || !lastReply) return false;
  const t = text.toLowerCase().trim();
  
  // Kolla om föregående svar var positiv state-respons eller "Det känns oklart nu"
  const isPositiveStateReply = /(vad fint att höra|när du känner in|känns det lugnt|finns det något litet under ytan)/i.test(lastReply);
  const isUnclearReply = /det känns oklart/i.test(lastReply);
  
  if (!isPositiveStateReply && !isUnclearReply) return false;
  
  // Mönster för ifrågasättande
  const repairPatterns = [
    /(vad är det som är oklart|vad menar du|förstår inte|vad betyder|vad menas|hur menar du)/i,
    /(oklart|förstår|menar|betyder).*\?/i,
  ];
  
  return repairPatterns.some(pattern => pattern.test(t));
}

// CASE-UNDER-YTAN: Detekterar när användaren säger att de känner något under ytan
// Triggas för: "något under ytan", "känner något men vet inte vad", "det ligger något där"
// Detta är när användaren öppnar upp för sårbar utforskning
export function detectUnderSurface(text?: string, lastReply?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för "något under ytan"
  const underSurfacePatterns = [
    /\b(något|något litet|någonting).*(under ytan|under ytan|där under|där inne)/i,
    /\b(känner|känns|finns).*(något|något litet|någonting).*(under ytan|under ytan|där under|där inne)/i,
    /\b(något|något litet|någonting).*(under ytan|under ytan|där under|där inne)/i,
    /\b(känner|känns).*(något|något litet|någonting).*(men vet inte vad|men vet inte|men oklart)/i,
    /\b(det ligger|det finns).*(något|något litet|någonting).*(där|där inne|under)/i,
  ];
  
  return underSurfacePatterns.some(pattern => pattern.test(t));
}

// CASE-SPÄNT-I-KROPPEN: Detekterar när användaren säger att de känner spänning
// Triggas för: "det är spänt", "känner mig spänd", "spänning"
// Detta är när användaren uttrycker något sårbart - vi undviker gaslighting ("Härligt!")
export function detectTension(text?: string, lastReply?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för spänning
  const tensionPatterns = [
    /\b(det är|det känns|det känns som).*(spänt|spänd|spänning)/i,
    /\b(känner mig|känns|känns det).*(spänt|spänd|spänning)/i,
    /\b(spänt|spänd|spänning)\b/i,
    /\b(spänning).*(i|i kroppen|i bröstet|i magen)/i,
  ];
  
  return tensionPatterns.some(pattern => pattern.test(t));
}

// CASE-KROPPEN-LOKALISERING: Detekterar när användaren svarar på kroppslokaliseringsfrågan
// Triggas för: "Bröstet", "magen", "halsen", "ryggen", etc. efter "var sitter det mest?"
// Detta är när användaren identifierar var i kroppen känslan/spänningen sitter
export function detectBodyLocation(text?: string, lastReply?: string): boolean {
  if (!text || !lastReply) return false;
  const t = text.toLowerCase().trim();
  
  // Kolla om föregående svar var kroppslokaliseringsfrågan
  const isBodyLocationQuestion = /var sitter det mest/i.test(lastReply) && 
                                 /(bröstet|magen|halsen|någon annanstans)/i.test(lastReply);
  
  if (!isBodyLocationQuestion) return false;
  
  // Mönster för kroppslokaliseringar
  const bodyLocationPatterns = [
    /^(bröstet|magen|halsen|ryggen|axlarna|nacken|huvudet|händerna|fötterna)$/i,
    /\b(bröstet|magen|halsen|ryggen|axlarna|nacken|huvudet|händerna|fötterna)\b/i,
    /\b(i|i mitt|i min|i mina).*(bröst|mage|hals|rygg|axel|nacke|huvud|händer|fötter)/i,
  ];
  
  return bodyLocationPatterns.some(pattern => pattern.test(t));
}

// CASE-MAGEN-SKYDDAR: Detekterar när användaren säger att magen/kroppen skyddar något
// Triggas för: "magen skyddar", "känns som den skyddar", "skyddar något"
// Detta är ett emotionellt ögonblick där något vill komma fram - vi ska sakta ner, hålla, stanna i kontakt
export function detectBodyProtection(text?: string, lastReply?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för "skyddar något"
  const protectionPatterns = [
    /\b(magen|kroppen|bröstet|halsen|ryggen).*(skyddar|försöker skydda|håller ihop|skyddar något)/i,
    /\b(känns som|det känns som|det känns).*(den|det|magen|kroppen).*(skyddar|försöker skydda|håller ihop)/i,
    /\b(skyddar|försöker skydda|håller ihop).*(något|någonting|något viktigt)/i,
    /\b(skyddar något|skyddar någonting)/i,
  ];
  
  return protectionPatterns.some(pattern => pattern.test(t));
}

// CASE-SAKNAD: Detekterar när användaren svarar "Saknad", "ledsenhet", eller "trötthet" på CASE-MAGEN-SKYDDAR-frågan
// Triggas för: "saknad", "ledsenhet", "trötthet" efter "känns det mer som ledsenhet, trötthet, eller saknad?"
// Detta är när användaren identifierar känslan som magen skyddar - vi ska hålla känslan, göra den trygg, fördjupa den sakta
export function detectLonging(text?: string, lastReply?: string): boolean {
  if (!text || !lastReply) return false;
  const t = text.toLowerCase().trim();
  
  // Kolla om föregående svar var CASE-MAGEN-SKYDDAR-frågan
  const isBodyProtectionQuestion = /känns det mer som ledsenhet.*trötthet.*saknad/i.test(lastReply) ||
                                   /följer känslan en liten bit inåt/i.test(lastReply);
  
  if (!isBodyProtectionQuestion) return false;
  
  // Mönster för känslor som magen skyddar
  const longingPatterns = [
    /^(saknad|ledsenhet|trötthet)$/i,
    /\b(saknad|ledsenhet|trötthet)\b/i,
  ];
  
  return longingPatterns.some(pattern => pattern.test(t));
}

// CASE-SAKNAD-MJUK: Detekterar när användaren svarar "mjukt" på CASE-SAKNAD-frågan
// Triggas för: "mjukt", "mjuk", "långsamt och mjukt" efter "känns den mer långsamt och mjukt, eller mer som en klump som trycker?"
// Detta är när användaren identifierar att saknaden är mjuk - vi ska stanna i den mjuka känslan, inte analysera eller lösa något
export function detectLongingSoft(text?: string, lastReply?: string): boolean {
  if (!text || !lastReply) return false;
  const t = text.toLowerCase().trim();
  
  // Kolla om föregående svar var CASE-SAKNAD-frågan
  const isLongingQuestion = /känns den mer långsamt och mjukt/i.test(lastReply) &&
                            /eller mer som en klump som trycker/i.test(lastReply);
  
  if (!isLongingQuestion) return false;
  
  // Mönster för "mjukt"
  const softPatterns = [
    /^(mjukt|mjuk)$/i,
    /\b(mjukt|mjuk|långsamt och mjukt)\b/i,
  ];
  
  return softPatterns.some(pattern => pattern.test(t));
}

// CASE-VÄRME: Detekterar när användaren svarar "värme" på CASE-SAKNAD-MJUK-frågan
// Triggas för: "värme" efter "kommer den närmare värme, tårar, eller tystnad?"
// Detta är när kroppen börjar släppa och nervsystemet reglerar - ett läkeögonblick
// Vi ska stanna och hålla, inte analysera eller lösa något
export function detectWarmth(text?: string, lastReply?: string): boolean {
  if (!text || !lastReply) return false;
  const t = text.toLowerCase().trim();
  
  // Kolla om föregående svar var CASE-SAKNAD-MJUK-frågan
  const isLongingSoftQuestion = /kommer den närmare värme/i.test(lastReply) &&
                                 (/tårar.*tystnad|tystnad.*tårar/i.test(lastReply) || /tårar.*eller.*tystnad/i.test(lastReply));
  
  if (!isLongingSoftQuestion) return false;
  
  // Mönster för "värme"
  const warmthPatterns = [
    /^(värme)$/i,
    /\b(värme)\b/i,
  ];
  
  return warmthPatterns.some(pattern => pattern.test(t));
}

// CASE-FÖRÄLDER-ARG: Detekterar när användaren säger att en förälder är arg på dem
// Triggas för: "mamma är arg", "min mamma är arg", "hon blev arg", "pappa är arg", "min pappa är arg", "han blev arg"
// Detta är en känslomässig relations-händelse som behöver empatisk spegling och trygg närvaro
// Vi undviker: "Det känns oklart nu... Vad vill du börja med?" - detta tar bort kontakt och gör användaren ensam
export function detectParentAnger(text?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för förälder + arg
  // Inkluderar "mama" för att hantera stavfel (stavfel för "mamma")
  const parentAngerPatterns = [
    /(mamma|mama|morsan|morsa|pappa|farsan|farsa).*(är|blev|blir).*(arg|sur|irriterad|lack|upprörd)/i,
    /(min|mitt).*(mamma|mama|morsan|morsa|pappa|farsan|farsa).*(är|blev|blir).*(arg|sur|irriterad|lack|upprörd)/i,
    /(hon|han).*(är|blev|blir).*(arg|sur|irriterad|lack|upprörd).*(på mig|mot mig)/i,
  ];
  
  return parentAngerPatterns.some(pattern => pattern.test(t));
}

// CASE-VILL-BLI-HÅLLEN: Detekterar när användaren uttrycker längtan efter att bli hållen/hållen om
// Triggas för: "jag önskar att någon höll om mig", "vill bli hållen", "vill bli buren"
// Detta är kärnsårbarhet - coachen måste stanna i känslan, hålla den, mjukna, spegla, långsamma tempot
// Vi undviker: "Vill du ta fram ett första mini-steg idag." - detta är för tidigt och klipper känslan
export function detectWantToBeHeld(text?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för längtan efter att bli hållen/hållen om
  const wantToBeHeldPatterns = [
    /(jag|jag önskar|jag vill).*(att någon|någon).*(höll|håller|hålla).*(om mig|om en)/i,
    /(vill|önskar|längtar).*(bli|att bli).*(hållen|hållen om|buren)/i,
    /(jag|jag vill|jag önskar).*(bli|att bli).*(hållen|hållen om|buren)/i,
    /\b(vill bli hållen|vill bli buren|önskar att bli hållen|önskar att bli buren)\b/i,
  ];
  
  return wantToBeHeldPatterns.some(pattern => pattern.test(t));
}

// CASE-NÄRA: Detekterar när användaren svarar "nära" på CASE-VILL-BLI-HÅLLEN-frågan
// Triggas för: "nära", "nära någon", "vill vara nära" efter "känns den längtan mer som saknad, eller som att du vill vara nära någon just nu?"
// Detta är en fördjupning i sårbarhet - coachen måste stanna i känslan, bekräfta längtan, hålla rummet, INTE försöka fixa något
// Vi undviker: "Det känns oklart nu, jag är med. Vad vill du börja med?" - detta är ett reset-svar som bryter närvaron och skapar frustration, stopp, stelhet, tappad relation
export function detectWantToBeClose(text?: string, lastReply?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för "nära" - svar på CASE-VILL-BLI-HÅLLEN-frågan
  const wantToBeClosePatterns = [
    /^(nära)$/i,
    /\b(nära|nära någon|vill vara nära|vill ha någon nära|vill ha någon|nära någon specifik)\b/i,
  ];
  
  if (!wantToBeClosePatterns.some(pattern => pattern.test(t))) return false;
  
  // Om föregående svar var CASE-VILL-BLI-HÅLLEN-frågan, eller om föregående svar var ett fel svar (fragment-ackumulering)
  // så trigga ändå - detta gör att vi kan reparera fel svar
  if (!lastReply) return true;
  
  const isWantToBeHeldQuestion = /känns den längtan mer som saknad/i.test(lastReply) &&
                                  /eller som att du vill vara nära någon just nu/i.test(lastReply);
  
  const isWrongResponse = /det känns oklart nu/i.test(lastReply) ||
                          /vad vill du börja med/i.test(lastReply) ||
                          /jag hör dig.*vi tar det sakta/i.test(lastReply) ||
                          /jag lyssnar.*vad händer oftast precis innan/i.test(lastReply) ||
                          /vill du fokusera på.*kommunikation.*gränser.*eller.*närvaro/i.test(lastReply);
  
  return isWantToBeHeldQuestion || isWrongResponse;
}

// CASE-SPECIFIK-PERSON: Detekterar när användaren svarar "specifik" på CASE-NÄRA-frågan
// Triggas för: "specifik", "specifik person", "någon specifik" efter "är det mer att du vill vara nära någon specifik person, eller är det mer som ett allmänt behov av att bli hållen?"
// Detta är en fördjupning i attachment/relation - när användaren identifierar att det handlar om en specifik person, så måste coachen stanna i känslan, bekräfta längtan, hålla rummet, och fördjupa attachment-utforskningen
// Vi undviker: "Vad vill du börja med?" - detta är ett felaktigt reset-svar som bryter närvaron
export function detectSpecificPerson(text?: string, lastReply?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för "specifik" - svar på CASE-NÄRA-frågan
  const specificPersonPatterns = [
    /^(specifik)$/i,
    /\b(specifik|specifik person|någon specifik|en specifik person|den personen)\b/i,
  ];
  
  if (!specificPersonPatterns.some(pattern => pattern.test(t))) return false;
  
  // Om föregående svar var CASE-NÄRA-frågan, eller om föregående svar var ett fel svar (fragment-ackumulering)
  // så trigga ändå - detta gör att vi kan reparera fel svar
  if (!lastReply) return true;
  
  const isWantToBeCloseQuestion = /är det mer att du vill vara nära någon specifik person/i.test(lastReply) &&
                                   /eller är det mer som ett allmänt behov av att bli hållen/i.test(lastReply);
  
  const isWrongResponse = /det känns oklart nu/i.test(lastReply) ||
                          /vad vill du börja med/i.test(lastReply) ||
                          /jag hör dig.*vi tar det sakta/i.test(lastReply) ||
                          /jag lyssnar.*vad händer oftast precis innan/i.test(lastReply) ||
                          /vill du fokusera på.*kommunikation.*gränser.*eller.*närvaro/i.test(lastReply);
  
  return isWantToBeCloseQuestion || isWrongResponse;
}

// CASE-ÖNSKAR: Detekterar när användaren svarar "önskar" på CASE-SPECIFIK-PERSON-frågan
// Triggas för: "önskar", "önskar att vara nära" efter "Är det någon du saknar, någon du är nära nu, eller någon du önskar att vara nära?"
// Detta är längtan framåt, ideal, inte minne bakåt - coachen ska följa spåret av längtan, INTE hoppa till problemlösning
// Vi undviker: "Vad vill du börja med?" - detta är ett felaktigt reset-svar som bryter närvaron
export function detectWishForCloseness(text?: string, lastReply?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för "önskar" - svar på CASE-SPECIFIK-PERSON-frågan
  const wishForClosenessPatterns = [
    /^(önskar)$/i,
    /\b(önskar|önskar att vara nära|önskar att vara nära någon|vill önska)\b/i,
  ];
  
  if (!wishForClosenessPatterns.some(pattern => pattern.test(t))) return false;
  
  // Om föregående svar var CASE-SPECIFIK-PERSON-frågan, eller om föregående svar var ett fel svar (fragment-ackumulering)
  // så trigga ändå - detta gör att vi kan reparera fel svar
  if (!lastReply) return true;
  
  const isSpecificPersonQuestion = /är det någon du saknar/i.test(lastReply) &&
                                   /någon du är nära nu/i.test(lastReply) &&
                                   /eller någon du önskar att vara nära/i.test(lastReply);
  
  const isWrongResponse = /det känns oklart nu/i.test(lastReply) ||
                          /vad vill du börja med/i.test(lastReply) ||
                          /jag hör dig.*vi tar det sakta/i.test(lastReply) ||
                          /jag lyssnar.*vad händer oftast precis innan/i.test(lastReply) ||
                          /vill du fokusera på.*kommunikation.*gränser.*eller.*närvaro/i.test(lastReply);
  
  return isSpecificPersonQuestion || isWrongResponse;
}

// CASE-LEDSENHET: Detekterar när användaren svarar "ledsenhet" på CASE-FÖRÄLDER-ARG-frågan
// Triggas för: "ledsen", "ledsenhet" efter "Mer som ledsenhet, oro, eller frustration?"
// Detta är när användaren identifierar känslan som ledsenhet - vi ska hålla känslan, göra den trygg, fördjupa den sakta
// Vi undviker: "Vad vill du börja med?" - detta är för snabbt, kognitivt, och lämnar användaren ensam med känslan
export function detectSadness(text?: string, lastReply?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för "ledsenhet"
  const sadnessPatterns = [
    /^(ledsenhet|ledsen)$/i,
    /\b(ledsenhet|ledsen)\b/i,
  ];
  
  if (!sadnessPatterns.some(pattern => pattern.test(t))) return false;
  
  // Om föregående svar var CASE-FÖRÄLDER-ARG-frågan, eller om föregående svar var ett fel svar (fragment-ackumulering)
  // så trigga ändå - detta gör att vi kan reparera fel svar
  if (!lastReply) return true;
  
  const isParentAngerQuestion = /hur känns det i dig när du tänker på det just nu/i.test(lastReply) &&
                                 /mer som ledsenhet.*oro.*frustration/i.test(lastReply);
  
  const isWrongResponse = /det känns oklart nu/i.test(lastReply) ||
                          /vad vill du börja med/i.test(lastReply) ||
                          /jag hör dig.*vi tar det sakta/i.test(lastReply);
  
  return isParentAngerQuestion || isWrongResponse;
}

// CASE-LEDSENHET-TYSTNAD: Detekterar när användaren svarar "tyst" på CASE-LEDSENHET-frågan
// Triggas för: "tyst", "tystnad" efter "är den mer tyst och stilla, eller mer tung och tryckande?"
// Detta är när användaren identifierar att ledsenheten är tyst - vi ska stanna i den tystnaden, göra den trygg, fördjupa den sakta
// Vi undviker: "Vad vill du börja med?" - detta är för snabbt, kognitivt, och lämnar användaren ensam med känslan
export function detectSadnessSilence(text?: string, lastReply?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för "tyst"/"tystnad"
  const silencePatterns = [
    /^(tyst|tystnad)$/i,
    /\b(tyst|tystnad)\b/i,
  ];
  
  if (!silencePatterns.some(pattern => pattern.test(t))) return false;
  
  // Om föregående svar var CASE-LEDSENHET-frågan, eller om föregående svar var ett fel svar (fragment-ackumulering)
  // så trigga ändå - detta gör att vi kan reparera fel svar
  if (!lastReply) return true;
  
  const isSadnessQuestion = /är den mer tyst och stilla/i.test(lastReply) &&
                            /eller mer tung och tryckande/i.test(lastReply);
  
  const isWrongResponse = /det känns oklart nu/i.test(lastReply) ||
                          /vad vill du börja med/i.test(lastReply) ||
                          /jag hör dig.*vi tar det sakta/i.test(lastReply);
  
  return isSadnessQuestion || isWrongResponse;
}

// CASE-TOMHET: Detekterar när användaren svarar "tom" på CASE-LEDSENHET-TYSTNAD-frågan
// Triggas för: "tom", "tomhet" efter "känns den vänlig, tom, eller still?"
// Detta är när användaren identifierar att tystnaden är tom - vi ska stanna i den tomheten, göra den trygg, fördjupa den sakta
// Vi undviker: "Vad händer oftast precis innan det skaver?" - detta är analys, förstå, fixa, istället för att stanna i känslan
export function detectEmptiness(text?: string, lastReply?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för "tom"/"tomhet"
  const emptinessPatterns = [
    /^(tom|tomhet)$/i,
    /\b(tom|tomhet)\b/i,
  ];
  
  if (!emptinessPatterns.some(pattern => pattern.test(t))) return false;
  
  // Om föregående svar var CASE-LEDSENHET-TYSTNAD-frågan, eller om föregående svar var ett fel svar (fragment-ackumulering)
  // så trigga ändå - detta gör att vi kan reparera fel svar
  if (!lastReply) return true;
  
  const isSadnessSilenceQuestion = /känns den vänlig/i.test(lastReply) &&
                                   /tom.*eller still/i.test(lastReply);
  
  const isWrongResponse = /det känns oklart nu/i.test(lastReply) ||
                          /vad vill du börja med/i.test(lastReply) ||
                          /jag hör dig.*vi tar det sakta/i.test(lastReply) ||
                          /jag lyssnar.*vad händer oftast precis innan/i.test(lastReply);
  
  return isSadnessSilenceQuestion || isWrongResponse;
}

// CASE-TUNG: Detekterar när användaren svarar "tung" på CASE-LEDSENHET-frågan
// Triggas för: "tung", "tyngd" efter "är den mer tyst och stilla, eller mer tung och tryckande?"
// Detta är när användaren identifierar att ledsenheten är tung - vi ska hålla den, göra den trygg, fördjupa den sakta
// Vi undviker: "Jag lyssnar. Vad händer oftast precis innan det skaver?" - detta är analys, förstå, fixa, istället för att hålla känslan
export function detectHeavy(text?: string, lastReply?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för "tung"/"tyngd"
  const heavyPatterns = [
    /^(tung|tyngd)$/i,
    /\b(tung|tyngd)\b/i,
  ];
  
  if (!heavyPatterns.some(pattern => pattern.test(t))) return false;
  
  // Om föregående svar var CASE-LEDSENHET-frågan, eller om föregående svar var ett fel svar (fragment-ackumulering)
  // så trigga ändå - detta gör att vi kan reparera fel svar
  if (!lastReply) return true;
  
  const isSadnessQuestion = /är den mer tyst och stilla/i.test(lastReply) &&
                            /eller mer tung och tryckande/i.test(lastReply);
  
  const isWrongResponse = /det känns oklart nu/i.test(lastReply) ||
                          /vad vill du börja med/i.test(lastReply) ||
                          /jag hör dig.*vi tar det sakta/i.test(lastReply) ||
                          /jag lyssnar.*vad händer oftast precis innan/i.test(lastReply);
  
  return isSadnessQuestion || isWrongResponse;
}

// CASE-BLI-BUREN: Detekterar när användaren svarar "bli buren" på CASE-TUNG-frågan
// Triggas för: "bli buren", "buren", "vill bli buren" efter "vill den bli buren, bli sedd, eller bara få vila?"
// Detta är när användaren identifierar att tyngden vill bli buren - vi ska hålla den, göra den trygg, fördjupa den sakta
// Vi undviker: "Jag lyssnar. Vad händer oftast precis innan det skaver?" - detta är analys, förstå, fixa, istället för att hålla känslan
export function detectWantToBeCarried(text?: string, lastReply?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för "bli buren"/"buren"
  const carriedPatterns = [
    /^(bli buren|buren)$/i,
    /\b(bli buren|buren|vill bli buren)\b/i,
  ];
  
  if (!carriedPatterns.some(pattern => pattern.test(t))) return false;
  
  // Om föregående svar var CASE-TUNG-frågan, eller om föregående svar var ett fel svar (fragment-ackumulering)
  // så trigga ändå - detta gör att vi kan reparera fel svar
  if (!lastReply) return true;
  
  const isHeavyQuestion = /vill den bli buren/i.test(lastReply) &&
                         /bli sedd.*eller bara få vila/i.test(lastReply);
  
  const isWrongResponse = /det känns oklart nu/i.test(lastReply) ||
                          /vad vill du börja med/i.test(lastReply) ||
                          /jag hör dig.*vi tar det sakta/i.test(lastReply) ||
                          /jag lyssnar.*vad händer oftast precis innan/i.test(lastReply);
  
  return isHeavyQuestion || isWrongResponse;
}

// CASE-MELLAN: Detekterar när användaren svarar "mellan" (ca 7-12 år) på CASE-BLI-BUREN-frågan
// Triggas för: "mellan", "ungefär 7", "ungefär 10", "ca 7", "ca 10", "7-12", etc. efter "hur gammal känns den delen som behöver bli buren?"
// Detta är när användaren identifierar att den delen som behöver bli buren är mellanåldern - vi ska hålla den, göra den trygg, fördjupa den sakta
// Vi undviker: "Vad händer oftast precis innan det skaver?" - detta är analys, förstå, fixa, istället för att hålla känslan
export function detectMiddleAge(text?: string, lastReply?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för "mellan" eller åldrar i mellanåldersområdet (ca 7-12 år)
  const middleAgePatterns = [
    /^(mellan)$/i,
    /\b(mellan|mellanåldern|mellanålder)\b/i,
    /\b(ungefär|ca|cirka|runt|omkring)\s*(7|8|9|10|11|12)\b/i,
    /\b(7|8|9|10|11|12)\s*(år|årsåldern)\b/i,
    /\b(7[-–]12|8[-–]12|9[-–]12|10[-–]12)\b/i,
  ];
  
  if (!middleAgePatterns.some(pattern => pattern.test(t))) return false;
  
  // Om föregående svar var CASE-BLI-BUREN-frågan, eller om föregående svar var ett fel svar (fragment-ackumulering)
  // så trigga ändå - detta gör att vi kan reparera fel svar
  if (!lastReply) return true;
  
  const isWantToBeCarriedQuestion = /hur gammal känns den delen/i.test(lastReply) &&
                                    /som behöver bli buren/i.test(lastReply);
  
  const isWrongResponse = /det känns oklart nu/i.test(lastReply) ||
                          /vad vill du börja med/i.test(lastReply) ||
                          /jag hör dig.*vi tar det sakta/i.test(lastReply) ||
                          /jag lyssnar.*vad händer oftast precis innan/i.test(lastReply);
  
  return isWantToBeCarriedQuestion || isWrongResponse;
}

// CASE-VÄNTAR: Detekterar när användaren svarar "väntar" på CASE-MELLAN-frågan
// Triggas för: "väntar", "den väntar" efter "hur ser den ut? Ser du ansiktet, kroppen, eller bara en känsla?"
// Detta är när användaren identifierar att den inre delen väntar - vi ska hålla den, göra den trygg, fördjupa den sakta
// Vi undviker: "Vad händer oftast precis innan det skaver?" - detta avbryter läget av inre stillhet och skickar tillbaka till analys/tänka
export function detectWaiting(text?: string, lastReply?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för "väntar"
  const waitingPatterns = [
    /^(väntar)$/i,
    /\b(väntar|den väntar)\b/i,
  ];
  
  if (!waitingPatterns.some(pattern => pattern.test(t))) return false;
  
  // Om föregående svar var CASE-MELLAN-frågan, eller om föregående svar var ett fel svar (fragment-ackumulering)
  // så trigga ändå - detta gör att vi kan reparera fel svar
  if (!lastReply) return true;
  
  const isMiddleAgeQuestion = /hur ser den ut/i.test(lastReply) &&
                              /ansiktet.*kroppen.*eller bara en känsla/i.test(lastReply);
  
  const isWrongResponse = /det känns oklart nu/i.test(lastReply) ||
                          /vad vill du börja med/i.test(lastReply) ||
                          /jag hör dig.*vi tar det sakta/i.test(lastReply) ||
                          /jag lyssnar.*vad händer oftast precis innan/i.test(lastReply);
  
  return isMiddleAgeQuestion || isWrongResponse;
}

// CASE-BLI-SEDD: Detekterar när användaren svarar "bli sedd" på CASE-VÄNTAR-frågan
// Triggas för: "bli sedd", "vill bli sedd" efter "känns det som att den delen väntar på att bli sedd, väntar på att någon stannar, eller väntar på att det ska vara säkert att känna?"
// Detta är när användaren identifierar att den inre delen vill bli sedd - detta är kärn-attachment pivot, hjärtpunkt där AI:n måste vara varm & hållande, inte analytisk
// Vi undviker: "Vill du fokusera på kommunikation, gränser eller närvaro?" - detta bryter anknytningen, kastar användaren tillbaka till huvud, stänger känslan som just öppnade sig
export function detectWantToBeSeen(text?: string, lastReply?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för "bli sedd"
  const wantToBeSeenPatterns = [
    /^(bli sedd)$/i,
    /\b(bli sedd|vill bli sedd|den vill bli sedd)\b/i,
  ];
  
  if (!wantToBeSeenPatterns.some(pattern => pattern.test(t))) return false;
  
  // Om föregående svar var CASE-VÄNTAR-frågan, eller om föregående svar var ett fel svar (fragment-ackumulering)
  // så trigga ändå - detta gör att vi kan reparera fel svar
  if (!lastReply) return true;
  
  const isWaitingQuestion = /väntar på att bli sedd/i.test(lastReply) &&
                            /väntar på att någon stannar/i.test(lastReply) &&
                            /väntar på att det ska vara säkert/i.test(lastReply);
  
  const isWrongResponse = /det känns oklart nu/i.test(lastReply) ||
                          /vad vill du börja med/i.test(lastReply) ||
                          /jag hör dig.*vi tar det sakta/i.test(lastReply) ||
                          /jag lyssnar.*vad händer oftast precis innan/i.test(lastReply) ||
                          /vill du fokusera på.*kommunikation.*gränser.*eller.*närvaro/i.test(lastReply);
  
  return isWaitingQuestion || isWrongResponse;
}

// CASE-VET-INTE: Detekterar när användaren säger "vet inte" efter emotionella/terapeutiska frågor
// Triggas för: "vet inte", "jag vet inte", "vet ej" efter emotionella frågor
// Detta är en av de viktigaste noderna i hela kedjan - modellen får INTE pressa, analysera, föreslå val eller styra uppåt i huvudet
// Den ska stanna kvar, vara närvarande, och låta känslan vara som den är
export function detectDontKnow(text?: string, lastReply?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för "vet inte"
  const dontKnowPatterns = [
    /^(vet inte)$/i,
    /^(jag vet inte)$/i,
    /^(vet ej)$/i,
    /\b(vet inte|jag vet inte|vet ej|ingen aning|osäker)\b/i,
  ];
  
  if (!dontKnowPatterns.some(pattern => pattern.test(t))) return false;
  
  // Om föregående svar var en emotionell/terapeutisk fråga (känslor, kropp, inre delar, etc.)
  // så trigga - detta gör att vi kan hålla närvaro istället för att pressa
  if (!lastReply) return true;
  
  // Kolla om föregående svar var en emotionell/terapeutisk fråga
  const isEmotionalQuestion = 
    /känns det|hur känns|hur märker|hur ser|vad känns|vad märker|vad vill|vad händer|kommer den|är den|vill den|känns den|sitter den/i.test(lastReply) &&
    (/(känsla|kropp|kroppen|magen|bröstet|halsen|delen|ansiktet|kroppen|känsla|värme|tårar|tystnad|sedd|nära|stannar|säkert|närmare|avstånd|står still)/i.test(lastReply) ||
     /(tung|mjukt|spänt|ledsenhet|saknad|trötthet|tom|tyst|still|vänlig|neutral|ljätt)/i.test(lastReply));
  
  const isWrongResponse = /det känns oklart nu/i.test(lastReply) ||
                          /vad vill du börja med/i.test(lastReply) ||
                          /jag hör dig.*vi tar det sakta/i.test(lastReply) ||
                          /jag lyssnar.*vad händer oftast precis innan/i.test(lastReply) ||
                          /vill du fokusera på.*kommunikation.*gränser.*eller.*närvaro/i.test(lastReply);
  
  return isEmotionalQuestion || isWrongResponse;
}

// CASE-AVSTÅND: Detekterar när användaren svarar "avstånd" på CASE-VET-INTE-frågan
// Triggas för: "avstånd", "håller avstånd" efter "känns det som att känslan kommer närmare, håller avstånd, eller bara står still?"
// Detta är den sista reflexpunkten i kedjan - modellen ska INTE analysera utan validera distans som skydd
// Vi undviker: Analys - detta är när delen skyddar sig, inte för att den inte vill dig utan för att den vill vara säker först
export function detectDistance(text?: string, lastReply?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för "avstånd"
  const distancePatterns = [
    /^(avstånd)$/i,
    /\b(avstånd|håller avstånd)\b/i,
  ];
  
  if (!distancePatterns.some(pattern => pattern.test(t))) return false;
  
  // Om föregående svar var CASE-VET-INTE-frågan, eller om föregående svar var ett fel svar (fragment-ackumulering)
  // så trigga ändå - detta gör att vi kan reparera fel svar
  if (!lastReply) return true;
  
  const isDontKnowQuestion = /känns det som att känslan/i.test(lastReply) &&
                             /kommer närmare/i.test(lastReply) &&
                             /håller avstånd/i.test(lastReply) &&
                             /eller bara står still/i.test(lastReply);
  
  const isWrongResponse = /det känns oklart nu/i.test(lastReply) ||
                          /vad vill du börja med/i.test(lastReply) ||
                          /jag hör dig.*vi tar det sakta/i.test(lastReply) ||
                          /jag lyssnar.*vad händer oftast precis innan/i.test(lastReply) ||
                          /vill du fokusera på.*kommunikation.*gränser.*eller.*närvaro/i.test(lastReply);
  
  return isDontKnowQuestion || isWrongResponse;
}

// CASE-NÄRMAD-LÅNGSAMT: Detekterar när användaren svarar "närmad långsamt" på CASE-AVSTÅND-frågan
// Triggas för: "närmad långsamt", "långsamt nära" efter "känns det som att den vill bli närmad långsamt, eller att du bara väntar här en stund?"
// Detta är själva läkningsögonblicket - den inre delen är mottaglig, den vill kontakt men försiktigt
// Vi undviker: "Jag lyssnar. Vad händer oftast precis innan det skaver?" - detta bryter anknytning, drar användaren tillbaka in i huvudet, avslutar istället för att stödja öppning
export function detectSlowApproach(text?: string, lastReply?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för "närmad långsamt"
  const slowApproachPatterns = [
    /^(närmad långsamt)$/i,
    /\b(närmad långsamt|långsamt nära|långsamt närmare)\b/i,
  ];
  
  if (!slowApproachPatterns.some(pattern => pattern.test(t))) return false;
  
  // Om föregående svar var CASE-AVSTÅND-frågan, eller om föregående svar var ett fel svar (fragment-ackumulering)
  // så trigga ändå - detta gör att vi kan reparera fel svar
  if (!lastReply) return true;
  
  const isDistanceQuestion = /känns det som att den vill bli närmad/i.test(lastReply) &&
                             /eller att du bara väntar här en stund/i.test(lastReply);
  
  const isWrongResponse = /det känns oklart nu/i.test(lastReply) ||
                          /vad vill du börja med/i.test(lastReply) ||
                          /jag hör dig.*vi tar det sakta/i.test(lastReply) ||
                          /jag lyssnar.*vad händer oftast precis innan/i.test(lastReply) ||
                          /vill du fokusera på.*kommunikation.*gränser.*eller.*närvaro/i.test(lastReply);
  
  return isDistanceQuestion || isWrongResponse;
}

// CASE-SKÖRT: Detekterar när användaren svarar "skört" på CASE-NÄRMAD-LÅNGSAMT-frågan
// Triggas för: "skört", "skörhet" efter "hur känns det att komma lite närmare? Mer mjukt, skört eller varmt?"
// Detta är den absolut viktigaste punkten - kärnsårbarhet där kontakt uppstår på riktigt
// Modellen måste stanna kvar i känslan - INTE analysera, INTE fråga, INTE förstå, INTE "börja med något"
// Vi undviker: "Vad händer oftast precis innan det skaver?" - detta lämnar användaren ensam, bryter stillhet, kastar tillbaka in i huvudet
export function detectFragile(text?: string, lastReply?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för "skört"
  const fragilePatterns = [
    /^(skört)$/i,
    /\b(skört|skörhet|skör)\b/i,
  ];
  
  if (!fragilePatterns.some(pattern => pattern.test(t))) return false;
  
  // Om föregående svar var CASE-NÄRMAD-LÅNGSAMT-frågan, eller om föregående svar var ett fel svar (fragment-ackumulering)
  // så trigga ändå - detta gör att vi kan reparera fel svar
  if (!lastReply) return true;
  
  const isSlowApproachQuestion = /hur känns det att komma lite närmare/i.test(lastReply) &&
                                 /mer mjukt.*skört.*eller varmt/i.test(lastReply);
  
  const isWrongResponse = /det känns oklart nu/i.test(lastReply) ||
                          /vad vill du börja med/i.test(lastReply) ||
                          /jag hör dig.*vi tar det sakta/i.test(lastReply) ||
                          /jag lyssnar.*vad händer oftast precis innan/i.test(lastReply) ||
                          /vill du fokusera på.*kommunikation.*gränser.*eller.*närvaro/i.test(lastReply);
  
  return isSlowApproachQuestion || isWrongResponse;
}

// CASE-RÄDD-ATT-GÅ-SÖNDER: Detekterar när användaren svarar "rädd att gå sönder" på CASE-SKÖRT-frågan
// Triggas för: "rädd att gå sönder", "rädd att gå sönder" efter "känns den som ett hjärta som vill bli hållet, eller som något som är rädd att gå sönder?"
// Detta är när vi är inne i kärnsårbarhet - coachen måste stanna, hålla känslan, INTE analysera, INTE gå vidare
// Vi undviker: "Vad händer oftast precis innan det skaver?" - detta är ett fel hopp, vi är inne i kärnsårbarhet nu
export function detectAfraidToBreak(text?: string, lastReply?: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  
  // Mönster för "rädd att gå sönder"
  const afraidToBreakPatterns = [
    /^(rädd att gå sönder)$/i,
    /\b(rädd att gå sönder|rädd.*gå sönder|rädd.*sönder|fruktar.*sönder)\b/i,
  ];
  
  if (!afraidToBreakPatterns.some(pattern => pattern.test(t))) return false;
  
  // Om föregående svar var CASE-SKÖRT-frågan, eller om föregående svar var ett fel svar (fragment-ackumulering)
  // så trigga ändå - detta gör att vi kan reparera fel svar
  if (!lastReply) return true;
  
  const isFragileQuestion = /känns den som ett hjärta som vill bli hållet/i.test(lastReply) &&
                            /eller som något som är rädd att gå sönder/i.test(lastReply);
  
  const isWrongResponse = /det känns oklart nu/i.test(lastReply) ||
                          /vad vill du börja med/i.test(lastReply) ||
                          /jag hör dig.*vi tar det sakta/i.test(lastReply) ||
                          /jag lyssnar.*vad händer oftast precis innan/i.test(lastReply) ||
                          /vill du fokusera på.*kommunikation.*gränser.*eller.*närvaro/i.test(lastReply);
  
  return isFragileQuestion || isWrongResponse;
}

