# Coach Pipeline Roadmap

## Översikt

Detta dokument beskriver den planerade utvecklingen av coach-pipelinen från nuvarande template-baserad implementation till en hybrid LLM + template-lösning med förbättrad kvalitetssäkring och rollout-strategi.

## Nuvarande Status

### ✅ Redan Implementerat

- **Pre-gates**: `consent`, `safety_gate`, `risk_*` agents, `crisis_router`
- **Signal-agenter**: `micro_mood`, `dialog_memory_v2`, `persona_agent`, `coach_insights`
- **Intent routing**: `determineIntent()` med `goal`, `feeling`, `greeting`, `clarify`, `ground`
- **Templates**: `generateGreeting()`, `generateGoal()`, `generateGround()`, `generateClarify()`, `generateSpeakGoal()`, `generateGeneric()`
- **Post-processing**: `tone_fixer`, `question_guard`
- **Quality review**: GPT-5 Teacher (granskar svaren)
- **Analysis templates**: `ANALYS_SOFT`, `ANALYS_DEEP`, `ANALYS_GROUNDING`

### ⚠️ Delvis Implementerat

- **Memory ingest**: Implementerat men kan förbättras
- **Calibration logging**: Implementerat men behöver dashboard
- **Telemetry**: Grundläggande logging finns, behöver struktur

### 🆕 Saknas

- **PLAN mode**: `generatePlan()` template
- **Hybrid LLM**: `micro_writer` för konkretisering
- **AdviceEngine**: Specifika rådgivare för humor, speak, boundaries
- **Targeted repair**: Automatisk reparation baserat på teacher feedback
- **Shadow mode**: Logging utan blockering
- **Rollout strategy**: Soft → Hard block
- **Calibration dashboard**: Drift-detection och threshold-adjustment

---

## Topp-förbättringar (Hög Effekt, Låg Friktion)

### Prioritet 1: Direkt Implementation

1. **PLAN-mode**: Implementera direkt (3 steg / 24h, ≤120 ord, 1 fråga)
2. **AdviceEngine**: Tre buckets räcker nu (humor, speak, boundaries) + generic
3. **Hybrid-guard**: `needsMicro()` utan teacher-cirklar (bra heuristik redan)
4. **Micro-writer SLO**: Timeout 200ms, rate ≤15%, token-tak 90, fallback → AdviceEngine
5. **Cache för coach_insights**: TTL 60–90s + max 100 entries + LRU
6. **Targeted repair**: 1 pass max; höj endast empathy<6 / clarity<7 / actionability<7
7. **Telemetry**: JSONL per tur med `mode`, `intent`, `template`, `usedMicro`, `teacher.overall`, `latency_p95`
8. **Golden-tests**: Lägg till fyra nya: PLAN-trigger, micro-writer timeout, needsMicro edge-case, targeted-repair
9. **Shadow → Soft → Hard**: Håll shadow 2–4h, soft 24h, sätt env-toggles (`SHADOW_MODE`, `SOFT_BLOCK`, `HARD_BLOCK`)
10. **Cost/latens-vakt**: Logga `tokens_in/out`, `mikro-andel`, och budget-breakers (alert vid p95>900ms)

### Små men Viktiga Detaljer

- **Intent "plan"**: Trigga på `hur gör jag|plan|steg för steg` ELLER ≥3 GUIDE-turer
- **Question budget**: ≤1 fråga/tur och ≤1/3 senaste turer (behåll guard)
- **Robotfras-filter**: Blockerar "Jag hör att / Du säger att" före teacher
- **Variety**: 5–8 parafraser per AdviceEngine-rad (undvik "samma svar"-känsla)
- **PII/telemetry**: Skriv aldrig rå user-text i loggar; lagra bara intent/mode/flags
- **Injection-skydd i micro_writer**: Skicka sanitär context (inga råa systemprompter)
- **User-pref**: Spara `advice_pref` (opt-in), så GUIDE inte upplevs påträngande
- **KPI-ramp**: Börja Teacher-mål ≥7.0, höj till 7.5→7.8 efter 1–2 veckor

---

## Implementation Roadmap

### Fas 1: Grundläggande Förbättringar (48 timmar)

**Mål**: Komplettera nuvarande template-system och förbättra kvalitetssäkring.

#### 1.1 Lägg till PLAN Mode Template

**Fil**: `lib/coach/templates_v1.ts`

```typescript
function generatePlan(
  goal: string,
  hints?: TemplateParams['hints'],
  persona?: TemplateParams['persona']
): string {
  // 3-stegs 24h mini-plan baserat på målet
  // Max 120 ord, max 1 fråga
  // Teacher score target: ≥7.0 (vecka 1), →7.8 (vecka 3)
}
```

**Trigger**: 
- Användaren frågar "hur gör jag" eller "plan" eller "steg för steg"
- Efter ≥3 GUIDE-turns med samma mål
- Intent: `plan` (ny intent)

**Acceptanskriterier**:
- ✅ Template genererar 3 konkreta steg för 24h
- ✅ Max 120 ord
- ✅ Max 1 fråga
- ✅ Teacher score ≥7.0 på golden test (vecka 1)

#### 1.2 Förbättra Intent Detection för PLAN

**Fil**: `lib/coach/orchestrateCoachReply.ts`

```typescript
function determineIntent(...): TemplateParams['intent'] {
  // Lägg till:
  if (/hur gör jag|plan|steg för steg|vad ska jag/i.test(userMessage)) {
    return 'plan';
  }
  
  // Efter ≥3 GUIDE-turns med samma mål
  const recentGuideTurns = conversation
    .filter(m => m.role === 'assistant')
    .slice(-3)
    .filter(m => m.content.includes('steg') || m.content.includes('tips'));
  if (recentGuideTurns.length >= 3 && intent === 'goal') {
    return 'plan';
  }
  // ...
}
```

#### 1.3 Förbättra Cache för coach_insights (LRU + TTL)

**Fil**: `lib/coach/refinement_helpers.ts`

```typescript
import { LRUCache } from 'lru-cache'; // npm install lru-cache

const insightsCache = new LRUCache<string, { data: any; timestamp: number }>({
  max: 100, // Max 100 entries
  ttl: 75000, // 75 sekunder (mellan 60-90s)
  updateAgeOnGet: false,
});

export async function getCoachInsights(...) {
  const cacheKey = `${threadId}-${conversation.length}`;
  const cached = insightsCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < 90000) { // Max 90s TTL
    return cached.data;
  }
  
  // Fetch new insights...
  const insights = await fetchInsights(...);
  insightsCache.set(cacheKey, { data: insights, timestamp: Date.now() });
  return insights;
}
```

**Acceptanskriterier**:
- ✅ Cache fungerar med 60-90s TTL
- ✅ LRU eviction när max 100 entries nås
- ✅ Cache hit rate ≥70%

#### 1.4 Strukturera Telemetry Logging (JSONL + Cost Tracking)

**Fil**: `lib/telemetry/coach_logger.ts` (ny)

```typescript
export interface CoachLogEntry {
  timestamp: number;
  threadId: string; // Hashad, inte rå ID
  mode: string; // GUIDE, EXPLORE, PLAN, CRISIS
  intent: string; // goal, feeling, plan, greeting, etc.
  template: string; // generateGoal, generatePlan, etc.
  usedMicro: boolean; // Användes micro_writer?
  teacher: {
    overall?: number;
    empathy?: number;
    clarity?: number;
    actionability?: number;
  };
  latency_p95?: number; // P95 latency för denna turn
  tokens_in?: number; // Om micro_writer användes
  tokens_out?: number;
  flags?: string[]; // robot_phrase, over_mirroring, etc.
  // INGEN rå user-text eller PII
}

export function logCoachTurn(entry: CoachLogEntry): void {
  // Logga till JSONL-fil: data/telemetry/coach-{date}.jsonl
  // Rotera dagligen
  // Alert om latency_p95 > 900ms eller mikro-andel > 15%
}
```

**Acceptanskriterier**:
- ✅ Loggar till JSONL-format
- ✅ Ingen PII i loggar (ingen rå user-text)
- ✅ Loggar `tokens_in/out` för cost tracking
- ✅ Alert vid p95>900ms eller mikro-andel>15%
- ✅ Loggar roteras dagligen

---

### Fas 2: Hybrid LLM Integration (2-3 veckor)

**Mål**: Introducera `micro_writer` för att konkretisera templates när de inte räcker.

#### 2.1 Implementera AdviceEngine (Med Variety)

**Fil**: `lib/coach/advice_engine.ts` (ny)

```typescript
export interface AdviceResult {
  intro: string;
  tip1: string;
  tip2: string;
  check: string; // Fråga för att kolla friction
}

// 5-8 parafraser per rådgivare för variety
const HUMOR_INTROS = [
  "Jag hör att du vill göra dina skämt roligare och lättare att landa.",
  "Det låter som att du vill att dina skämt ska få folk att skratta mer.",
  "Jag förstår att du vill bli bättre på att berätta skämt som landar.",
  // ... 5-8 totalt
];

const HUMOR_TIPS_1 = [
  "Pausa en halv sekund före punchline – det gör att publiken 'hinner med'.",
  "Testa att vänta lite innan du avslutar skämtet, så hinner publiken processa.",
  // ... 5-8 totalt
];

export const AdviceEngine = {
  humor: (goal: string): AdviceResult => {
    return {
      intro: HUMOR_INTROS[Math.floor(Math.random() * HUMOR_INTROS.length)],
      tip1: HUMOR_TIPS_1[Math.floor(Math.random() * HUMOR_TIPS_1.length)],
      tip2: HUMOR_TIPS_2[Math.floor(Math.random() * HUMOR_TIPS_2.length)],
      check: HUMOR_CHECKS[Math.floor(Math.random() * HUMOR_CHECKS.length)],
    };
  },
  
  speak: (goal: string): AdviceResult => {
    // Samma struktur med 5-8 parafraser
  },
  
  boundaries: (goal: string): AdviceResult => {
    // Samma struktur med 5-8 parafraser
  },
  
  generic: (goal: string): AdviceResult => {
    // Generell fallback med variety
  }
};
```

**Acceptanskriterier**:
- ✅ 3 specifika rådgivare (humor, speak, boundaries) + generic
- ✅ 5-8 parafraser per rådgivare för variety
- ✅ Varje råd ger 2 konkreta tips + 1 check-fråga
- ✅ Max 90 ord totalt
- ✅ Ingen blame language

#### 2.2 Implementera needsMicro() Heuristik (Utan Teacher-Cirklar)

**Fil**: `lib/coach/micro_router.ts` (ny)

```typescript
export function needsMicro(
  draft: string,
  intent: string,
  userMessage: string,
  flags?: { robot_phrase?: boolean; over_mirroring?: boolean }
): boolean {
  // 1) Goal utan konkreta steg
  if (intent === 'goal' && !hasTwoConcreteSteps(draft)) {
    return true;
  }
  
  // 2) Robot-fraser eller över-spegling (detekteras före teacher)
  if (flags?.robot_phrase || flags?.over_mirroring) {
    return true;
  }
  
  // 3) För kort draft för goal (saknar konkretisering)
  if (intent === 'goal' && draft.length < 40) {
    return true;
  }
  
  // 4) Explicit användarfråga om tips
  if (/tips|råd|hjälp med|hur gör jag/i.test(userMessage)) {
    return true;
  }
  
  // INTE: teacher_pred<7.5 (cirkulär dependency)
  
  return false;
}

function hasTwoConcreteSteps(text: string): boolean {
  // Kolla om texten innehåller 2 konkreta steg (nummer eller "1)" "2)")
  const stepPattern = /(\d+\)|1\.|2\.|Först|Sedan|Steg \d+)/gi;
  const matches = text.match(stepPattern);
  return matches ? matches.length >= 2 : false;
}
```

**Acceptanskriterier**:
- ✅ `needsMicro()` returnerar korrekt för edge cases
- ✅ Max 15% av trafiken triggar micro_writer
- ✅ Ingen teacher-cirkel (använder heuristik endast)
- ✅ Heuristik är testbar (unit tests)

#### 2.3 Implementera micro_writer med Timeout/Fallback

**Fil**: `lib/coach/micro_writer.ts` (ny)

```typescript
export interface MicroWriterParams {
  userInput: string;
  draft: string;
  hints?: any;
  mode: 'GUIDE' | 'EXPLORE' | 'PLAN';
  adviceType?: 'humor' | 'speak' | 'boundaries' | 'generic';
}

export async function microWriter(params: MicroWriterParams): Promise<string> {
  const { userInput, draft, hints, mode, adviceType = 'generic' } = params;
  
  // 1) Försök hämta från AdviceEngine först (snabbare, mer kontrollerat)
  if (adviceType !== 'generic' && AdviceEngine[adviceType]) {
    const advice = AdviceEngine[adviceType](userInput);
    return formatAdvice(advice, params);
  }
  
  // 2) Om AdviceEngine inte räcker, använd LLM (gpt-4o-mini)
  try {
    const llmResult = await Promise.race([
      callMicroLLM(userInput, draft, hints, mode),
      new Promise<string>((_, reject) => 
        setTimeout(() => reject(new Error('timeout')), 200)
      )
    ]);
    
    return llmResult;
  } catch (error) {
    // Fallback till original draft eller AdviceEngine.generic
    console.warn('[MICRO_WRITER] LLM failed, using fallback:', error);
    const advice = AdviceEngine.generic(userInput);
    return formatAdvice(advice, params);
  }
}

async function callMicroLLM(
  userInput: string,
  draft: string,
  hints: any,
  mode: string
): Promise<{ text: string; tokens_in: number; tokens_out: number }> {
  const openai = await getOpenAIClient();
  
  // Sanitär context (inga råa systemprompter, injection-skydd)
  const sanitizedDraft = draft.slice(0, 200); // Max 200 tecken
  const sanitizedGoal = userInput.slice(0, 100); // Max 100 tecken
  
  const prompt = `Du är en coach som konkretiserar råd. Parafrasera och konkretisera följande draft så att den ger 2 konkreta, handlingsbara steg.

Draft: "${sanitizedDraft}"
Användarens mål: "${sanitizedGoal}"

Krav:
- Max 90 ord totalt
- 2 konkreta steg (nummerade)
- 1 fråga för att kolla friction
- Ingen ny information som inte finns i draft
- Svenska endast

Svara med formatet:
[Intro mening]
1) [Första steget]
2) [Andra steget]
[Fråga]`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini", // Billig modell
    messages: [
      { role: "system", content: "Du är en coach som konkretiserar råd. Svara alltid på svenska." },
      { role: "user", content: prompt }
    ],
    max_tokens: 90, // Token-tak 90
    temperature: 0.2, // Låg för konsistens
  });
  
  const text = completion.choices[0]?.message?.content || draft;
  const tokens_in = completion.usage?.prompt_tokens || 0;
  const tokens_out = completion.usage?.completion_tokens || 0;
  
  return { text, tokens_in, tokens_out };
}
```

**Acceptanskriterier**:
- ✅ Timeout: 200ms max, annars fallback
- ✅ Rate limiting: Max 15% av trafiken
- ✅ Token-tak: 90 tokens output
- ✅ Fallback till AdviceEngine.generic om LLM misslyckas
- ✅ Max 90 ord output
- ✅ 2 konkreta steg alltid
- ✅ Ingen ny information (endast parafrasering)
- ✅ Injection-skydd: Sanitär context, max längd
- ✅ Loggar tokens_in/out för cost tracking

#### 2.4 Integrera micro_writer i Pipeline

**Fil**: `lib/coach/orchestrateCoachReply.ts`

```typescript
// Efter template selection, före tone_fixer:
let reply = selectTemplate(templateParams);

// Hybrid LLM: Kolla om micro_writer behövs
if (intent === 'goal' || intent === 'plan') {
  const needsMicro = checkNeedsMicro(reply, intent, {
    robot_phrase: false, // Ska sättas av tone_fixer senare
    over_mirroring: false,
  });
  
  if (needsMicro) {
    const adviceType = detectAdviceType(userMessage); // humor, speak, boundaries, generic
    try {
      reply = await microWriter({
        userInput: userMessage,
        draft: reply,
        hints: insights,
        mode: intent === 'goal' ? 'GUIDE' : 'PLAN',
        adviceType,
      });
    } catch (error) {
      console.warn('[ORCHESTRATE] micro_writer failed, using template:', error);
      // Behåll original reply
    }
  }
}

// Fortsätt med tone_fixer...
```

**Acceptanskriterier**:
- ✅ micro_writer integrerad i pipeline
- ✅ Fallback fungerar korrekt
- ✅ Max 15% av trafiken använder micro_writer
- ✅ P95 latency <900ms även med micro_writer

---

### Fas 3: Kvalitetssäkring och Rollout (2-3 veckor)

**Mål**: Förbättra kvalitetssäkring och implementera säker rollout-strategi.

#### 3.1 Implementera Targeted Repair (1 Pass Max)

**Fil**: `lib/coach/targeted_repair.ts` (ny)

```typescript
export interface RepairParams {
  text: string;
  teacherReview: {
    feedback: {
      overallScore: number;
      criteria?: {
        empathy?: number;
        clarity?: number;
        actionability?: number;
      };
      weaknesses?: string[];
      suggestions?: string[];
    };
  };
  intent: string;
}

export function targetedRepair(params: RepairParams): { text: string; repaired: boolean } {
  const { text, teacherReview, intent } = params;
  let repaired = text;
  let wasRepaired = false;
  
  const feedback = teacherReview.feedback;
  
  // 1) Låg empati (<6) → Lägg till kort empati-fras
  if (feedback.criteria?.empathy && feedback.criteria.empathy < 6) {
    repaired = addEmpathyIfMissing(repaired, intent);
    wasRepaired = true;
  }
  
  // 2) Låg clarity (<7) → Förtydliga frågor och steg
  if (feedback.criteria?.clarity && feedback.criteria.clarity < 7) {
    repaired = clarifyQuestionsAndSteps(repaired);
    wasRepaired = true;
  }
  
  // 3) Låg actionability (<7) → Säkerställ 2 konkreta steg
  if (feedback.criteria?.actionability && feedback.criteria.actionability < 7 && intent === 'goal') {
    repaired = ensureTwoConcreteSteps(repaired);
    wasRepaired = true;
  }
  
  // INTE: Ta bort vaghet baserat på suggestions (för komplex, kan vänta)
  
  return { text: repaired, repaired: wasRepaired };
}
```

**Acceptanskriterier**:
- ✅ Targeted repair höjer endast empathy<6 / clarity<7 / actionability<7
- ✅ 1 pass max (ingen loop)
- ✅ Behåller original struktur och intent
- ✅ Loggar "repaired: true/false" för telemetry

#### 3.2 Implementera Shadow Mode

**Fil**: `lib/coach/shadow_mode.ts` (ny)

```typescript
export interface ShadowModeConfig {
  enabled: boolean;
  logOnly: boolean; // Om true, logga men blockera inte
  sampleRate: number; // 0.0 - 1.0, hur många % av trafiken
}

export async function shadowModeCheck(
  safetyResult: any,
  config: ShadowModeConfig
): Promise<{ blocked: boolean; log: boolean }> {
  if (!config.enabled) {
    return { blocked: false, log: false };
  }
  
  // Logga alltid om shadow mode är på
  const shouldLog = Math.random() < config.sampleRate;
  
  if (config.logOnly) {
    // Shadow mode: Logga men blockera inte
    if (shouldLog) {
      await logShadowMode({
        safetyResult,
        timestamp: Date.now(),
        action: safetyResult.blocked ? 'would_block' : 'would_allow',
      });
    }
    return { blocked: false, log: shouldLog };
  }
  
  // Normal mode: Blockera om RED
  return {
    blocked: safetyResult.blocked || false,
    log: shouldLog,
  };
}
```

**Acceptanskriterier**:
- ✅ Shadow mode loggar utan att blockera
- ✅ Sample rate fungerar korrekt
- ✅ Loggar till `data/shadow/shadow-{date}.jsonl`

#### 3.3 Implementera Soft Block

**Fil**: `lib/coach/soft_block.ts` (ny)

```typescript
export function softBlock(safetyResult: any, coachReply: string): string {
  if (safetyResult.blocked && safetyResult.crisis_required) {
    // Visa kris-text OCH dölj coach-reply
    return safetyResult.crisis_message || getDefaultCrisisMessage();
  }
  
  // Om inte blockerad, visa coach-reply
  return coachReply;
}
```

**Acceptanskriterier**:
- ✅ Soft block visar kris-text när RED
- ✅ Coach-reply döljs när RED
- ✅ Användare ser endast kris-resurser

#### 3.4 Implementera Hard Block

**Fil**: `lib/coach/safety_gate.ts` (uppdatera)

```typescript
export async function safetyCheck(...): Promise<SafetyResult> {
  // ... existing code ...
  
  // Hard block: Blockera RED alltid
  if (result.level === 'RED' && process.env.HARD_BLOCK_ENABLED === 'true') {
    return {
      blocked: true,
      crisis_required: true,
      level: 'RED',
      reason: result.reason,
      crisis_message: getCrisisMessage(),
    };
  }
  
  // ... rest of code ...
}
```

**Acceptanskriterier**:
- ✅ Hard block aktiveras via env-flag
- ✅ RED blockeras alltid när hard block är på
- ✅ Fallback till soft block om env-flag saknas

---

### Fas 4: Analys och Kalibrering (1-2 veckor)

**Mål**: Implementera drift-detection och kalibrering för kontinuerlig förbättring.

#### 4.1 Kalibrering Dashboard

**Fil**: `lib/coach/calibration.ts` (uppdatera)

```typescript
export interface CalibrationReport {
  period: { start: Date; end: Date };
  metrics: {
    teacherScore: { mean: number; p95: number; trend: 'up' | 'down' | 'stable' };
    empathy: { mean: number; trend: 'up' | 'down' | 'stable' };
    clarity: { mean: number; trend: 'up' | 'down' | 'stable' };
    latency: { p95: number; trend: 'up' | 'down' | 'stable' };
  };
  flags: {
    robot_phrase: number;
    over_mirroring: number;
    low_empathy: number;
  };
  recommendations: string[];
}

export async function generateCalibrationReport(
  startDate: Date,
  endDate: Date
): Promise<CalibrationReport> {
  // Läs calibration logs från data/calibration/
  // Beräkna metrics och trends
  // Generera recommendations
}
```

**Acceptanskriterier**:
- ✅ Report genereras veckovis
- ✅ Trends detekteras korrekt
- ✅ Recommendations är actionable

#### 4.2 Drift Detection

**Fil**: `lib/coach/drift_detection.ts` (ny)

```typescript
export function detectDrift(
  current: CalibrationReport,
  baseline: CalibrationReport
): {
  detected: boolean;
  severity: 'low' | 'medium' | 'high';
  metrics: string[];
} {
  const driftThresholds = {
    teacherScore: 0.3, // Max 0.3 poäng drift
    empathy: 0.5,
    clarity: 0.5,
  };
  
  const drifts: string[] = [];
  
  if (Math.abs(current.metrics.teacherScore.mean - baseline.metrics.teacherScore.mean) > driftThresholds.teacherScore) {
    drifts.push('teacherScore');
  }
  
  // ... check other metrics ...
  
  return {
    detected: drifts.length > 0,
    severity: drifts.length >= 2 ? 'high' : drifts.length === 1 ? 'medium' : 'low',
    metrics: drifts,
  };
}
```

**Acceptanskriterier**:
- ✅ Drift detekteras korrekt
- ✅ Severity är korrekt
- ✅ Alerts skickas vid high severity

---

## KPI:er och Acceptanskriterier

### Pre-Gates

| KPI | Target | Mätning |
|-----|--------|---------|
| RED recall | ≥0.95 | Golden tests |
| False positive rate | ≤0.02 | Shadow mode logs |
| P95 latency | <300ms | Telemetry |

### Intent Detection

| KPI | Target | Mätning |
|-----|--------|---------|
| Accuracy | ≥0.78 | Golden tests |
| Mode error rate | ≤5% | Telemetry |

### Reply Quality

| KPI | Target | Mätning |
|-----|--------|---------|
| Teacher overall score | ≥7.8 | GPT-5 Teacher |
| Empathy score | ≥6.0 | GPT-5 Teacher |
| Clarity score | ≥7.0 | GPT-5 Teacher |
| Actionability score | ≥7.0 (GUIDE) | GPT-5 Teacher |

### Performance

| KPI | Target | Mätning |
|-----|--------|---------|
| P95 latency | <900ms | Telemetry |
| micro_writer rate | ≤15% | Telemetry |
| Cache hit rate | ≥70% | Telemetry |

### Rollout

| KPI | Target | Mätning |
|-----|--------|---------|
| Shadow mode duration | 2-4h | Manual |
| Soft block duration | 24h | Manual |
| User reports (RED FP) | ≤2% | User feedback |

---

## Testning

### Golden Tests (Lägg till 4 Nya)

**Fil**: `lib/coach/golden_tests.ts` (uppdatera)

Lägg till tester för:
1. ✅ **PLAN-trigger**: "Hur gör jag för att bli roligare?" → `intent: 'plan'`, 3 steg, ≤120 ord
2. ✅ **micro_writer timeout**: Simulera timeout → fallback till AdviceEngine
3. ✅ **needsMicro edge-case**: Testa olika edge cases (för kort draft, saknar steg, etc.)
4. ✅ **targeted-repair**: Testa låg empathy<6 → repair höjer empathy
5. ✅ **GUIDE humor**: "Jag vill kunna göra så att andra skrattar åt mina skämt" → AdviceEngine.humor
6. ✅ **GUIDE speak**: "Jag vill bli bättre på att tala" → AdviceEngine.speak

### Unit Tests

**Filer**: `tests/coach/*.test.ts`

- `needsMicro.test.ts`: Testa heuristik för olika edge cases
- `micro_writer.test.ts`: Testa timeout, fallback, output-format
- `targeted_repair.test.ts`: Testa repair-logik för olika scenarios
- `advice_engine.test.ts`: Testa alla rådgivare

### Integration Tests

**Fil**: `tests/coach/integration.test.ts`

- Testa hela pipeline med micro_writer
- Testa shadow mode → soft block → hard block
- Testa cache för coach_insights

---

## Rollout Plan (Shadow → Soft → Hard)

### Steg 1: Shadow Mode (2-4 timmar)

1. Aktivera shadow mode med `SHADOW_MODE=true` (env-toggle)
2. Sample rate: 10% initialt
3. Övervaka:
   - False positive rate (RED som inte borde blockeras)
   - False negative rate (SAFE som borde blockeras)
   - Latency impact
   - Cost tracking (tokens_in/out)
4. Justera thresholds om nödvändigt
5. **Env-toggle**: `SHADOW_MODE=true` (lätt att stänga av)

### Steg 2: Soft Block (24 timmar)

1. Aktivera soft block med `SOFT_BLOCK=true` (env-toggle)
2. Övervaka:
   - Användarfeedback (via 👍/👎)
   - User reports om felaktiga blockeringar
   - Teacher scores för icke-blockerade svar
   - Latency (p95 <900ms)
3. Samla feedback och justera
4. **Env-toggle**: `SOFT_BLOCK=true` (lätt att stänga av)

### Steg 3: Hard Block (Permanent)

1. Aktivera hard block med `HARD_BLOCK=true` (env-toggle)
2. Övervaka kontinuerligt:
   - RED recall (ska vara ≥0.95)
   - False positive rate (ska vara ≤0.02)
   - Användarfeedback
   - Cost/latency alerts
3. **Env-toggle**: `HARD_BLOCK=true` (fallback: `COACH_AGENTS=off` för att stänga av helt)

---

## Risker och Mitigering

### Risk 1: micro_writer Ökar Latency/Kostnad

**Risk**: LLM-anrop kan öka p95 latency över 900ms och kostnad

**Mitigering**:
- ✅ Timeout: 200ms max, annars fallback
- ✅ Rate limiting: Max 15% av trafiken
- ✅ Token-tak: 90 tokens output
- ✅ Cache: Cachea micro_writer-svar för liknande mål (framtida)
- ✅ Fallback: Använd AdviceEngine om LLM timeout
- ✅ Cost tracking: Logga tokens_in/out per turn
- ✅ Alert: Alert vid p95>900ms eller mikro-andel>15%

### Risk 2: Targeted Repair Skapar Loop

**Risk**: Repair → Teacher → Repair → ... (oändlig loop)

**Mitigering**:
- ✅ Max 1 repair per turn (1 pass max)
- ✅ Repair endast när empathy<6 / clarity<7 / actionability<7
- ✅ Logga "repaired: true/false" för debugging
- ✅ Ingen repair-loop (endast 1 pass)

### Risk 3: Intent-fel

**Risk**: Intent accuracy <0.78

**Mitigering**:
- ✅ Kör intent-goldens för att mäta accuracy
- ✅ Om <0.78 → förbättra heuristiker eller enkel ML
- ✅ Mode error rate ≤5%

### Risk 4: Drift Detection Falska Positiver

**Risk**: Drift-detection flaggar falskt

**Mitigering**:
- ✅ Veckorapport (trend på empathy/clarity/overall, robot-rate, micro-rate)
- ✅ Basera på veckovis data (inte daglig)
- ✅ Kräv ≥2 metrics för high severity
- ✅ Manual review innan action

### Risk 5: Robotfras-filter Missar

**Risk**: "Jag hör att / Du säger att" passerar

**Mitigering**:
- ✅ Robotfras-filter körs före teacher (i tone_fixer)
- ✅ Blockera "Jag hör att / Du säger att" explicit
- ✅ Teacher flaggar robot_phrase som fallback

---

## Milstolpar

### Milstolpe 1: 48-Timmars Checklista Komplett

- ✅ PLAN mode template implementerad
- ✅ AdviceEngine med 3 rådgivare + variety
- ✅ needsMicro() + micro_writer med timeout/fallback
- ✅ Cache för coach_insights (LRU + TTL)
- ✅ Targeted repair (1 pass max)
- ✅ Telemetry logging strukturerad
- ✅ 6 nya golden tests passerar
- ✅ Shadow mode på 10% sample

### Milstolpe 2: Fas 2 Komplett (Vecka 2)

- ✅ micro_writer implementerad med timeout/fallback
- ✅ AdviceEngine med 5-8 parafraser per rådgivare
- ✅ needsMicro() heuristik fungerar korrekt
- ✅ Max 15% av trafiken använder micro_writer
- ✅ P95 latency <900ms
- ✅ Cost tracking fungerar

### Milstolpe 3: Fas 3 Komplett (Vecka 3)

- ✅ Targeted repair implementerad (1 pass max)
- ✅ Shadow mode testad (2-4h)
- ✅ Soft block testad (24h)
- ✅ Hard block aktiverad
- ✅ RED recall ≥0.95, FP ≤0.02
- ✅ Teacher overall p50 ≥7.8

### Milstolpe 4: Fas 4 Komplett (Vecka 4)

- ✅ Kalibrering dashboard fungerar
- ✅ Drift detection implementerad
- ✅ Veckovis reports genereras
- ✅ Recommendations är actionable

---

## 48-Timmars Checklista

### Dag 1 (Timmar 0-24)

- [ ] **Lägg in generatePlan()** + intent "plan"
  - [ ] Template med 3 steg / 24h, ≤120 ord, 1 fråga
  - [ ] Intent detection för "hur gör jag|plan|steg för steg" ELLER ≥3 GUIDE-turer
  - [ ] Golden test för PLAN-trigger

- [ ] **Skapa AdviceEngine** (humor/speak/boundaries/generic) + render-helper
  - [ ] 3 specifika rådgivare + generic
  - [ ] 5-8 parafraser per rådgivare för variety
  - [ ] Render-helper för att formatera AdviceResult → text

- [ ] **Implementera needsMicro()** + micro_writer (timeout/fallback)
  - [ ] needsMicro() heuristik utan teacher-cirklar
  - [ ] micro_writer med 200ms timeout
  - [ ] Fallback till AdviceEngine.generic
  - [ ] Rate limiting: Max 15% av trafiken
  - [ ] Token-tak: 90 tokens output
  - [ ] Injection-skydd: Sanitär context

- [ ] **Telemetry: logCoachTurn()** JSONL med p95-latens
  - [ ] JSONL-format per tur
  - [ ] Loggar: mode, intent, template, usedMicro, teacher.overall, latency_p95
  - [ ] Loggar tokens_in/out för cost tracking
  - [ ] Ingen PII (ingen rå user-text)
  - [ ] Alert vid p95>900ms eller mikro-andel>15%

### Dag 2 (Timmar 24-48)

- [ ] **Cache för coach_insights** (TTL 60-90s, LRU 100)
  - [ ] LRU cache med max 100 entries
  - [ ] TTL 60-90s (75s default)
  - [ ] Cache hit rate ≥70%

- [ ] **Targeted-repair** (1 pass max)
  - [ ] Höj endast empathy<6 / clarity<7 / actionability<7
  - [ ] Max 1 repair per turn
  - [ ] Logga "repaired: true/false"

- [ ] **Golden-tests x4** + två GUIDE-goldens (humor/speak)
  - [ ] PLAN-trigger test
  - [ ] micro_writer timeout test
  - [ ] needsMicro edge-case test
  - [ ] targeted-repair test
  - [ ] GUIDE humor test
  - [ ] GUIDE speak test

- [ ] **Env-toggles och shadow mode** på 10% sample
  - [ ] `SHADOW_MODE=true` env-toggle
  - [ ] `SOFT_BLOCK=true` env-toggle
  - [ ] `HARD_BLOCK=true` env-toggle
  - [ ] Shadow mode på 10% sample
  - [ ] Logga shadow mode metrics

---

## Ytterligare Förbättringar (Framtida)

### User Preference (Opt-in)

**Fil**: `lib/coach/user_prefs.ts` (ny)

```typescript
export interface UserPrefs {
  advice_pref?: 'tips' | 'explore' | 'both'; // Opt-in
  formality_pref?: 'casual' | 'neutral' | 'formal';
}

export function getUserPrefs(threadId: string): UserPrefs {
  // Läsa från memory eller default
}
```

**Syfte**: Så GUIDE inte upplevs påträngande om användaren föredrar EXPLORE

### Robotfras-filter Före Teacher

**Fil**: `lib/coach/tone_fixer.ts` (uppdatera)

```typescript
function removeRobotPhrases(text: string): string {
  // Blockerar "Jag hör att / Du säger att" explicit
  text = text.replace(/^Jag hör att\s+(du säger|du är|hej)/gi, '');
  text = text.replace(/^Du säger att\s+/gi, '');
  return text;
}
```

**Syfte**: Ta bort robotfraser före teacher (snabbt, effektivt)

### Question Budget Enforcement

**Fil**: `lib/coach/question_guard.ts` (uppdatera)

```typescript
export function questionGuard(params: QuestionGuardParams): string {
  // ≤1 fråga/tur och ≤1/3 senaste turer
  const questionCount = countQuestions(params.text);
  const recentQuestionCount = countRecentQuestions(params.conversation, 3);
  
  if (questionCount > 1) {
    // Ta bort extra frågor
  }
  
  if (recentQuestionCount > 1) {
    // Ta bort frågan från denna turn
  }
  
  return params.text;
}
```

**Syfte**: Säkerställ ≤1 fråga/tur och ≤1/3 senaste turer

---

## Slutsats

Planen är **redo och genomförbar**. Den täcker rätt lager (safety → signal → routing → reply → quality → rollout).

**För att få 8–9.5/10 konsekvent**:
1. ✅ Implementera Fas 1 direkt (48-timmars checklista)
2. ✅ Koppla på hybrid med hårda timeouts/fallbacks
3. ✅ Rulla ut via shadow→soft→hard
4. ✅ Mät kontinuerligt (telemetry, golden tests)
5. ✅ Justera baserat på KPI:er

Detta ger **snabbare värde i tur 1–2** (tips först), och en **varm analys efter 3–5 turer** — precis den upplevelse du siktar på.

---

## Nästa Steg

1. **Börja med 48-timmars checklista**: Implementera Dag 1 → Dag 2
2. **Testa grundligt**: Kör golden tests efter varje ändring
3. **Mät kontinuerligt**: Använd telemetry för att övervaka KPI:er
4. **Iterera**: Justera baserat på feedback och mätningar
5. **Rulla ut säkert**: Shadow → Soft → Hard med env-toggles

---

## Referenser

- [Coach Pipeline Implementation](./COACH_PIPELINE_IMPLEMENTATION.md)
- [Golden Tests README](./GOLDEN_TESTS_README.md)
- [Quality Teacher](./QUALITY_TEACHER.md)
- [Agent System Summary](./AGENT_SYSTEM_SUMMARY.md)

