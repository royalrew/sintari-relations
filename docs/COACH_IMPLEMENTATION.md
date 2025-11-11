# Coach System - Implementation Summary

**Datum:** 2025-01-30  
**Status:** ✅ Implementerat enligt specifikation

## ✅ Tre Huvudpunkter Implementerade

### 1. Exakt när analysen triggas ✅

#### Routing in (när coachen kickar igång):
- ✅ Användaren ber om råd: `detectCoachTrigger()` detekterar "hur gör jag", "vad borde jag", etc.
- ✅ Hög intensitet/stress: Detekterar `!!`, `😢`, `panik`, `stress`, `ångest`
- ✅ Längre meddelanden (>150 tecken) indikerar behov av stöd

#### Kadens:
- ✅ Var 3:e meddelande (räknar user-meddelanden)
- ✅ Event-triggers: Struktur på plats för framtida implementation (mål, riskflaggor, par-läge)

#### Debounce:
- ✅ Väntar 6 sekunder efter senaste meddelandet innan analys körs
- ✅ Om två meddelanden kommer inom 6s, väntar tills flödet pausar
- ✅ Använder `setTimeout` för att undvika onödig analys

### 2. Hur insikter binds utan att dominera tonen ✅

#### Persona först, insikt som bränsle:
- ✅ Coach-prompten skriver alltid svaret med persona
- ✅ Insikter injiceras som strukturerad kontext (inte i samma turn som user)
- ✅ Mall: Spegel → validera → micro-steg → fråga

#### Konfidenstrim:
- ✅ `CONFIDENCE_THRESHOLD = 0.6`
- ✅ Endast insikter med confidence >= 0.6 visas som rekommendationer
- ✅ Lägre confidence formuleras som försiktiga hypoteser ("Låter det som att...?")

#### 1 steg i taget:
- ✅ Max 1-2 konkreta nästa steg
- ✅ Alltid en check-fråga för validering
- ✅ Undviker att överbelasta användaren

### 3. Robust bakgrundskörning ✅

#### Separerade API routes:
- ✅ `/api/coach/reply` - Snabb svar (<1.2s p95)
- ✅ `/api/coach/analyze` - Bakgrundsanalys (kan ta längre tid)

#### Icke-blockerande:
- ✅ `handleCoachSend()` hämtar svar först
- ✅ Bakgrundsanalys triggas efter svar är renderat
- ✅ UI blockeras aldrig

#### sendBeacon/keepalive:
- ✅ Använder `navigator.sendBeacon()` om tillgängligt (bäst för bakgrund)
- ✅ Fallback till `fetch()` med `keepalive: true`
- ✅ Fire-and-forget: fortsätter även om analys failar

## 📊 Teknisk Implementation

### API Routes

#### `/api/coach/reply` (Snabb)
```typescript
POST /api/coach/reply
{
  msg: string,
  threadId: string,
  conversation: Msg[],
  lastInsights: Insights
}

Response:
{
  reply: string,           // Snabbt svar med persona
  analysisDue: boolean,    // Om bakgrundsanalys ska triggas
  insightsUsed: {...}      // Vilka insikter som användes
}
```

#### `/api/coach/analyze` (Bakgrund)
```typescript
POST /api/coach/analyze
{
  threadId: string,
  conversation: Msg[]
}

Response:
{
  success: true,
  insights: {
    goals: Array<{label, confidence, evidence}>,
    recommendations: Array<{label, confidence}>,
    patterns: Array<{label, confidence}>,
    riskFlags: Array<{type, score}>
  }
}
```

### Client-side Flow

```typescript
// 1) Användare skickar meddelande
onSend() 
  → handleCoachSend()
    → POST /api/coach/reply (snabb)
      → Svar renderas direkt
    → Om analysisDue: triggerBackgroundAnalysis()
      → sendBeacon(/api/coach/analyze) eller fetch(keepalive)
        → Insikter sparas i state
        → Används i nästa svar
```

### Debounce Logic

```typescript
// Om meddelanden kommer snabbt (<6s):
if (timeSinceLastMessage < DEBOUNCE_MS) {
  clearTimeout(previousTimeout);
  setTimeout(() => triggerAnalysis(), DEBOUNCE_MS - timeSinceLastMessage);
} else {
  triggerAnalysis(); // Omedelbart
}
```

## 🎯 Coach Reply Structure

### Mall:
1. **Spegla kort**: "Jag hör att [nyckelpunkt]."
2. **Micro-steg** (max 2, confidence >= 0.6): "Ett första steg kan vara att [steg1], eller [steg2]."
3. **Checkfråga**: "Vad känns det som när du tänker på det?"

### Exempel:
```
Användare: "Jag vill bli bättre på att hantera stress"

Coach-svar:
"Jag hör att du vill bli bättre på att hantera stress. 
Ett första steg kan vara att träna på andningsövningar, 
eller identifiera dina stress-triggers. 
Vad känns det som när du tänker på det?"
```

## 🔧 Konfiguration

```typescript
const AGENT_ANALYSIS_INTERVAL = 3;  // Var 3:e meddelande
const DEBOUNCE_MS = 6000;            // 6 sekunder debounce
const CONFIDENCE_THRESHOLD = 0.6;   // Minimum confidence för insikter
```

## 📈 KPI:er att Följa

- ✅ Reply-latens (p95): < 1.2s (via `/api/coach/reply`)
- ⏳ "Känns personligt & hjälpsamt" (1–5): ≥ 4.2 (behöver feedback)
- ⏳ Step adoption rate: Andel svar där användaren accepterar steg (behöver tracking)
- ⏳ Risk false-negatives: < 0.1% (behöver QA)

## 🚀 Nästa Steg

1. **State Management**: Implementera Redis/DB för att spara insikter per threadId
2. **Event-triggers**: Implementera jämförelse med tidigare state för mål/riskflaggor
3. **Telemetri**: Spåra vilka agent-insikter som användes i varje svar
4. **Memory**: Spara mål/teman och accepterade steg för återkommande referenser
5. **Cost Guard**: Lägg max-storlek på historik i runAllAgents (sliding window)

## ✅ Implementerade Förbättringar

- ✅ Separerade reply och analyze routes
- ✅ Debounce för att undvika onödig analys
- ✅ sendBeacon/keepalive för bakgrundskörning
- ✅ Konfidenstrim (>= 0.6)
- ✅ Max 1-2 steg per svar
- ✅ Persona först, insikter som kontext
- ✅ Smart routing-triggers (råd, stress, längre meddelanden)

