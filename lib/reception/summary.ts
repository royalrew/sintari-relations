import { EmotionCurve, summaryCurve } from "@/lib/reception/hooks";

export interface SummaryInput {
  userSnippets: string[]; // senaste 3–6 user-meddelanden (kortade)
  goals?: string[]; // enkla strängar, frivilligt
  curveHistory: EmotionCurve[];
}

export interface SummaryResult {
  title: string;
  bullets: string[];
  tone: "mjuk-neutral" | "mjuk-varm" | "mjuk-sårbar" | "mjuk-stabiliserande" | "mjuk-bekräftande";
  suggestion: string; // valfri, kort och icke-krävande
  qualityHint?: string; // tips för att höja analyskvalitet
}

export function generateReceptionSummary(inp: SummaryInput): SummaryResult {
  const curve = summaryCurve(inp.curveHistory);
  const mostRecent = inp.userSnippets.at(-1) ?? "";
  const short = mostRecent.length > 140 ? mostRecent.slice(0, 140) + "…" : mostRecent;

  let tone: SummaryResult["tone"] = "mjuk-neutral";
  if (curve === "down") tone = "mjuk-sårbar";
  if (curve === "up") tone = "mjuk-bekräftande";
  if (curve === "flare") tone = "mjuk-stabiliserande";

  const title =
    curve === "down"
      ? "Det låter tungt – du är mottagen"
      : curve === "flare"
      ? "Vi landar lugnt tillsammans"
      : curve === "up"
      ? "Det rör sig åt rätt håll"
      : "Du är välkommen att landa här";

  const bullets: string[] = [];
  if (short) bullets.push(`Senast: "${short}"`);
  if (inp.goals?.length) bullets.push(`Önskan/mål: ${inp.goals.slice(0, 2).join(", ")}`);
  bullets.push(
    curve === "down"
      ? "Tonen har varit tyngre en stund."
      : curve === "flare"
      ? "Det kom upp starka känslor nyss."
      : curve === "up"
      ? "Tonen känns något ljusare nu."
      : "Tonen har varit jämn."
  );

  const suggestion =
    curve === "flare"
      ? "Om du vill kan vi pausa 60 sekunder. Jag är kvar här, utan att driva på."
      : curve === "down"
      ? "Om du vill kan vi hålla det enkelt och bara stanna vid det som gör mest ont."
      : "Om du vill kan jag föreslå nästa steg – eller så fortsätter vi fritt.";

  const qualityHint = "Tips: känsla + vad som hände + vad du önskar → bättre analys.";

  return { title, bullets, tone, suggestion, qualityHint };
}

