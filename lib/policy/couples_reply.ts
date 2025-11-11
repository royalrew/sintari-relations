type Affect = "low" | "medium" | "high";

const STEP_SEQUENCE = [
  "Paus: ta en minut och andas, gärna på var sitt håll.",
  "Spegel: återge lugnt vad du hörde din partner säga, utan att lägga till egna tolkningar.",
  "Bekräfta: nämn en sak du förstår eller kan känna igen i det din partner berättade.",
  "Behov: säg ett konkret behov eller önskan du själv har, en mening i taget.",
];

export function composeCouplesReply(params: {
  partnerName?: string;
  affect: Affect;
}): string {
  const { partnerName, affect } = params;
  const nameHint = partnerName ? ` mellan dig och ${partnerName}` : "";

  const opening =
    affect === "high"
      ? "Jag vill hjälpa er att hitta lugn och kontakt mitt i det som känns stormigt."
      : "Jag hjälper er båda att landa och prata vidare på ett sätt som för er närmare.";

  const sequence = STEP_SEQUENCE.map((step, index) => `${index + 1}) ${step}`).join(" ");

  const closing =
    "Vilket av stegen känner ni er redo att testa först? Säg till om ni vill att jag guidar igenom det.";

  return `${opening}${nameHint} ${sequence} ${closing}`.trim();
}

