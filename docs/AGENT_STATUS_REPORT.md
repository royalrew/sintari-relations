# Agent-statusrapport: Stubbar och Förbättringsområden

**Genererad:** 2025-11-10  
**Totalt antal agenter:** 29+  
**Status:** Analys av alla `main.py` filer i `agents/`

## 🔴 KRITISKA STUBBAR (Måste implementeras)

Dessa agenter är nästan tomma placeholder-implementationer som returnerar bara default-värden:

### 1. Risk-agenter (3 st) - **HÖG PRIORITET**

#### `risk_abuse` (26 rader)
**Status:** ❌ STUBB  
**Problem:** Returnerar alltid `"abuse_risk": "LOW"` utan analys  
**Vad behövs:**
- Lexikon för fysiskt/psykiskt våld
- Mönsterdetektering (hot, kontroll, isolering)
- Scoring-algoritm baserad på signalstyrka
- Integration med SafetyGate för RED-flagging

**Rekommendation:** Implementera liknande struktur som `safety_gate` men fokuserat på abuse-mönster

#### `risk_coercion` (26 rader)
**Status:** ❌ STUBB  
**Problem:** Returnerar alltid `"coercion_risk": "LOW"` utan analys  
**Vad behövs:**
- Detektering av kontrollbeteenden
- Mönster för tvång och manipulation
- Gaslighting-indikatorer
- Ekonomisk kontroll-signaler

**Rekommendation:** Implementera coercion-detektering baserat på kontrollmönster

#### `risk_selfharm` (26 rader)
**Status:** ❌ STUBB  
**Problem:** Returnerar alltid `"selfharm_risk": "LOW"` utan analys  
**Vad behövs:**
- Lexikon för självskadebeteende
- Känslomässig desperation-signaler
- Hopplöshet-indikatorer
- KRITISK: Integration med crisis_router för akut hantering

**Rekommendation:** Högsta prioritet - självskadebeteende måste fångas korrekt

### 2. Dialog-agenter (2 st) - **MEDEL PRIORITET**

#### `speaker_attrib` (30 rader)
**Status:** ❌ STUBB  
**Problem:** Tilldelar allt till "P1" utan analys  
**Vad behövs:**
- Parsing av dialogstruktur
- Identifiering av talare baserat på kontext
- Hantering av "jag/du" vs "P1/P2"
- Confidence-scoring för attribution

**Rekommendation:** Implementera smart speaker-attribution baserat på pronomen och kontext

#### `thread_parser` (30 rader)
**Status:** ❌ STUBB  
**Problem:** Skapar bara en enkel thread utan parsing  
**Vad behövs:**
- Parsing av flerpartssamtal
- Sekvensdetektering
- Tidsstämplar och turordning
- Dialogstruktur-extraktion

**Rekommendation:** Implementera robust thread-parsing för flerpartssamtal

### 3. Crisis & Premium (2 st) - **MEDEL PRIORITET**

#### `crisis_router` (36 rader)
**Status:** ❌ STUBB  
**Problem:** Returnerar alltid `"crisis_required": False`  
**Vad behövs:**
- Integration med SafetyGate RED-signaler
- Integration med risk_selfharm
- Krisresurser (telefonnummer, länkar)
- Akut handlingsplan
- Tidskänslig routing (<60s responstid)

**Rekommendation:** Implementera krisrouting med resurser och handlingsplaner

#### `premium_review` (28 rader)
**Status:** ❌ STUBB  
**Problem:** Returnerar bara `"polished": True` placeholder  
**Vad behövs:**
- Kvalitetsgranskning för premium-användare
- Djupare analys och insikter
- Prioriterad behandling
- Premium-specifika features

**Rekommendation:** Definiera vad "premium review" innebär och implementera

## 🟡 DELVIS IMPLEMENTERADE (Behöver förbättringar)

### `context_graph` (87 rader)
**Status:** 🟡 DELVIS  
**Vad fungerar:**
- Grundläggande aktörsdetektering
- Enkel händelsedetektering
- Timeline-skapande

**Vad behöver förbättras:**
- Mer sofistikerad grafbyggnad
- Relationer mellan aktörer
- Tidsmönster och sekvenser
- Confidence-scoring kan förbättras

**Rekommendation:** Utöka med mer avancerad grafanalys

### `calibration` (65 rader)
**Status:** 🟡 DELVIS  
**Vad fungerar:** Grundläggande kalibrering  
**Vad behöver förbättras:**
- Mer robust drift-detektering
- Bättre skalstabilitet
- Integration med golden tests

**Rekommendation:** Förbättra kalibreringsalgoritmer

## ✅ VÄL IMPLEMENTERADE (Fungerar bra)

Dessa agenter är fullt implementerade och fungerar:

- ✅ `safety_gate` (256 rader) - Fullständig säkerhetskontroll
- ✅ `consent` (307 rader) - Komplett samtyckeshantering
- ✅ `diag_communication` (232 rader) - Kommunikationsanalys
- ✅ `diag_trust` (238 rader) - Tillitsanalys
- ✅ `diag_conflict` (229 rader) - Konfliktanalys
- ✅ `diag_boundary` (257 rader) - Gränser-analys
- ✅ `diag_intimacy` (245 rader) - Intimitet-analys
- ✅ `diag_alignment` (237 rader) - Värderingsanalys
- ✅ `diag_attachment` (95 rader) - Bindningsstil-analys
- ✅ `plan_focus` (237 rader) - Fokusval
- ✅ `plan_interventions` (308 rader) - Interventionsplanering
- ✅ `report_comp` (328 rader) - Rapportkompilering
- ✅ `report_evidence` (313 rader) - Evidenssamling
- ✅ `report_pdf` (394 rader) - PDF-generering
- ✅ `meta_patterns` (273 rader) - Mönsterdetektering
- ✅ `features_conversation` (377 rader) - Konversationsmönster
- ✅ `features_temporal` (224 rader) - Tidsmönster
- ✅ `scoring` (284 rader) - Poängberäkning
- ✅ `normalize` (138 rader) - Textnormalisering
- ✅ `pii_masker` (199 rader) - PII-maskering
- ✅ `lang_detect` (171 rader) - Språkdetektering
- ✅ `topic_classifier` (223 rader) - Ämnesklassificering
- ✅ `explain_linker` (271 rader) - Förklaringslänkning
- ✅ `export_agent` (272 rader) - Export
- ✅ `quality_privacy` (262 rader) - Kvalitet & integritet
- ✅ `tox_nuance` (306 rader) - Toxicitetsanalys
- ✅ `diag_power` (262 rader) - Maktbalans-analys
- ✅ `diag_digital` (281 rader) - Digital kommunikation
- ✅ `diag_cultural` (301 rader) - Kulturella faktorer
- ✅ `diag_substance` (311 rader) - Substansmissbruk

## 📊 Sammanfattning

| Kategori | Antal | Status |
|----------|-------|--------|
| **Kritiska stubbar** | 7 | 🔴 Måste implementeras |
| **Delvis implementerade** | 2 | 🟡 Behöver förbättringar |
| **Väl implementerade** | 20+ | ✅ Fungerar bra |

## 🎯 Prioritering för implementering

### Högsta prioritet (Säkerhet)
1. **`risk_selfharm`** - KRITISK för användarsäkerhet
2. **`risk_abuse`** - Viktig för att fånga våld
3. **`risk_coercion`** - Viktig för kontrollbeteenden
4. **`crisis_router`** - Måste fungera när risker detekteras

### Medel prioritet (Funktionalitet)
5. **`speaker_attrib`** - Förbättrar analys av flerpartssamtal
6. **`thread_parser`** - Förbättrar dialoghantering
7. **`premium_review`** - Om premium-funktioner används

### Lägsta prioritet (Förbättringar)
8. **`context_graph`** - Förbättra befintlig implementation
9. **`calibration`** - Förbättra kalibrering

## 💡 Rekommendationer

### För risk-agenter:
- Använd `safety_gate` som mall (den är väl implementerad)
- Skapa lexikon för respektive risk-typ
- Implementera scoring-algoritmer
- Integrera med SafetyGate för RED-flagging

### För dialog-agenter:
- Använd `diag_communication` som referens för lexikon-baserad analys
- Implementera smart parsing baserat på pronomen och kontext
- Lägg till confidence-scoring

### För crisis_router:
- Integrera med alla risk-agenter
- Lägg till krisresurser (telefonnummer, länkar)
- Implementera akut handlingsplan
- Säkerställ <60s responstid

## 📝 Nästa steg

1. **Implementera risk-agenter** - Börja med `risk_selfharm` (högsta prioritet)
2. **Implementera dialog-agenter** - Förbättra flerpartssamtal-hantering
3. **Implementera crisis_router** - Säkerställ att kriser hanteras korrekt
4. **Förbättra delvis implementerade** - Utöka `context_graph` och `calibration`

**Totalt:** 7 kritiska stubbar som måste implementeras för att systemet ska fungera fullt ut.

