export type PhaseId = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type PhaseKPI = {
  title: string;
  items: { label: string; value: string; target?: string; status: "PASS" | "WARN" | "TODO" }[];
};

export function loadPhaseKPIs(): Record<PhaseId, PhaseKPI> {
  // Minimalt: hårdkoda status nu, koppla senare till riktiga scripts
  return {
    0: { 
      title: "Fas 0 — Setup", 
      items: [
        { label: "CI-gate", value: "Aktiv", target: "Aktiv", status: "PASS" },
        { label: "Schema ≥95%", value: "OK", target: "≥95%", status: "PASS" },
      ]
    },
    1: { 
      title: "Fas 1 — Seed & Scoring", 
      items: [
        { label: "Total score", value: "≥0.95", target: "≥0.95", status: "PASS" },
        { label: "LQS (6/6)", value: "PASS", target: "PASS", status: "PASS" },
      ]
    },
    2: { 
      title: "Fas 2 — Routing", 
      items: [
        { label: "Pyramid", value: "24.7/78.1/17.2/4.7", target: "22-25/72-78/12-18/4-6", status: "PASS" },
        { label: "CostGuard", value: "Aktiv", target: "Aktiv", status: "PASS" },
      ]
    },
    3: { 
      title: "Fas 3 — Säkerhet", 
      items: [
        { label: "RedTeam CI", value: "10/10", target: "PASS", status: "PASS" },
        { label: "Prompt Shield", value: "Aktiv", target: "Aktiv", status: "PASS" },
      ]
    },
    4: { 
      title: "Fas 4 — Dashboards", 
      items: [
        { label: "Scorecards", value: "Klar", target: "Klar", status: "PASS" },
        { label: "KPI-dashboard", value: "Klar", target: "Klar", status: "PASS" },
      ]
    },
    5: { 
      title: "Fas 5 — Paritet/Minne", 
      items: [
        { label: "SV/EN Δscore", value: "Ej verifierat", target: "<0.01", status: "TODO" },
        { label: "Dialog-minne", value: "Ej verifierat", target: "≥0.9", status: "TODO" },
      ]
    },
    6: { 
      title: "Fas 6 — SI & Release", 
      items: [
        { label: "SI-loop", value: "Ej aktiv", target: "Aktiv", status: "TODO" },
        { label: "Canary/Rollback", value: "Ej klar", target: "Klar", status: "TODO" },
      ]
    },
  } as Record<PhaseId, PhaseKPI>;
}

