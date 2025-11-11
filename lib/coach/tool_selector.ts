export type Insight = {
  risk?: { label: string; score: number }; // t.ex. {label:"eskalerande konflikt", score:0.7}
  goals: { label: string; weight?: number }[];
  patterns: string[]; // fria strängar
  recos: { label: string; confidence: number }[];
};

export type ToolKey = "breathing60" | "threeThings" | "iMessage" | "pauseMode";

export function chooseToolFromInsights(ins: Insight): ToolKey {
  const risk = ins.risk?.label?.toLowerCase() ?? "";
  const riskScore = ins.risk?.score ?? 0;
  const goals = ins.goals.map((g) => g.label.toLowerCase());
  const text = (ins.patterns.join(" ") + " " + ins.recos.map((r) => r.label).join(" ")).toLowerCase();

  // 1) Akut/låg tolerans → andningsankare först
  if (risk.includes("kris") || risk.includes("eskaler") || text.includes("panik") || riskScore >= 0.7) {
    return "breathing60";
  }

  // 2) Konflikt/upptrappning → pausläge
  if (text.includes("bråk") || text.includes("konflikt") || goals.includes("deeskalera")) {
    return "pauseMode";
  }

  // 3) Kommunikation som mål → jag-budskap
  if (goals.includes("kommunikation") || text.includes("svårt att säga") || text.includes("säga utan bråk")) {
    return "iMessage";
  }

  // 4) Diffust/oklart → sortera tre saker
  return "threeThings";
}

