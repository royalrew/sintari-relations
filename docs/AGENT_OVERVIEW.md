# Pyramid Agentsystem - Översikt

**Status:** ✅ Aktivt och körs i bakgrunden för analyser  
**Version:** Pyramid PASS (v0.2-pyramid-pass) - Låst konfiguration  
**Senast uppdaterad:** 2025-01-30

## 🎯 Översikt

Pyramid-agentsystemet är ett omfattande system med **29+ agenter** som körs parallellt i bakgrunden när användare gör relationanalyser. Systemet är designat för att optimera kostnad, kvalitet och säkerhet genom intelligent routing och specialiserade agenter.

## 📊 Pyramid Routing System

Systemet använder en 4-nivå pyramid för kostnadseffektiv routing:

| Tier | Fördelning | Användning | Modell |
|------|------------|------------|--------|
| **FastPath** | 22-25% | Triviala fall (hälsningar, bekräftelser) | Regelbaserad |
| **Base** | 72-78% | Enkla, högkonfidensfall | Billigaste modell |
| **Mid** | 12-15% | Medelkomplexitet | Mellannivå-modell |
| **Top** | 4-6% | Komplexa fall | Premium-modell |

**Status:** ✅ Låst konfiguration - kräver HITL-approval för ändringar

## 🤖 Agentkategorier och Roller

### 1. Ingest/Pre-processing (3 agenter)
**Roll:** Förbereder och rensar input-data

- ✅ **A02 PIIMasker** (`agents/pii_masker/`)
  - Maskerar personuppgifter (namn, telefon, email)
  - Skyddar integritet innan analys
  
- ✅ **A03 LangDetect** (`agents/lang_detect/`)
  - Detekterar språk (sv/en)
  - Avgör vilken modellpool som ska användas
  
- ✅ **A04 Normalizer** (`agents/normalize/`)
  - Normaliserar text (unicode, encoding)
  - Standardiserar format för konsistent analys

### 2. Säkerhet & Consent (4 agenter)
**Roll:** Säkerhetskontroller och samtycke

- ✅ **ConsentAgent** (`agents/consent/`)
  - **KRITISK GATE:** Blockerar all analys utan samtycke
  - Verifierar att användaren accepterat villkor
  - **Status:** 100% block utan consent ✅

- ✅ **SafetyGateAgent** (`agents/safety_gate/`)
  - Detekterar våld, hot, fara
  - Klassificerar som SAFE/YELLOW/RED
  - **Status:** 0 RED-läckor ✅

- ✅ **CrisisRouterAgent** (`agents/crisis_router/`)
  - Vid RED → dirigerar till krisresurser
  - Ger akut hjälpinformation
  - **Status:** RED responstid <60s ✅

- ✅ **Risk-agenter** (3 st):
  - **AbuseRiskAgent** (`agents/risk_abuse/`) - Fysiskt/psykiskt våld
  - **CoercionControlAgent** (`agents/risk_coercion/`) - Kontroll och tvång
  - **SelfHarmSignalAgent** (`agents/risk_selfharm/`) - Självskadebeteende
  - **Status:** 0 missade RED ✅

### 3. Diagnostik-agenter (10 agenter)
**Roll:** Analyserar olika aspekter av relationen

- ✅ **diag_communication** - Kommunikationskvalitet
- ✅ **diag_conflict** - Konflikthantering och mönster
- ✅ **diag_trust** - Tillit och transparens
- ✅ **diag_intimacy** - Närahet och intimitet
- ✅ **diag_boundary** - Gränser och respekt
- ✅ **diag_alignment** - Värderingar och mål
- ✅ **diag_attachment** - Bindningsstil (anxious/avoidant/secure)
- ✅ **diag_cultural** - Kulturella faktorer
- ✅ **diag_digital** - Digital kommunikation
- ✅ **diag_power** - Maktbalans
- ✅ **diag_substance** - Substansmissbruk

### 4. Features & Patterns (3 agenter)
**Roll:** Extraherar strukturella mönster

- ✅ **features_conversation** - Konversationsmönster
- ✅ **features_temporal** - Tidsmönster och sekvenser
- ✅ **meta_patterns** - Övergripande mönster och arketyper

### 5. Dialog & Context (3 agenter)
**Roll:** Hanterar flerpartssamtal och kontext

- ✅ **ThreadParserAgent** (`agents/thread_parser/`)
  - Parsar trådar och sekvenser
  - **Status:** Sekvens ≥0.95 ✅

- ✅ **SpeakerAttributionAgent** (`agents/speaker_attrib/`)
  - Identifierar vem som säger vad (P1/P2)
  - **Status:** ≥95% rätt talare ✅

- ✅ **ContextGraphAgent** (`agents/context_graph/`)
  - Bygger relationsgraf och tidslinje
  - Kopplar samman händelser över tid

### 6. Explain & Quality (2 agenter)
**Roll:** Förklarar resultat och säkerställer kvalitet

- ✅ **ExplainLinkerAgent** (`agents/explain_linker/`)
  - Länkar spans till evidens
  - **Status:** Coverage Silver ≥95% / Gold ≥98% ✅

- ✅ **CalibrationAgent** (`agents/calibration/`)
  - Skalstabilitet mot golden tests
  - **Status:** Drift <5% ✅

### 7. Planning (2 agenter)
**Roll:** Skapar handlingsplaner

- ✅ **plan_focus** - Identifierar fokusområden
- ✅ **plan_interventions** - Genererar konkreta interventioner

### 8. Scoring & Normalization (1 agent)
**Roll:** Beräknar poäng och normaliserar

- ✅ **scoring** - Beräknar övergripande poäng
- ✅ **normalize** (redan nämnd i Ingest)

### 9. Reporting (3 agenter)
**Roll:** Skapar rapporter

- ✅ **report_comp** - Kompilerar rapport
- ✅ **report_evidence** - Samlar evidens
- ✅ **report_pdf** - Genererar PDF

### 10. Routing & Cost (4 komponenter)
**Roll:** Optimering och kostnadskontroll

- ✅ **ModelRouter** (`backend/ai/model_router.py`)
  - 3-tier routing med epsilon-promotion
  - **Status:** Korrekt routing ≥90% ✅

- ✅ **FastPath** (`backend/ai/fastpath.py`)
  - Trivialfall-hantering
  - **Status:** 20-30% coverage ✅

- ✅ **CostGuard** (`backend/audit/cost_guard.py`)
  - Budget-guards skarpt läge
  - **Status:** −30% kostnad p95 ✅

- ✅ **DriftMonitor** (`scripts/cron_drift_check.py`)
  - Drift-detektering över tid

### 11. Memory & Persona (2 agenter - Feature Flags)
**Roll:** Minne och personalisering

- 🟡 **DialogMemoryV2** (`agents/memory/dialog_memory_v2.py`)
  - Långtidsminne över konversationer
  - **Status:** Feature flag `MEMORY_V2=on`
  - **KPI:** MRR ≥0.92, Hit@3 ≥1 ✅

- 🟡 **PersonaAgent** (`agents/persona/persona_agent.py`)
  - Detekterar användarens persona
  - **Status:** Feature flag `PERSONA_V1=on`

### 12. Emotion Core (1 agent)
**Roll:** Känslodetektering

- ✅ **MicroMood** (`agents/emotion/micro_mood.py`)
  - Detekterar känsloläge (light/neutral/red)
  - **Status:** RED-detektering aktiv ✅

## 🔄 Hur Agenterna Körs

### I Analys-systemet (`/analyze`)
**Status:** ✅ **AKTIVT** - Alla 29 agenter körs parallellt

```typescript
// I app/actions/analyzeRelation.ts
const agentResults = await runAllAgents({
  person1, person2, description, consent
}, { run_id, timestamp, language });

// Kör alla agenter parallellt:
// - Consent check (blockerar om inget samtycke)
// - PII masking
// - Language detection
// - Normalization
// - Alla 10 diag-agenter
// - Safety checks
// - Scoring
// - Explain linking
// - Planning
// - Reporting
```

### I Chat-systemet (`/` - PromptWithFollowCards)
**Status:** ❌ **INTE AKTIVT** - Chat använder inte pyramid-agenter

Chat-systemet använder:
- `composeReply()` - Regelbaserade svar från pool
- `buildGreeting()` - Hälsningar
- `buildAcknowledgmentReply()` - Erkännande (ny)
- `inferIntent()` - Enkel intent-detektering

**Problem:** Chat-systemet använder INTE pyramid-agenter, vilket betyder:
- Ingen säkerhetskontroll (SafetyGate, Risk-agenter)
- Ingen minneshantering (DialogMemoryV2)
- Ingen emotion-detektering (MicroMood)
- Ingen kontextuell analys (diag-agenter)

## 📈 Aktuell Status

### ✅ Fungerar Bra
- Alla 29 agenter implementerade och körs
- Pyramid routing fungerar (22-25/72-78/12-15/4-6%)
- Säkerhetsagenter blockerar RED korrekt
- Consent-agent blockerar utan samtycke
- Kostnad optimerad (−30% p95)

### ⚠️ Begränsningar
- **Chat-systemet använder INTE agenterna** - bara regelbaserade svar
- Memory V2 är feature-flag (måste aktiveras)
- Persona Agent är feature-flag (måste aktiveras)
- Vissa agenter är scaffoldade men inte fullt integrerade

## 🎯 Rekommendationer

### För att använda agenterna i chat:

1. **Integrera MicroMood i chat** - För RED-detektering
2. **Integrera SafetyGate i chat** - För säkerhetskontroll
3. **Integrera DialogMemoryV2 i chat** - För kontext över tid
4. **Använd diag-agenter för bättre svar** - Istället för bara regelbaserade pooler

### För att förbättra nuvarande system:

1. **Aktivera Memory V2** - Sätt `MEMORY_V2=on` i env
2. **Aktivera Persona Agent** - Sätt `PERSONA_V1=on` i env
3. **Integrera agenter i chat** - Använd `runAllAgents` även för chat

## 📝 Sammanfattning

**Pyramid-agentsystemet är ett kraftfullt system med 29+ agenter som:**
- ✅ Körs aktivt i bakgrunden för analyser (`/analyze`)
- ❌ Används INTE i chat-systemet (`/` - PromptWithFollowCards)
- ✅ Optimiserar kostnad genom pyramid routing
- ✅ Säkerställer säkerhet genom flera lager av kontroller
- ✅ Ger djup analys genom specialiserade diag-agenter

**För att få full nytta av systemet bör chat-systemet integreras med agenterna.**

