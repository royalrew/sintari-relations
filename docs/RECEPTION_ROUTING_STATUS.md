# Reception & Routing System - Statusanalys

**Datum:** 2025-01-30  
**Syfte:** Analysera om chatten fungerar som "reception" som lotsar till separata "rum" (AI-coach, Par-terapi)

## 🎯 Förväntat Beteende

Chatten ska fungera som en **reception** eller **1177** som:
1. Samlar information från användaren
2. Detekterar vad användaren behöver
3. **Lotsar** användaren till rätt "rum":
   - **AI-coachen** - för självförbättring och personlig utveckling
   - **Par-terapi AI** - för par-relationer och konflikthantering

## ✅ Vad som ÄR Implementerat

### 1. Mode Detection
- ✅ **`detectMode()`** - Detekterar "personal" vs "hr" mode
- ✅ **`isCouplesConversation()`** - Detekterar när det handlar om par-relationer
- ✅ **Coach-tracking** - Spårar coach-sessioner med `coachSessionStartedRef`

### 2. Couples Mode
- ✅ **`COUPLES_ROOM_ENABLED`** - Feature flag för att aktivera par-läge
- ✅ **`composeCouplesReply()`** - Genererar par-specifika svar
- ✅ **Par-stegsekvens** - 4-stegs process för par-kommunikation:
  1. Paus
  2. Spegel
  3. Bekräfta
  4. Behov

### 3. Coach Mode
- ✅ **Coach metrics** - Spårar coach-sessioner (`coachSessionStartedRef`)
- ✅ **Goal coaching** - `goalCoach()` funktion för mål-coaching
- ✅ **Coach payload** - Telemetri för coach-aktiviteter

### 4. Handoff API
- ✅ **`/api/reception/handoff`** - API-endpoint för överföringar
- ✅ **`HandoffPolicy`** - Policy för att validera överföringar
- ✅ **Summary carry-over** - Stöd för att bära över sammanfattning

## ❌ Vad som INTE Är Implementerat

### 1. Separata "Rum" (Routes)
**Problem:** Det finns INGA separata routes/sidor för:
- ❌ `/coach` - AI-coach rum
- ❌ `/couples` - Par-terapi rum
- ❌ `/reception` - Reception-sida

**Nuvarande beteende:** Allt händer i samma chat (`/` - PromptWithFollowCards)

### 2. Explicit Routing/Handoff
**Problem:** Chatten detekterar modes men lotsar INTE användaren:
- ❌ Ingen routing till `/coach` när coach-mode detekteras
- ❌ Ingen routing till `/couples` när par-mode detekteras
- ❌ Handoff API används INTE aktivt i chatten

**Nuvarande beteende:** 
- Chatten ändrar bara **stil** (coach-svar vs par-svar)
- Användaren stannar i samma chat
- Ingen visuell indikation på att man är i ett "rum"

### 3. Reception-logik
**Problem:** Ingen explicit reception-fas:
- ❌ Ingen dedikerad reception-komponent
- ❌ Ingen samling av information FÖRE routing
- ❌ Ingen explicit "vilket rum behöver du?"-dialog

**Nuvarande beteende:**
- Chatten börjar direkt med generiska svar
- Mode detekteras automatiskt från text
- Ingen explicit "reception"-fas

## 🔍 Nuvarande Flöde

```
Användare skriver i chat
    ↓
detectMode() → "personal" eller "hr"
    ↓
isCouplesConversation() → true/false
    ↓
Om couples → composeCouplesReply()
Om coach → coach metrics spåras
    ↓
Samma chat, annan stil
```

## 🎯 Önskat Flöde (Reception → Rum)

```
Användare kommer till chatten
    ↓
RECEPTION-FAS:
- Samla information
- Fråga vad de behöver hjälp med
- Detektera intent
    ↓
ROUTING:
- Om självförbättring → /coach
- Om par-relation → /couples
- Om HR → /hr
    ↓
RUM-FAS:
- Specifik AI för varje rum
- Anpassad UI för varje rum
- Spårbarhet per rum
```

## 📋 Rekommendationer för Implementation

### 1. Skapa Separata Routes
```typescript
// app/coach/page.tsx - AI-coach rum
// app/couples/page.tsx - Par-terapi rum
// app/reception/page.tsx - Reception (valfritt)
```

### 2. Förbättra Reception-logik
```typescript
// I PromptWithFollowCards eller ny Reception-komponent
function detectIntent(userText: string): "coach" | "couples" | "reception" {
  // Detektera vad användaren behöver
  // Returnera rätt intent
}

function routeToRoom(intent: string) {
  // Router.push till rätt rum
}
```

### 3. Integrera Handoff API
```typescript
// När mode detekteras, använd handoff API
if (isCouples) {
  await fetch('/api/reception/handoff', {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      mode: 'personal',
      carryOver: 'minimal',
      summary: generateSummary(messages)
    })
  });
  router.push('/couples');
}
```

### 4. Visuell Indikation
- Visa tydligt vilket "rum" användaren är i
- Visa "Tillbaka till reception"-knapp
- Olika UI-stilar per rum

## 📊 Sammanfattning

| Funktion | Status | Kommentar |
|----------|--------|-----------|
| Mode detection | ✅ | Fungerar bra |
| Couples detection | ✅ | Fungerar med feature flag |
| Coach tracking | ✅ | Spåras men inte explicit rum |
| Separata routes | ❌ | **SAKNAS** |
| Handoff routing | ❌ | **SAKNAS** |
| Reception-fas | ❌ | **SAKNAS** |
| Visuell indikation | ❌ | **SAKNAS** |

## 🎯 Slutsats

**Systemet är DELVIS implementerat:**
- ✅ Detektering fungerar (coach, couples, hr)
- ✅ Olika svar-stilar finns (coach-svar, par-svar)
- ❌ **MEN:** Det finns INGA separata "rum" att lotsa till
- ❌ **OCH:** Ingen explicit reception-fas som samlar info före routing

**För att få full "reception → rum"-funktionalitet behövs:**
1. Skapa separata routes (`/coach`, `/couples`)
2. Implementera explicit routing-logik
3. Integrera handoff API för överföringar
4. Lägga till visuell indikation av vilket rum man är i

