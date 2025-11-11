# Coach Verktygslåda - Implementation Summary

**Datum:** 2025-01-30  
**Status:** ✅ Implementerat

## 🎯 Vad som Implementerats

### A) UI – Verktygslådan (Toolbox) ✅

**Fil:** `components/coach/Toolbox.tsx`

- **4 verktyg:**
  - 🌬️ **60s Andningsankare** - Reglera nervsystemet snabbt
  - 🧭 **3 saker jag bär på** - Sortera det röriga
  - 🗣️ **Jag-budskap** - Säg det utan skuld
  - ⏸️ **Tryggt paus-läge** - Pausa bråk, inte relationen

- **UI-funktioner:**
  - Cards med hover-effekt
  - Expandera/dölj detaljer
  - "Starta" och "Guidning i chatten" knappar
  - Responsiv grid-layout

### B) GuideRunner – Steg-för-steg Dialog ✅

**Fil:** `components/coach/GuideRunner.tsx`

- **4 guider:**
  - `breathing60`: 6 steg med andningsövningar
  - `threeThings`: 4 steg för att sortera känslor
  - `iMessage`: 5 steg för att bygga jag-budskap
  - `pauseMode`: 3 steg för tryggt paus-läge

- **Funktioner:**
  - Steg-för-steg dialog
  - Auto-nästa för steg som inte kräver användarsvar
  - Väntar på användaren när `waitUser: true`
  - Skickar varje steg till chatten via `onYield`
  - Synkroniserad stepIndex med parent-komponent

### C) Auto-val av Verktyg från Insikter ✅

**Fil:** `lib/coach/tool_selector.ts`

- **Logik:**
  1. **Akut/låg tolerans** → `breathing60` (kris, eskalerande, panik, riskScore >= 0.7)
  2. **Konflikt/upptrappning** → `pauseMode` (bråk, konflikt, deeskalera)
  3. **Kommunikation som mål** → `iMessage` (kommunikation, svårt att säga)
  4. **Diffust/oklart** → `threeThings` (fallback)

- **Integration:**
  - Anropas när insikter finns från agent-analys
  - Lägger till förslag i chatten: "Tips: Jag kan guida [verktyg]..."
  - Användaren kan starta via textkommando: "starta [verktyg]"

## 🔄 Integration i Coach-systemet

### Coach-sidan (`app/coach/page.tsx`)
- Toolbox visas under chatten
- GuideRunner visas när verktyg är aktivt
- State-hantering för `activeTool`

### Chat-komponenten (`components/PromptWithFollowCards.tsx`)
- Hanterar guide-input när verktyg är aktivt
- Auto-val av verktyg från insikter
- Textkommandon för att starta verktyg
- Synkroniserad stepIndex med GuideRunner

## 📊 Flöde

### 1. Användaren startar verktyg
```
Användare klickar "Starta" i Toolbox
    ↓
activeTool sätts i coach-sidan
    ↓
GuideRunner startar och skickar första steget till chatten
```

### 2. Guide-körning
```
GuideRunner skickar steg till chatten via onYield
    ↓
Om waitUser: false → auto-nästa efter 1.2s
Om waitUser: true → väntar på användaren
    ↓
Användaren svarar → nästa steg triggas
    ↓
När alla steg är klara → onDone() anropas
```

### 3. Auto-val från insikter
```
Agent-analys returnerar insikter
    ↓
chooseToolFromInsights() väljer verktyg
    ↓
Förslag läggs till i chatten
    ↓
Användaren kan skriva "starta [verktyg]"
```

## 🎨 Textkommandon

Användaren kan starta verktyg via text:
- "starta breathing60" eller "starta andningsankare"
- "starta threeThings" eller "starta 3 saker"
- "starta iMessage" eller "starta jag-budskap"
- "starta pauseMode" eller "starta paus"

## ✅ Tekniska Detaljer

### State Management
- `activeTool`: Vilket verktyg som är aktivt (null = inget)
- `guideStepIndex`: Nuvarande steg i guiden
- `isWaitingForGuideInput`: Om guiden väntar på användaren

### Guide-flöden
- Varje guide har en array av `Step[]`
- Varje steg har `say` (text) och `waitUser` (boolean)
- Steg med `waitUser: false` auto-nästa efter 1.2s
- Steg med `waitUser: true` väntar på användaren

### Auto-val Logik
```typescript
if (riskScore >= 0.7 || panik) → breathing60
else if (konflikt || bråk) → pauseMode
else if (kommunikation) → iMessage
else → threeThings
```

## 🚀 Nästa Steg

1. **Förbättra guide-flöden**: Lägg till fler steg och validering
2. **Spara guide-resultat**: Spara användarens svar från guiden
3. **Visualisering**: Visa progress för guiden
4. **Anpassade guider**: Olika guider baserat på kontext
5. **Telemetri**: Spåra vilka verktyg som används mest

