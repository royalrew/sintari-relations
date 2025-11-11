# Reception System - Implementation Summary

**Datum:** 2025-01-30  
**Status:** ✅ Implementerat

## 🎯 Vad som Implementerats

### 1. Systemprompt – Receptionist ✅

**Regler implementerade:**
- ✅ Lyssna först: 1–2 meningar, ingen diagnos
- ✅ Val, inte krav: Alltid frivilliga alternativ ("om du vill...", "vi kan också vänta")
- ✅ Frågebudget: Max 1 öppen fråga varannan tur, minst 15s mellan frågor
- ✅ Paus är OK: Bekräftar att tystnad är okej
- ✅ Anti-repeat: Om utkast liknar senaste svaren, ändra vinkeln
- ✅ Analys: Kör inte full analys förrän kontext finns (ca 3 meddelanden)
- ✅ Routing är förslag: "Vill du att jag öppnar...?" aldrig push
- ✅ Säkerhet: Vid akut risk → kort stöd + hänvisning (112)

**Stil:**
- Varm, saklig, lugn
- 1–3 meningar
- Ingen dubbelfråga
- Undviker imperativ i följd

### 2. UI – Reception-komponent ✅

**Fil:** `components/reception/Reception.tsx`

**Funktioner:**
- ✅ Luftigt design med hover-effekter
- ✅ Chips för val: "Skriv fritt", "Föreslå väg", "Hoppa över"
- ✅ RYG-bar för analyskvalitet (QualityBar)
- ✅ Routing-förslag: Visar gissning baserat på konversation
- ✅ Readiness-indikator: Visar när full analys är redo
- ✅ Responsiv layout

### 3. State Machine – Flödeslogik ✅

**Fil:** `lib/reception/machine.ts`

**States:**
- `IDLE` → Första turen visas
- `LISTEN` → Lyssna, spegla
- `OFFER_PATH` → Erbjud valbara vägar (chips)
- `LIGHT_ANALYSIS_OK` → Readiness medel → erbjud lätt föranalys
- `FULL_ANALYSIS_READY` → Readiness hög → erbjud full analys
- `SILENT_OK` → Tyst läge bekräftat

**Events:**
- `USER_MESSAGE` → Användaren skriver
- `CLICK_CHIP` → Användaren klickar på chip
- `READINESS` → Readiness uppdateras
- `TIMEOUT` → Timeout (tystnad är OK)

**Triggers:**
- Readiness uppdateras efter varje user-turn
- Frågebudget: Minst 15s mellan frågor + aldrig två frågor i rad
- Lätt föranalys: Endast när readiness ∈ [0.5, 0.79]
- Full analys: Readiness ≥ 0.8 eller explicit "Full analys"

## 🔄 Flöde

### State Machine Flow
```
IDLE
  ↓ USER_MESSAGE
LISTEN
  ↓ USER_MESSAGE (2+ meddelanden)
OFFER_PATH
  ↓ READINESS (0.5-0.79)
LIGHT_ANALYSIS_OK
  ↓ READINESS (≥0.8)
FULL_ANALYSIS_READY
```

### Användarflöde
```
Användare skriver meddelande
    ↓
Receptionisten speglar kort (1-2 meningar)
    ↓
Om readiness låg: Visa tips + "Kör lätt föranalys" chip
Om readiness hög: Visa "Redo för full analys" + länk
    ↓
Användaren kan:
- Skriva vidare (fortsätter i LISTEN)
- Klicka chip (triggar state transition)
- Klicka routing-länk (lotsas till rum)
```

## 📊 Readiness Scoring

**Heuristik:**
- Meddelanden: 40% vikt (≥3 bra)
- Längd: 30% vikt (≥400 tecken bra)
- Facetter: 30% vikt (3+ facetter bra)

**Facetter:**
- Känsla (orolig, stress, ångest, etc.)
- Händelse (igår, idag, bråk, konflikt, etc.)
- Mål (vill, skulle vilja, behöver, etc.)

## 🎨 Routing-guess

**Detekterar:**
- Par-läge: "par", "partner", "vi", "min sambo/fru/man"
- HR/Team: "hr", "team", "chef", "kollega", "arbete"
- Kommunikation: "tala", "presentera", "kommunik", "retorik"
- Välmående: "glad", "ledsen", "stress", "oro", "ångest"
- Fallback: Coach

## ✅ Acceptanskriterier

- ✅ Ingen tvångs-routing (bara länkar/chips)
- ✅ Högst 1 fråga varannan tur
- ✅ Readiness <0.5: Visa tips + "lätt föranalys" som val – aldrig autostart
- ✅ Readiness ≥0.8: Erbjud "Full analys" – inte auto
- ✅ "Skriv fritt" och "Hoppa över" syns alltid
- ✅ Anti-repeat aktiv på senaste 3 assistentsvar

## 🔧 Tekniska Detaljer

### State Management
- `state`: Nuvarande state i state machine
- `ctx`: Context med userMsgs, readiness, lastAskedAt
- `turns`: Konversationshistorik
- `mayAsk`: Frågebudget-flagga

### Anti-repeat
- Jaccard-similarity mellan senaste 3 assistentsvar
- Om similarity ≥ 0.6 → ändra vinkeln
- Exempel: "Jag är med dig" → "Jag hör dig"

### Frågebudget
- Max 1 fråga varannan tur
- Minst 15s mellan frågor
- Ingen fråga om användaren är osäker ("vet inte", "ingen aning")

## 🚀 Integration

**Startsidan (`app/page.tsx`):**
- Reception-komponenten ersätter ChatSection
- Visas i egen sektion med gradient-bakgrund
- Titel: "Reception" med beskrivning

**API Route (`app/api/reception/reply/route.ts`):**
- Kan användas för framtida LLM-integration
- Returnerar reply, chips, meta

## 📝 Nästa Step

1. **LLM-integration**: Använd systemprompten med LLM för mer naturliga svar
2. **Telemetri**: Spåra state transitions och chip-klick
3. **Anpassad routing**: Förbättra routing-guess med mer kontext
4. **Lätt föranalys**: Implementera bakgrundsanalys när användaren klickar chip
5. **Säkerhetsrouting**: Implementera akut risk-detektion och routing

