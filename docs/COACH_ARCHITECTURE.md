# AI-coachen som Yta på Analyssystemet

**Datum:** 2025-01-30  
**Status:** ✅ Implementerat

## 🎯 Koncept

AI-coachen är en **"yta"** (interface/layer) på analyssystemet. Den har sin egen **roll och personlighet** (coach), men **"hjärnan"** är samma kraftfulla analyssystem som `/analyze` använder.

### Arkitektur

```
┌─────────────────────────────────────────┐
│         AI-coachen (Yta)                 │
│  - Coach-persona                         │
│  - Varm, stödjande ton                   │
│  - Fokus på personlig utveckling         │
└─────────────────┬───────────────────────┘
                  │
                  │ Använder samma backend
                  ▼
┌─────────────────────────────────────────┐
│      Analyssystemet (Hjärnan)            │
│  - runAllAgents()                        │
│  - 29+ agenter                           │
│  - Pyramid-routing                       │
│  - Exakt analys                          │
└─────────────────────────────────────────┘
```

## 🔧 Teknisk Implementation

### 1. API Route: `/api/coach/analyze`

**Fil:** `app/api/coach/analyze/route.ts`

- Använder samma `runAllAgents()` som `/analyze`
- Tar emot konversation och analyserar den
- Returnerar insikter från agent-systemet:
  - Mål och fokusområden (`plan_focus`)
  - Rekommendationer (`plan_interventions`)
  - Kommunikationsinsikter (`diag_communication`)
  - Mönster (`meta_patterns`)
  - Riskflaggor (`safety_gate`, `risk_abuse`, etc.)

### 2. Agent-analys i Bakgrunden

**Fil:** `components/PromptWithFollowCards.tsx`

- Kör agent-analys **periodiskt** (var 3:e meddelande)
- **Non-blocking**: Blockar inte svar-generering
- **Bakgrundsprocess**: Analysen körs parallellt med chatten
- Insikter sparas i state och används för nästa svar

### 3. Coach-svar med Insikter

**Funktion:** `composeCoachReplyWithInsights()`

- Använder agent-insikter för att ge **mer exakta svar**
- **Behåller coach-personan**: Varm, stödjande ton
- **Använder hjärnan**: Agent-analys för djupare förståelse

## 📊 Flöde

### Steg 1: Användaren skriver i coach-rummet
```
Användare: "Jag vill bli bättre på att hantera stress"
```

### Steg 2: Agent-analys körs i bakgrunden
```typescript
analyzeConversationWithAgents(messages, userText)
  → POST /api/coach/analyze
  → runAllAgents() (samma som /analyze)
  → Returnerar insikter
```

### Steg 3: Insikter används för svar
```typescript
composeCoachReplyWithInsights(userText, insights, ...)
  → Använder insights.goals, insights.recommendations, etc.
  → Genererar coach-svar med exakthet från analyssystemet
```

### Steg 4: Coach-svar med personlighet
```
AI-coachen: "Jag ser att du verkar fokusera på stresshantering. 
Det är ett bra ställe att börja. Vad känns som det första 
steget för dig att komma dit?"
```

## 🎨 Coach-persona vs Analyssystem

### Coach-persona (Ytan)
- Varm, stödjande ton
- Fokus på personlig utveckling
- Frågor som "Vad känns det som?"
- Stödjande språk: "Det är ett bra ställe att börja"

### Analyssystemet (Hjärnan)
- Exakt analys av konversationen
- 29+ agenter som analyserar olika aspekter
- Identifierar mål, mönster, risker
- Ger objektiva insikter

### Kombinationen
- **Coach-personan** formulerar svaren
- **Analyssystemet** ger insikterna
- Resultat: Exakta, informerade svar med rätt ton

## 🔍 Exempel: Hur Insikter Används

### Scenario: Användaren pratar om kommunikation

**Agent-analys identifierar:**
```json
{
  "communication": {
    "strengths": ["aktivt lyssnande"],
    "issues": ["svårt att säga nej"]
  },
  "goals": ["sätta gränser"],
  "recommendations": ["träna på att säga nej"]
}
```

**Coach-svar (med personlighet):**
```
"Jag märker att du har styrkor när det gäller aktivt lyssnande. 
Det är något att bygga vidare på. Jag hör också att det kan vara 
svårt att säga nej. Baserat på vad vi pratat om, skulle träna på 
att säga nej kunna vara ett bra nästa steg. Vad tänker du om det?"
```

## ⚡ Prestanda

- **Non-blocking**: Agent-analys körs i bakgrunden
- **Periodisk analys**: Var 3:e meddelande (kan justeras)
- **Fallback**: Om analys failar, används standard coach-svar
- **Caching**: Insikter sparas i state tills nästa analys

## 🎯 Fördelar med Denna Arkitektur

1. **Exakthet**: Samma kraftfulla analyssystem som `/analyze`
2. **Personlighet**: Coach-personan behålls
3. **Skalbarhet**: Enkelt att lägga till fler "rum" med samma backend
4. **Konsistens**: Samma analyssystem ger konsistenta resultat
5. **Underhåll**: En backend, flera ytor

## 🔮 Framtida Utveckling

- **Realtidsanalys**: Analysera varje meddelande (kostnadsoptimering behövs)
- **Anpassad agent-mix**: Olika agenter för olika rum
- **Visualisering**: Visa agent-insikter för användaren
- **Historik**: Spara agent-analyser över tid
- **A/B-testning**: Testa olika coach-personor med samma backend

## 📝 Tekniska Detaljer

### Agent-analys Intervall
```typescript
const AGENT_ANALYSIS_INTERVAL = 3; // Var 3:e meddelande
```

### Insikter som Extraheras
- `goals`: Mål och fokusområden
- `recommendations`: Rekommendationer och interventioner
- `communication`: Kommunikationsinsikter
- `patterns`: Mönster i konversationen
- `riskFlags`: Riskflaggor (safety, abuse, coercion, selfharm)

### Fallback-beteende
Om agent-analys failar eller inga insikter finns:
- Använd standard `buildAcknowledgmentReply()`
- Fortsätt med coach-personan
- Ingen försening för användaren

