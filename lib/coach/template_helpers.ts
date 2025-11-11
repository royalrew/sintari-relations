/**
 * Template Helpers - Hjälpfunktioner för template-hantering
 */

export function detectNumericChoice(s?: string): null | number {
  if (!s) return null;
  const m = s.trim().match(/^(?:val\s*)?([1-9])\b/iu);
  return m ? parseInt(m[1], 10) : null;
}

export function extractLastGoalFromConversation(conv?: Array<{role:'user'|'assistant'; content:string}>): string | null {
  if (!conv) return null;
  const text = conv.map(m => m.content).join('\n').toLowerCase();
  const m = text.match(/bli en bättre livskamrat|bättre partner|bättre pojkvän|bättre flickvän|bättre sambo/iu);
  if (m) return "bli en bättre livskamrat";
  // fallback: försök plocka efter "jag vill …"
  const g = text.match(/jag vill\s+(?:bli|vara|kunna|förbättra)\s+([^.\n]+)/i);
  return g ? g[0] : null;
}

export function isPositiveShort(s?: string): boolean {
  if (!s) return false;
  const t = s.toLowerCase();
  return (t.length <= 24) && /(kul|härligt|vad roligt|nice|bra|toppen|grymt|fantastiskt|perfekt|underbart|jättebra|super|awesome|cool|schysst|trevligt|mysigt|fint|bra gjort|bra jobbat|tack|tack så mycket|tackar|tackar så mycket)/i.test(t);
}

export function isSiblingConflict(text: string): boolean {
  const rx = /(barn|son|dotter|syskon).*?(bråk|bråka|konflikt)|bråk.*?(son|dotter|syskon)/i;
  return rx.test(text);
}

export function wantsAction(userMessage?: string): boolean {
  if (!userMessage) return false;
  return /(vill|ska|måste|behöver|försöker|planerar|tänker|kommer)\s+(?:göra|ta|få|ha|bli|vara|kunna|säga|skriva|ringa|träffa|möta|besöka|åka|resa|flytta|byta|sluta|börja|starta|börja|börja|börja)/i.test(userMessage);
}

