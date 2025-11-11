/**
 * Reply Core - Huvudreply-funktionen och grundläggande templates
 */

import { Slots } from './detectors';
import { withReplyMeta } from './reply_utils';

// ---- Svarsmall (AOAP + signatur) — en funktion, inga specialfall ----
export function reply({intent, mood, slots}: {intent: string; mood: string; slots: Slots}): string {
  // A: mikro-sammanfattning
  const micro = slots.action ? `Du vill ${slots.action}.` : `Jag lyssnar.`;

  // O/P: valfråga som styr
  const choiceQ = `Vill du fokusera på **kommunikation**, **gränser** eller **närvaro**?`;

  // A: mini-steg – alltid två neutrala alternativ
  const plan = `Två mini-steg:\n• Spegel + följdfråga\n• En sak i taget (byta tur)\nSvara 1 eller 2.`;

  if (mood === 'red') {
    // Om det är våldshot, hanteras det redan tidigare i routern
    // Detta är för andra typer av red-mood (självskada, etc.)
    return `Det här låter allvarligt. Om du är i fara – ring 112. Jag vill att du får stöd direkt.`;
  }

  if (intent === 'orientation') {
    return [
      "Jag är AI, ja.",
      "Min roll här är att hjälpa dig att förstå och navigera relationer – inte att döma eller styra.",
      "Vad fick dig att vilja skriva just nu?"
    ].join(" ");
  }

  if (intent === 'greeting') {
    // CASE-1-INTRO: Optimal första hälsning - lugnt, varmt, utan push
    // Fokuserar på trygghet + tillåtande tempo, reglerar nervsystemet först
    return `Hej. Jag är här.

Vi tar det i den takt som känns rimlig för dig.

Vad känns mest i kroppen just nu?`;
  }

  if (intent === 'clarify') {
    return `Kan du berätta lite mer vad du menar, så jag kan förstå bättre?`;
  }

  if (intent === 'choice') {
    // Hämta valet från meddelandet (lagra temporärt i globalThis för enkel access)
    const choiceVal = detectChoice((globalThis as any).__currentMsg || '');
    return `Klart. Vi kör på **val ${choiceVal}**.\n\n` +
           `Kvällens micro-plan (3 steg):\n1) Välj läge (middag/paus)\n2) Utför en gång\n3) Skriv ner 1 sak som funkade\n\nVill du ha en liten checklista att kopiera?`;
  }

  if (intent === 'recap') {
    return `${micro} Vill du att jag sammanfattar planen kort och låser ett mini-steg för i kväll?`;
  }

  if (intent === 'plan') {
    return `${micro}\n\n${choiceQ}\n\n${plan}`;
  }

  if (mood === 'plus') {
    return `Härligt! ${slots.action ? '' : 'Det här betyder något för dig.'}\n\n${choiceQ}`;
  }

  if (intent === 'probe') {
    return `${micro} Vad händer oftast precis innan det skaver?`;
  }

  return `${micro} Vill du att vi tar fram ett första mini-steg idag?`;
}

// Import för choice-detektion
import { detectChoice } from './detectors';

// Export Slots type för användning i andra moduler
export type { Slots } from './detectors';

