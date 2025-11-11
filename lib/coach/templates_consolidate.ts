// lib/coach/templates_consolidate.ts

/**
 * CONSOLIDATE-template: Sammanfatta många korta fragment till ett stödjande svar
 * Ton: Stödjande & stabil
 */
export function consolidateReply(theme: string, summary: string): string {
  const themeText = theme || "det du beskriver";
  
  return [
    `Jag ser tråden i det du delat: ${themeText}.`,
    `Det är mycket på en gång, och det är normalt att det känns tungt.`,
    `1) Sätt ord på det som känns starkast (ett ord räcker).`,
    `2) Välj en 10-min sak som stöttar dig idag (promenad, ring en vän, musik).`,
    `Vad känns mest rätt att börja med?`
  ].join("\n\n");
}

