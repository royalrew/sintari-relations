// Safety detection för fysisk våld, hot och risk-mönster
export interface SafetyResult {
  safety: "OK" | "YELLOW" | "RED";
  red_spans: Array<{start: number, end: number, label: string}>;
  violence_indicators: string[];
  risk_areas: string[];
  risk_spans: Array<{start: number, end: number, label: string}>;
}

export function detectViolence(text: string): SafetyResult {
  if (!text || !text.trim()) {
    return { 
      safety: "OK", 
      red_spans: [], 
      violence_indicators: [], 
      risk_areas: [],
      risk_spans: []
    };
  }

  // Normalisera text för bättre matching
  const normalized = text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  
  // Violence patterns (svenska + engelska)
  const violencePatterns = [
    // Svenska
    { pattern: /\bvi\s+sl(ass|ogs)\b/, label: "fysisk_våld" },
    { pattern: /\bhan\s+sl(og|år)\s+mig\b/, label: "fysisk_våld" },
    { pattern: /\bmisshandel\b/, label: "fysisk_våld" },
    { pattern: /\bknuffar\b/, label: "fysisk_våld" },
    { pattern: /\bslår\b/, label: "fysisk_våld" },
    { pattern: /\bvåld\b/, label: "fysisk_våld" },
    { pattern: /\bagressiv\b/, label: "fysisk_våld" },
    { pattern: /\bfysisk\s+våld\b/, label: "fysisk_våld" },
    
    // Engelska
    { pattern: /\bwe\s+fight\b/, label: "fysisk_våld" },
    { pattern: /\bhe\s+hit\s+me\b/, label: "fysisk_våld" },
    { pattern: /\bphysical\s+violence\b/, label: "fysisk_våld" },
    { pattern: /\bassault\b/, label: "fysisk_våld" },
    { pattern: /\babuse\b/, label: "fysisk_våld" },
    { pattern: /\bdomestic\s+violence\b/, label: "fysisk_våld" }
  ];

  const redSpans: Array<{start: number, end: number, label: string}> = [];
  const violenceIndicators: string[] = [];
  const riskAreas: string[] = [];
  const riskSpans: Array<{start: number, end: number, label: string}> = [];

  // Testa alla violence patterns
  for (const { pattern, label } of violencePatterns) {
    const matches = normalized.match(pattern);
    if (matches) {
      violenceIndicators.push(label);
      
      // Hitta positioner i originaltexten
      const match = pattern.exec(normalized);
      if (match) {
        const start = match.index;
        const end = start + match[0].length;
        redSpans.push({ start, end, label });
      }
    }
  }

  // Risk-mönster detection (YELLOW safety)
  const riskPatterns = [
    // Otrohet
    { pattern: /\botro(gen|het)\b/, label: "otrohet", riskArea: "otrohet" },
    { pattern: /\bvar\s+otrogen\b/, label: "otrohet", riskArea: "otrohet" },
    { pattern: /\bcheat(ed|ing)\b/, label: "otrohet", riskArea: "otrohet" },
    { pattern: /\binfidelity\b/, label: "otrohet", riskArea: "otrohet" },
    
    // Verbal kränkning
    { pattern: /\bhemska\s+saker\b/, label: "verbal_kränkning", riskArea: "verbal kränkning" },
    { pattern: /\bförolämp(ar|ning)\b/, label: "verbal_kränkning", riskArea: "verbal kränkning" },
    { pattern: /\bkränk(ar|ning)\b/, label: "verbal_kränkning", riskArea: "verbal kränkning" },
    { pattern: /\bnedvärder(ar|ing)\b/, label: "verbal_kränkning", riskArea: "verbal kränkning" },
    { pattern: /\bhorrible\s+things\b/, label: "verbal_kränkning", riskArea: "verbal kränkning" },
    { pattern: /\binsult(s|ing)\b/, label: "verbal_kränkning", riskArea: "verbal kränkning" },
    
    // Förlåtelsecykel - utökade patterns för hela kedjan
    { pattern: /\bsäger\s+förlåt\b/, label: "ursäkt", riskArea: "förlåtelsecykel" },
    { pattern: /\bbad\s+om\s+ursäkt\b/, label: "ursäkt", riskArea: "förlåtelsecykel" },
    { pattern: /\blovar.*inte\s+göra\s+det\s+igen\b/, label: "förlåtelsecykel_löfte", riskArea: "förlåtelsecykel" },
    { pattern: /\bpromise.*not\s+to\s+do\s+it\s+again\b/, label: "förlåtelsecykel_löfte", riskArea: "förlåtelsecykel" },
    { pattern: /\bförlåter\s+honom\b/, label: "förlåtelse", riskArea: "förlåtelsecykel" },
    { pattern: /\bförlåtelse\b/, label: "förlåtelse", riskArea: "förlåtelsecykel" },
    { pattern: /\bigen\b/, label: "upprepning", riskArea: "förlåtelsecykel" },
    { pattern: /\bupprepa\b/, label: "upprepning", riskArea: "förlåtelsecykel" },
    
    // Gaslighting-hint
    { pattern: /\bdu\s+överreagerar\b/, label: "gaslighting_möjlig", riskArea: "gaslighting_möjlig" },
    { pattern: /\binbillar\s+dig\b/, label: "gaslighting_möjlig", riskArea: "gaslighting_möjlig" },
    { pattern: /\bdet\s+har\s+inte\s+hänt\b/, label: "gaslighting_möjlig", riskArea: "gaslighting_möjlig" },
    { pattern: /\byou\s+overreact\b/, label: "gaslighting_möjlig", riskArea: "gaslighting_möjlig" }
  ];

  // Testa risk patterns
  for (const { pattern, label, riskArea } of riskPatterns) {
    const matches = normalized.match(pattern);
    if (matches) {
      if (!riskAreas.includes(riskArea)) {
        riskAreas.push(riskArea);
      }
      
      // Hitta positioner i originaltexten
      const match = pattern.exec(normalized);
      if (match) {
        const start = match.index;
        const end = start + match[0].length;
        riskSpans.push({ start, end, label });
      }
    }
  }

  // Ytterligare kontroller för våldsindikatorer
  const violenceKeywords = [
    "slåss", "slå", "knuffa", "sparka", "bit", "kasta", "skada",
    "fight", "hit", "punch", "kick", "hurt", "harm", "injure"
  ];

  for (const keyword of violenceKeywords) {
    if (normalized.includes(keyword)) {
      violenceIndicators.push("våldsindikator");
    }
  }

  const hasViolence = redSpans.length > 0 || violenceIndicators.length > 0;
  const hasRisk = riskSpans.length > 0 || riskAreas.length > 0;

  // Bestäm safety level: RED > YELLOW > OK
  let safety: "OK" | "YELLOW" | "RED" = "OK";
  if (hasViolence) {
    safety = "RED";
  } else if (hasRisk) {
    safety = "YELLOW";
  }

  return {
    safety,
    red_spans: redSpans,
    violence_indicators: violenceIndicators,
    risk_areas: riskAreas,
    risk_spans: riskSpans
  };
}
