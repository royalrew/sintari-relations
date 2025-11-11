# Reception & Routing System - Implementation Summary

**Datum:** 2025-01-30  
**Status:** ✅ Implementerat

## 🎯 Vad som Implementerats

### 1. Handoff Dialog Komponent ✅
- **Fil:** `components/HandoffDialog.tsx`
- **Funktion:** Visar dialog när användaren ska lotsas till ett rum
- **Funktioner:**
  - Visar sammanfattning av konversationen
  - Två alternativ: "Ja, föra över kontext" eller "Nej, börja från början"
  - Möjlighet att stanna kvar i receptionen

### 2. Separata Routes ✅
- **`/coach`** - AI-coach rum (`app/coach/page.tsx`)
- **`/couples`** - Par-terapi AI rum (`app/couples/page.tsx`)
- **Funktioner:**
  - Visar kontext-banner om kontext finns
  - "Tillbaka till reception"-knapp
  - Olika färgscheman per rum (coach: purple, couples: emerald)

### 3. Reception-logik i Chatten ✅
- **Detektering:**
  - `detectCoachIntent()` - Detekterar när användaren vill arbeta med personliga mål
  - `isCouplesConversation()` - Detekterar par-relationer (redan fanns)
- **Handoff-trigger:**
  - Triggas när mode detekteras (efter minst 2 meddelanden)
  - Bara i reception (`/`), inte i specifika rum
  - Visar dialog en gång per session

### 4. Kontextöverföring ✅
- **När användaren godkänner:**
  1. Sammanfattning sparas via `/api/reception/handoff`
  2. Route till `/coach` eller `/couples` med `?context=...`
  3. Kontext sparas i `sessionStorage`
  4. AI:n i det nya rummet använder kontexten i första hälsningen
  5. Kontext rensas efter första användning

- **När användaren inte godkänner:**
  1. Route till `/coach` eller `/couples` utan kontext
  2. AI:n börjar från början med standardhälsning

### 5. Sammanfattningsgenerering ✅
- **`generateConversationSummary()`** - Genererar sammanfattning från användarmeddelanden
- Max 200 tecken för att passa i handoff API
- Visas i handoff-dialogen

## 🔄 Flöde

### Reception → Rum (med kontext)
```
1. Användare pratar i reception (/)
2. System detekterar coach/couples intent
3. Handoff-dialog visas med sammanfattning
4. Användaren klickar "Ja, föra över kontext"
5. Sammanfattning sparas via API
6. Route till /coach eller /couples?context=...
7. AI:n i rummet använder kontexten: 
   "Tack för att du kom hit. Jag ser att du nämnde: [kontext]. 
   Låt oss fortsätta därifrån..."
```

### Reception → Rum (utan kontext)
```
1. Användare pratar i reception (/)
2. System detekterar coach/couples intent
3. Handoff-dialog visas med sammanfattning
4. Användaren klickar "Nej, börja från början"
5. Route till /coach eller /couples (utan kontext)
6. AI:n börjar från början med standardhälsning
```

## 📋 Tekniska Detaljer

### Handoff API Integration
```typescript
POST /api/reception/handoff
{
  sessionId: string,
  consent: true,
  carryOver: "minimal",
  summary: string, // Max 240 tecken
  risk: "SAFE",
  mode: "personal"
}
```

### SessionStorage Keys
- `coach_context` - Temporär lagring från URL-param
- `couples_context` - Temporär lagring från URL-param
- `_coach_context_internal` - Intern lagring för AI-användning
- `_couples_context_internal` - Intern lagring för AI-användning

### Detekteringslogik
- **Coach:** Nyckelord som "mål", "förbättra", "utveckla", "själv", "personlig"
- **Couples:** Par-relationer, "vi", "oss", partner-namn i active cards
- **Trigger:** Minst 2 meddelanden, turn >= 2, bara i reception

## 🎨 UX Förbättringar

1. **Tydlig information** - Dialog förklarar vad som händer
2. **Sammanfattning synlig** - Användaren ser vad som kommer föras över
3. **Valmöjlighet** - Tre alternativ: godkänn, avslå, stanna kvar
4. **Visuell indikation** - Olika färger per rum
5. **Tillbaka-knapp** - Lätt att komma tillbaka till receptionen

## ✅ Test-scenarier

### Scenario 1: Coach med kontext
1. Användare: "Jag vill bli bättre på att hantera stress"
2. Dialog visas: "Vill du föra över vad vi pratat om?"
3. Klickar "Ja"
4. Route till `/coach?context=...`
5. AI:n: "Tack för att du kom hit. Jag ser att du nämnde: [kontext]..."

### Scenario 2: Couples utan kontext
1. Användare: "Jag och min fru har problem"
2. Dialog visas
3. Klickar "Nej, börja från början"
4. Route till `/couples`
5. AI:n: Standardhälsning utan kontext

### Scenario 3: Stanna kvar
1. Dialog visas
2. Klickar "Stanna kvar här"
3. Dialog stängs
4. Användaren fortsätter i receptionen

## 🔧 Ytterligare Förbättringar (Framtida)

1. **Bättre sammanfattning** - Använd AI för att generera mer kontextuell sammanfattning
2. **PII-filtering** - Filtrera bort personuppgifter från sammanfattning
3. **Kontext-preview** - Visa förhandsgranskning av vad som kommer föras över
4. **Anpassad AI per rum** - Olika AI-beteenden för coach vs couples
5. **Analytics** - Spåra hur många som godkänner vs avslår kontextöverföring

