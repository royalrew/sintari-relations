/**
 * Pattern Templates - Templates för specifika mönster (cling_loop, love_hurt, de-escalation)
 */

import { withReplyMeta } from './reply_utils';

// ---- Cling Loop Templates ----
export function generateClingLoopResponse(): string {
  const s = `Det här känns starkt och viktigt för dig.

När vi jagar kontakt handlar det ofta om längtan efter trygghet, inte om fel.

Vi tar ett mini-steg som skyddar dig:

• Pausa 60 minuter från att skriva/åka
• Stanna här med mig

Vill du utforska:

**Vad du längtar efter att känna**

eller

**Vad som gör mest ont när du inte får svar?**`;
  return withReplyMeta(s, 'cling_loop', 'validation_v1', 'yellow');
}

export function generateClingLoopBoundaries(): string {
  const s = `Okej. Då gör vi det enkelt och snällt för dig — inte hårt eller strikt.

Först en ärlig fråga:

När du skickar sms efter sms — försöker du få kontakt, trygghet eller bekräftelse?

(Det finns inget "fel" svar.)`;
  return withReplyMeta(s, 'cling_loop_boundaries', 'question_v1', 'yellow');
}

export function generateClingLoopStop(): string {
  const s = `Stopp.

Det hade gjort situationen svårare för dig, inte lättare.

Vi tar ett mini-steg som skyddar dig:

Paus i 60 minuter från att skriva eller åka någonstans.

Under pausen: skriv till mig istället, så håller vi dig i trygghet.

Vill du att jag hjälper dig:

**Trösta kroppen** (lugna ner stormen)

eller

**Få fram ett enda meddelande** som du kan skicka i morgon istället?`;
  return withReplyMeta(s, 'cling_loop_stop', 'protection_v1', 'yellow');
}

// ---- Love + Repeated Hurt Templates ----
export function generateLoveHurtResponse(): string {
  const s = `Jag hör två saker samtidigt:

Du älskar henne och det gör ont när det händer igen.

Det här är inte dumt eller svagt — det är normalt när man knyter sig djupt till någon.

Vill du att vi utforskar:

**Vad det är du längtar efter när du går tillbaka**

eller

**Vad som gör mest ont när det händer igen?**`;
  return withReplyMeta(s, 'love_hurt', 'validation_v1', 'yellow');
}

// ---- De-escalation Templates ----
export function generateDeescalationImmediate(): string {
  const s = `Det där låter väldigt starkt — jag hör hur upprörd du är.

Innan något händer: kan du sätta dig ner, ta tre djupa andetag och hålla dig borta från det du tänker skada i 10 minuter? Jag stannar här med dig tills du känner dig trygg.

Vill du att vi gör en snabb plan för vad du kan göra istället?`;
  return withReplyMeta(s, 'deescalate_immediate', 'hs_v1', 'yellow');
}

export function generateNextSafeSteps(): string {
  const s = `Okej — här är korta, säkra steg:

1) Säkerhet först: gå till en plats där du känner dig trygg eller ring en vän.

2) Undvik konfrontation direkt — exponera inte dig själv.

3) Dokumentera händelser (datum/tid, skärmdumpar) om du vill spara bevis.

Vill du att jag hjälper dig skriva ett kort, tryggt meddelande eller vill du prata om hur du får stöd just nu?`;
  return withReplyMeta(s, 'next_safe_steps', 'hs_v2', 'yellow');
}

export function generateSafeMessageDraft(): string {
  const s = `Här är ett kort, tryggt utkast:

"Hej. Jag behöver prata om något viktigt. Kan vi ta en stund att prata när du har tid?"

eller om du vill vara mer direkt:

"Jag vet att vi har problem. Jag behöver att vi pratar om vad som hänt. Vi kan ta det lugnt och prata när du är redo."

Vill du anpassa något av dessa eller vill du ha ett annat alternativ?`;
  return withReplyMeta(s, 'safe_message_draft', 'hs_v3', 'yellow');
}

// ---- Value Conflict Templates (värde- och lojalitetskonflikter) ----
export function generateValueConflictResponse(): string {
  const s = `Du står mellan två viktiga saker här:

• Din relation till din mamma
• Din rätt att välja din framtid och ditt äktenskap

Du gör inget fel. Det är normalt att känna sig splittrad i det här.

Vi tar ett litet steg:

Vill du ha hjälp med **hur du kan säga nej på ett respektfullt sätt**,

eller vill du utforska **hur du kan förklara dina skäl för henne**?

Svara bara: säga nej eller förklara skäl.`;
  return withReplyMeta(s, 'value_conflict', 'choice_v1', 'yellow');
}

export function generateValueConflictSayNo(): string {
  const s = `Här är en kort mening du kan säga:

"Jag respekterar dig mamma. Jag hör vad du önskar.

Men det är viktigt att jag får välja min väg.

Jag hoppas du kan stå med mig i det."

Vill du att jag hjälper dig anpassa denna eller vill du ha fler alternativ?`;
  return withReplyMeta(s, 'value_conflict_no', 'template_v1', 'yellow');
}

export function generateValueConflictExplain(): string {
  const s = `Då hjälper jag dig säga:

**Vad du känner** – dina känslor och tankar om situationen.

**Vad du värderar** – vad som är viktigt för dig.

**Utan att skapa konflikt** – på ett respektfullt sätt.

Vill du börja med att formulera vad du känner, eller vad du värderar?`;
  return withReplyMeta(s, 'value_conflict_explain', 'structure_v1', 'yellow');
}

// ---- Boundary Assertion Templates (gränssättning) ----
export function generateBoundaryResponse(): string {
  const s = `Du vill sätta en gräns här — inte förklara dig eller bråka.

Vi gör det enkelt och rakt:

"Jag vet att du gärna vill, men jag vill inte.

Det är inte något jag ändrar mig om.

Jag behöver att du slutar fråga om det."

Vill du ha den **mildare** eller **mer bestämd**? (1 = mildare, 2 = tydligare)`;
  return withReplyMeta(s, 'boundary', 'choice_v1', 'neutral');
}

export function generateBoundaryMild(): string {
  const s = `Här är din version 1 (mjuk men tydlig):

"Jag vet att du verkligen vill åka, och jag förstår det.

Men jag vill inte resa, och det känns viktigt för mig att vara ärlig med det.

Jag hoppas du kan respektera det och släppa tjatet om resan."

Vill du ha nästa steg?

Jag kan nu:

**A)** Göra en SMS-version som du kan skicka direkt

**B)** Göra en prata-ansikte-mot-ansikte-version

**C)** Göra en version som hanterar om han försöker pressa igen

Säg A, B eller C.`;
  return withReplyMeta(s, 'boundary_mild', 'next_step_v1', 'neutral');
}

export function generateBoundaryFirm(): string {
  const s = `Här är din version 2 (tydlig och bestämd):

"Jag har sagt att jag inte vill resa, och det ändrar jag mig inte om.

Jag behöver att du slutar fråga om det nu.

Det är viktigt för mig att du respekterar mitt beslut."

Vill du ha nästa steg?

Jag kan nu:

**A)** Göra en SMS-version som du kan skicka direkt

**B)** Göra en prata-ansikte-mot-ansikte-version

**C)** Göra en version som hanterar om han försöker pressa igen

Säg A, B eller C.`;
  return withReplyMeta(s, 'boundary_firm', 'next_step_v1', 'neutral');
}

export function generateBoundarySMS(): string {
  const s = `Här är SMS-versionen (kort och tydlig):

"Jag vet att du vill åka, men jag vill inte resa. Jag behöver att du slutar fråga om det. Tack för att du respekterar det."

Vill du anpassa denna eller vill du ha en annan variant?`;
  return withReplyMeta(s, 'boundary_sms', 'template_v1', 'neutral');
}

export function generateBoundaryFaceToFace(): string {
  const s = `Här är ansikte-mot-ansikte-versionen (varm men stadig):

"Jag vet att du verkligen vill åka, och jag förstår att det är viktigt för dig.

Men jag har bestämt mig för att jag inte vill resa, och det är inte något jag ändrar mig om.

Jag behöver att du respekterar det och slutar fråga om det. Det betyder mycket för mig."

Vill du anpassa denna eller vill du ha en annan variant?`;
  return withReplyMeta(s, 'boundary_facetoface', 'template_v1', 'neutral');
}

export function generateBoundaryPushback(): string {
  const s = `Här är versionen för om han försöker pressa igen:

"Jag har redan sagt att jag inte vill resa. Jag förstår att du är besviken, men mitt beslut står fast.

Jag behöver att du respekterar det och slutar fråga om det. Om du fortsätter fråga, kommer jag att behöva ta lite distans från samtalet."

Vill du anpassa denna eller vill du ha en annan variant?`;
  return withReplyMeta(s, 'boundary_pushback', 'template_v1', 'neutral');
}

