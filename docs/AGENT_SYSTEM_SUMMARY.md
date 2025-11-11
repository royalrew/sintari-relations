# Agent-systemet - Sammanfattning

## 🎯 Översikt

Sintari Relations har **29+ Python-agenter** i `agents/` som analyserar relationer, detekterar risker, och genererar insikter. Systemet är uppdelat i flera lager och används på olika sätt beroende på kontext.

## 📁 Struktur

### Agent-kategorier (29+ agenter)

1. **Ingest/Pre-processing** (3 agenter)
   - `pii_masker` - Maskerar personuppgifter
   - `lang_detect` - Detekterar språk
   - `normalize` - Normaliserar text

2. **Säkerhet & Consent** (4 agenter)
   - `consent` - Verifierar samtycke (KRITISK GATE)
   - `safety_gate` - Detekterar våld/hot (SAFE/YELLOW/RED)
   - `crisis_router` - Dirigerar RED till krisresurser
   - `risk_abuse`, `risk_coercion`, `risk_selfharm` - Specifika risker

3. **Diagnostik** (10 agenter)
   - `diag_communication`, `diag_conflict`, `diag_trust`, `diag_intimacy`
   - `diag_boundary`, `diag_alignment`, `diag_attachment`
   - `diag_cultural`, `diag_digital`, `diag_power`, `diag_substance`

4. **Features & Patterns** (3 agenter)
   - `features_conversation`, `features_temporal`, `meta_patterns`

5. **Dialog & Context** (3 agenter)
   - `thread_parser`, `speaker_attrib`, `context_graph`

6. **Explain & Quality** (2 agenter)
   - `explain_linker`, `calibration`

7. **Planning** (2 agenter)
   - `plan_focus`, `plan_interventions`

8. **Scoring** (1 agent)
   - `scoring`

9. **Reporting** (3 agenter)
   - `report_comp`, `report_evidence`, `report_pdf`

10. **Emotion Core** (1 agent)
    - `emotion/micro_mood.py` - Detekterar känsloläge (light/neutral/plus/red)

11. **Memory & Persona** (2 agenter - Feature Flags)
    - `memory/dialog_memory_v2.py` - Långtidsminne
    - `persona/persona_agent.py` - Persona-detektering

## 🔄 Hur Agenterna Körs

### 1. I Analys-systemet (`/analyze` - Relationanalys)
**Status:** ✅ **AKTIVT** - Alla 29 agenter körs parallellt

**Flöde:**
```
User input → runAllAgents() → Agent Orchestrator → Python-agenter → Resultat
```

**Kod:**
- `app/actions/analyzeRelation.ts` - Anropar `runAllAgents()`
- `lib/agents/agent_orchestrator.ts` - Kör alla agenter parallellt
- `backend/cli/run.py` - Python CLI för att köra agenter

**Vad händer:**
1. Consent check (blockerar utan samtycke)
2. PII masking
3. Language detection
4. Alla 10 diag-agenter körs parallellt
5. Safety checks (SafetyGate, Risk-agenter)
6. Scoring
7. Explain linking
8. Planning
9. Reporting

### 2. I Bakgrundsanalys (`/api/coach/analyze` - Coach-kontext)
**Status:** ✅ **AKTIVT** - Använder `runAllAgents()` för bakgrundsanalys

**Flöde:**
```
Chat conversation → POST /api/coach/analyze → runAllAgents() → Insights
```

**Kod:**
- `app/api/coach/analyze/route.ts` - Anropar `runAllAgents()` med konversation
- Extraherar relevanta insikter för coach-kontext:
  - `plan_focus` → goals
  - `plan_interventions` → recommendations
  - `diag_communication` → communication insights
  - `meta_patterns` → patterns
  - `safety_gate` + risk-agenter → riskFlags

**Användning:**
- Körs i bakgrunden när användare chattar med coachen
- Ger insikter som används för att förbättra coach-svar
- Används för `AnalysisReadiness` indikatorn

### 3. I Chat-systemet (`/coach` - Direkt chat)
**Status:** ❌ **INTE AKTIVT** - Använder INTE pyramid-agenter

**Nuvarande flöde:**
```
User message → composeCoachReply() → Regelbaserade svar från pool
```

**Kod:**
- `components/PromptWithFollowCards.tsx` - Chat-komponenten
- `app/api/coach/reply/route.ts` - Genererar coach-svar
- Använder `composeCoachReply()` som är regelbaserad

**Problem:**
- Ingen säkerhetskontroll (SafetyGate, Risk-agenter)
- Ingen emotion-detektering (MicroMood)
- Ingen minneshantering (DialogMemoryV2)
- Ingen kontextuell analys (diag-agenter)

### 4. Emotion Core (MicroMood)
**Status:** ✅ **DELVIS AKTIVT** - Används via Py-Bridge

**Flöde:**
```
Text → callMicroMood() → Py-Bridge → agents/emotion/micro_mood.py → Resultat
```

**Kod:**
- `backend/ai/py_bridge.ts` - Bridge mellan Node.js och Python
- `agents/emotion/micro_mood.py` - Python-agent för emotion-detektering
- Används i `agent_orchestrator.ts` för emotion-detektering

**Features:**
- Worker pool (2-4 workers)
- Circuit breaker vid fel
- Per-call timeout (750ms)
- Schema-validering (Zod)
- Auto-respawn vid crash

## 🔧 Teknisk Arkitektur

### Python ↔ Node.js Bridge

**Py-Bridge** (`backend/ai/py_bridge.ts`):
- Kommunicerar med Python-agenter via stdin/stdout
- JSONL-protokoll (line-framed)
- Worker pool för parallell körning
- Circuit breaker för felhantering

**Python CLI** (`backend/cli/run.py`):
- Kör agenter via subprocess
- Hanterar context och emits
- Timeout-hantering (60s)

### Agent Orchestrator

**`lib/agents/agent_orchestrator.ts`**:
- Kör alla agenter parallellt
- Hanterar routing (FastPath, Base, Mid, Top)
- Integrerar Memory V2 (om aktiverad)
- Integrerar MicroMood för emotion-detektering
- Bygger explain summaries
- Loggar telemetry

## 📊 Pyramid Routing System

Systemet använder en 4-nivå pyramid för kostnadseffektiv routing:

| Tier | Fördelning | Användning | Modell |
|------|------------|------------|--------|
| **FastPath** | 22-25% | Triviala fall | Regelbaserad |
| **Base** | 72-78% | Enkla fall | Billigaste modell |
| **Mid** | 12-15% | Medelkomplexitet | Mellannivå-modell |
| **Top** | 4-6% | Komplexa fall | Premium-modell |

**Routing-komponenter:**
- `backend/ai/model_router.py` - 3-tier routing
- `backend/ai/fastpath.py` - Trivialfall-hantering
- `backend/audit/cost_guard.py` - Budget-guards

## ⚠️ Nuvarande Begränsningar

### Chat-systemet använder INTE agenterna
- Bara regelbaserade svar från `composeCoachReply()`
- Ingen säkerhetskontroll
- Ingen emotion-detektering
- Ingen minneshantering
- Ingen kontextuell analys

### Feature Flags
- `MEMORY_V2` - Måste aktiveras för minneshantering
- `PERSONA_V1` - Måste aktiveras för persona-detektering

## 🎯 Rekommendationer

### För att använda agenterna i chat:

1. **Integrera MicroMood i chat**
   - Använd `callMicroMood()` för RED-detektering
   - Använd emotion-resultat för att anpassa ton

2. **Integrera SafetyGate i chat**
   - Kör `safety_gate` agent innan varje svar
   - Blockera eller flagga RED-meddelanden

3. **Integrera DialogMemoryV2 i chat**
   - Använd minne för kontext över tid
   - Aktivera med `MEMORY_V2=on`

4. **Använd diag-agenter för bättre svar**
   - Kör relevanta diag-agenter baserat på konversation
   - Använd insikter för att förbättra coach-svar

5. **Använd bakgrundsanalys mer aktivt**
   - `/api/coach/analyze` körs redan i bakgrunden
   - Använd insikterna mer aktivt i `composeCoachReply()`

## 📝 Sammanfattning

**Agent-systemet är:**
- ✅ Aktivt i `/analyze` (relationanalys)
- ✅ Aktivt i `/api/coach/analyze` (bakgrundsanalys)
- ❌ INTE aktivt i `/coach` (direkt chat)

**För att få full nytta:**
- Integrera agenterna i chat-systemet
- Aktivera Memory V2 och Persona Agent
- Använd bakgrundsanalys mer aktivt för att förbättra coach-svar

**Teknisk stack:**
- Python-agenter i `agents/`
- Node.js orchestrator i `lib/agents/agent_orchestrator.ts`
- Py-Bridge för kommunikation (`backend/ai/py_bridge.ts`)
- Python CLI för körning (`backend/cli/run.py`)

