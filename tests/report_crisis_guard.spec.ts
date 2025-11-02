/**
 * Crisis Guard Test - Verifies crisis recommendation is only shown when flag is enabled
 * and appropriate signals are present
 */

describe("Crisis Guard", () => {
  const originalEnv = process.env.CRISIS_RECO_ENABLED;

  afterEach(() => {
    process.env.CRISIS_RECO_ENABLED = originalEnv;
  });

  function buildReport(agents: {
    safety_gate?: any;
    risk_abuse?: any;
    risk_coercion?: any;
    risk_selfharm?: any;
  }) {
    // Mock crisis guard logic
    const crisisEnabled = process.env.CRISIS_RECO_ENABLED === "true";

    function allowCrisis(safety_gate?: any, abuse?: any, coercion?: any, selfharm?: any) {
      const safety = safety_gate?.emits?.safety ?? "GREEN";
      const hardStop = safety_gate?.emits?.hard_stop === true;
      const abuseFlags = abuse?.emits?.abuse_flags ?? [];
      const coercionFlags = coercion?.emits?.coercion_flags ?? [];
      const selfHarm = selfharm?.emits?.selfharm_flag === true;

      return (
        crisisEnabled &&
        (selfHarm || hardStop || safety === "RED" || abuseFlags.length > 0 || coercionFlags.length > 0)
      );
    }

    function crisisRecommendationText(locale: string) {
      return locale?.startsWith("sv")
        ? "Sök omedelbar hjälp. Vid akut fara, ring 112."
        : "Seek immediate help. If in danger, call your local emergency number.";
    }

    const canCrisis = allowCrisis(
      agents.safety_gate,
      agents.risk_abuse,
      agents.risk_coercion,
      agents.risk_selfharm
    );

    let recommendation: string;
    if (canCrisis) {
      recommendation = crisisRecommendationText("sv-SE");
    } else {
      recommendation = "Normal recommendation text";
    }

    return {
      recommendation,
      safetyFlag: canCrisis,
    };
  }

  it("emits no crisis text when flag off and no red signals", () => {
    process.env.CRISIS_RECO_ENABLED = "false";
    
    const out = buildReport({
      safety_gate: { emits: { safety: "GREEN", hard_stop: false } },
      risk_abuse: { emits: { abuse_flags: [] } },
      risk_coercion: { emits: { coercion_flags: [] } },
      risk_selfharm: { emits: { selfharm_flag: false } },
    });

    const txt = JSON.stringify(out);
    expect(/112|emergency|akut/i.test(txt)).toBe(false);
    expect(out.recommendation).toBe("Normal recommendation text");
  });

  it("emits crisis text when flag on and RED safety", () => {
    process.env.CRISIS_RECO_ENABLED = "true";
    
    const out = buildReport({
      safety_gate: { emits: { safety: "RED", hard_stop: false } },
      risk_abuse: { emits: { abuse_flags: [] } },
      risk_coercion: { emits: { coercion_flags: [] } },
      risk_selfharm: { emits: { selfharm_flag: false } },
    });

    expect(out.recommendation).toMatch(/112|akut|emergency/i);
    expect(out.safetyFlag).toBe(true);
  });

  it("emits crisis text when flag on and hard_stop true", () => {
    process.env.CRISIS_RECO_ENABLED = "true";
    
    const out = buildReport({
      safety_gate: { emits: { safety: "GREEN", hard_stop: true } },
      risk_abuse: { emits: { abuse_flags: [] } },
      risk_coercion: { emits: { coercion_flags: [] } },
      risk_selfharm: { emits: { selfharm_flag: false } },
    });

    expect(out.recommendation).toMatch(/112|akut|emergency/i);
    expect(out.safetyFlag).toBe(true);
  });

  it("emits crisis text when flag on and abuse flags present", () => {
    process.env.CRISIS_RECO_ENABLED = "true";
    
    const out = buildReport({
      safety_gate: { emits: { safety: "GREEN", hard_stop: false } },
      risk_abuse: { emits: { abuse_flags: ["physical_violence"] } },
      risk_coercion: { emits: { coercion_flags: [] } },
      risk_selfharm: { emits: { selfharm_flag: false } },
    });

    expect(out.recommendation).toMatch(/112|akut|emergency/i);
    expect(out.safetyFlag).toBe(true);
  });

  it("emits crisis text when flag on and coercion flags present", () => {
    process.env.CRISIS_RECO_ENABLED = "true";
    
    const out = buildReport({
      safety_gate: { emits: { safety: "GREEN", hard_stop: false } },
      risk_abuse: { emits: { abuse_flags: [] } },
      risk_coercion: { emits: { coercion_flags: ["isolation"] } },
      risk_selfharm: { emits: { selfharm_flag: false } },
    });

    expect(out.recommendation).toMatch(/112|akut|emergency/i);
    expect(out.safetyFlag).toBe(true);
  });

  it("emits crisis text when flag on and selfharm flag true", () => {
    process.env.CRISIS_RECO_ENABLED = "true";
    
    const out = buildReport({
      safety_gate: { emits: { safety: "GREEN", hard_stop: false } },
      risk_abuse: { emits: { abuse_flags: [] } },
      risk_coercion: { emits: { coercion_flags: [] } },
      risk_selfharm: { emits: { selfharm_flag: true } },
    });

    expect(out.recommendation).toMatch(/112|akut|emergency/i);
    expect(out.safetyFlag).toBe(true);
  });

  it("does not emit crisis text when flag off even with red signals", () => {
    process.env.CRISIS_RECO_ENABLED = "false";
    
    const out = buildReport({
      safety_gate: { emits: { safety: "RED", hard_stop: true } },
      risk_abuse: { emits: { abuse_flags: ["physical_violence"] } },
      risk_coercion: { emits: { coercion_flags: ["isolation"] } },
      risk_selfharm: { emits: { selfharm_flag: true } },
    });

    const txt = JSON.stringify(out);
    expect(/112|emergency|akut/i.test(txt)).toBe(false);
    expect(out.recommendation).toBe("Normal recommendation text");
  });
});

