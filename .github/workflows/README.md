# GitHub Actions Workflows - Översikt

Denna fil ger en komplett översikt över alla CI/CD workflows i projektet.

---

## 📋 Quick Reference

| Workflow | Trigger | Hårdhet | Timeout | Beskrivning |
|----------|---------|---------|---------|-------------|
| **ci.yml** | Push/PR till main | 🔴 Hård | 30 min | Huvud-CI pipeline |
| **agg_emotion.yml** | Varje timme + manual | 🟢 Mjuk | - | Aggregerar emotion KPIs |
| **check-scorer-version.yml** | PR (scorer-ändringar) | 🔴 Hård | - | Verifierar CHANGELOG |
| **emotion_golden.yml** | Path-baserad | 🔴 Hård | - | Emotion golden tests |
| **relations-hotfix.yml** | Push + manual | 🔴 Hård | - | Relations E2E test |
| **test_py_bridge.yml** | Path-baserad | 🔴 Hård | - | Py-Bridge integration |

---

## 🔍 Detaljerad Beskrivning

### 1. `ci.yml` - Huvud-CI Pipeline

**Triggers:**
- `push` till `main`
- `push` av tags `v*` (t.ex. `v1.0.0`)
- `pull_request` till `main`

**Steg:**
1. ✅ Checkout + submodules
2. ✅ Verifiera agents (vendored)
3. ✅ Setup Node.js (v20) + pnpm (cached)
4. ✅ Setup Python (v3.11)
5. ✅ Install dependencies (JS + Python)
6. ✅ **Run Node tests (smoke)** - `test:smoke` script
7. ✅ **Golden E2E** - `test_relations_golden.py`
8. ✅ **Pyramid Routing Tests** - `test_pyramid_routing.py`
9. ✅ **RedTeam Suite** - `test_redteam_ci.py`
10. ✅ **Py-Bridge Micro-Mood Test** - 20 golden cases
11. ✅ **Aggregate Emotion Events** - `agg_emotion_events.mjs`
12. ✅ **Emotion KPI Gates** - Block om KPIs inte uppfylls
13. ✅ **Emotion Drop Rate Gate** - Verifierar drop rate
14. ✅ **RED Sanity Suite** - 10 kritiska cases
15. ✅ **Tone Gate (Soft)** - Tone validation
16. ✅ **Assemble pyramid dataset** - Samlar `datasets/*.jsonl` → `reports/pyramid_live.jsonl`
17. ✅ **Pyramid report** - Genererar `pyramid_live.md`
18. ✅ **Enforce pyramid targets** - Verifierar FastPath/Base/Mid/Top distribution
19. ✅ **Generate scorecard** - `last.html` (soft gate)
20. ✅ **Update pyramid dashboard** - Dashboard generation
21. ✅ **Generate KPI dashboard** - KPI metrics
22. ✅ **Enforce golden freeze** - Verifierar VERSION update
23. ✅ **Ladda upp rapporter** - Artifacts: `reports/**`, `out/**`

**Viktiga Env-variabler:**
- `FASTPATH_MAX_LEN: 60`
- `FASTPATH_MAX_TOKENS: 12`
- `ROUTER_BASE_THR: 0.88`
- `ROUTER_MID_THR: 0.70`
- `ROUTER_EPS_TOP: 0.010`

**Timeout:** 30 minuter

---

### 2. `agg_emotion.yml` - Emotion Event Aggregation

**Triggers:**
- `schedule`: Varje timme (`0 * * * *`)
- `workflow_dispatch`: Manual trigger

**Steg:**
1. ✅ Checkout
2. ✅ Setup Node.js (v20)
3. ✅ **Aggregate Emotion Events** - `scripts/agg_emotion_events.mjs`
4. ✅ **Persist KPI artifact** - Uploadar `pyramid_live_kpis.json` (retention: 7 dagar)

**Syfte:** Samlar emotion events över tid och genererar KPI-statistik.

---

### 3. `check-scorer-version.yml` - Scorer Version Changelog Check

**Triggers:**
- `pull_request` (path-based)
- **Paths:** `tests/_helpers/scoring_relations.py`

**Steg:**
1. ✅ Checkout (full history)
2. ✅ **Check if SCORER_VERSION changed** - Diff mot base branch
3. ✅ **Check CHANGELOG for version entry** - Verifierar att `CHANGELOG.md` uppdaterats

**Syfte:** Säkerställer att varje ändring av `SCORER_VERSION` dokumenteras i changelog.

**Fail om:**
- `SCORER_VERSION` ändrats utan changelog-update
- Changelog uppdaterad men innehåller inte ny version

---

### 4. `emotion_golden.yml` - Emotion Golden Tests

**Triggers:**
- `push` (path-based)
- `pull_request` (path-based)
- **Paths:**
  - `tests/golden/emotion/**`
  - `agents/emotion/**`
  - `sintari-relations/backend/ai/py_bridge.ts`
  - `sintari-relations/scripts/emotion_golden_*.mjs`

**Steg:**
1. ✅ Checkout
2. ✅ Setup Node.js (v20)
3. ✅ Install dependencies (pnpm/npm)
4. ✅ Setup Python (v3.11)
5. ✅ **Run Golden Evaluation** - `emotion_golden_eval.mjs`
6. ✅ **Generate Proposals** - `emotion_golden_update.mjs --propose`
7. ✅ **Lint Golden File** - `lint_emotion_golden.mjs`
8. ✅ **Run Golden Integrity Test** - `test_golden_integrity.spec.ts`
9. ✅ **Run Golden Tests** - `test_micro_mood_golden.spec.ts`
10. ✅ **Upload Reports** - `emotion_golden_report.json`, `emotion_golden_proposed.diff.json`

**Syfte:** Verifierar att emotion-agenten (`micro_mood.py`) uppfyller golden test-kriterier.

---

### 5. `relations-hotfix.yml` - Relations Pipeline E2E Test

**Triggers:**
- `push` (alla branches)
- `workflow_dispatch`: Manual trigger

**Steg:**
1. ✅ Checkout
2. ✅ Setup Python (v3.11)
3. ✅ **Install system deps** - LibreOffice, fonts-dejavu-core, jq
4. ✅ **Install Python deps** - python-docx, pytest, jq
5. ✅ **Verify LibreOffice** - Verifierar att `soffice` fungerar
6. ✅ **Run minimal test** - `input_en.json`
7. ✅ **Run SV test** - `input_sv.json` (å/ä/ö)
8. ✅ **Run PII test** - PII masking
9. ✅ **Run NA test** - "Otillräckligt underlag"
10. ✅ **Assertions** - Hård validering:
    - PDF måste finnas och vara >1024 bytes
    - Ingen "und" language
    - Backend måste vara "libreoffice"
    - Ingen ReportLab-användning
11. ✅ **Upload artifacts** - `out/` (retention: 1 dag)

**Env-variabler:**
- `EXPORT_BACKEND: libreoffice`
- `PYTHONIOENCODING: utf-8`

**Syfte:** Fullständig E2E-test av relations pipeline med LibreOffice PDF-generering.

---

### 6. `test_py_bridge.yml` - Py-Bridge Micro-Mood Integration Test

**Triggers:**
- `pull_request` (path-based)
- `push` till `main` eller `develop` (path-based)
- **Paths:**
  - `agents/emotion/micro_mood.py`
  - `sintari-relations/backend/ai/py_bridge.ts`
  - `sintari-relations/scripts/test_py_bridge_micro_mood.mjs`

**Steg:**
1. ✅ Checkout
2. ✅ Setup Node.js (v22, npm cached)
3. ✅ Setup Python (v3.13)
4. ✅ Install dependencies (npm ci)
5. ✅ Install Python dependencies
6. ✅ **Run Py-Bridge Golden Test** - `test_py_bridge_micro_mood.mjs` (20 cases)
7. ✅ **Test error handling** - Tom input
8. ✅ **Test JSONL protocol** - Verifierar JSONL communication

**Env-variabler:**
- `PYTHON_BIN: python3`
- `PYTHONIOENCODING: utf-8`
- `LC_ALL: C.UTF-8`
- `LANG: C.UTF-8`

**Syfte:** Verifierar att Node.js ↔ Python bridge fungerar korrekt för emotion-agenten.

---

## 🎯 Pyramid Distribution Targets

**Mål för Pyramid Routing:**

| Tier | Target % | Trösklar (ci.yml) |
|------|----------|-------------------|
| **FastPath** | 22-25% | `FASTPATH_MAX_LEN: 60`, `FASTPATH_MAX_TOKENS: 12` |
| **Base** | 72-78% | `ROUTER_BASE_THR: 0.88` |
| **Mid** | 12-18% | `ROUTER_MID_THR: 0.70` |
| **Top** | 4-6% | `ROUTER_EPS_TOP: 0.010`, `ROUTER_TOP_MIN: 0.02` |

**Enforce pyramid targets:**
- Körs bara om `COUNT >= 180` cases
- FAIL om distribution ligger utanför targets

---

## 🔧 Lokal Testning

### Test Py-Bridge Micro-Mood:
```bash
cd sintari-relations
node scripts/test_py_bridge_micro_mood.mjs
```

### Test Relations Pipeline:
```bash
python -m backend.cli.run --input tests/golden/minimal/input_en.json --out out/minimal
```

### Assemble Pyramid Dataset:
```bash
mkdir -p reports
jq -c . datasets/*.jsonl > reports/pyramid_live.jsonl
python scripts/metrics/pyramid_report.py reports/pyramid_live.jsonl | head -n 30
```

---

## 📊 Artifacts

| Workflow | Artifact | Retention |
|----------|----------|-----------|
| **ci.yml** | `ci-reports` (`reports/**`, `out/**`) | Default (90 dagar) |
| **agg_emotion.yml** | `pyramid_live_kpis.json` | 7 dagar |
| **emotion_golden.yml** | `emotion_golden_reports` | Default |
| **relations-hotfix.yml** | `test-outputs` (`out/`) | 1 dag |

---

## 🚨 Vanliga Problem och Lösningar

### Problem: CI failar på "Enforce pyramid targets"
**Orsak:** För få cases (< 180) eller fel distribution
**Lösning:**
- Se till att `datasets/*.jsonl` innehåller tillräckligt många cases
- Justera thresholds i `ci.yml` (`ROUTER_BASE_THR`, `ROUTER_MID_THR`)

### Problem: Scorecard WARN failar CI
**Lösning:** Redan fixat - scorecard är nu soft gate (`|| echo "WARN..."`)

### Problem: Py-Bridge test hittar inte `micro_mood.py`
**Lösning:** Verifiera att `agents/emotion/micro_mood.py` finns (vendored i sintari-relations)

### Problem: Relations-hotfix failar på PDF generation
**Orsak:** LibreOffice saknas eller fil-locking på Windows
**Lösning:** 
- CI: Verifiera `EXPORT_BACKEND=libreoffice`
- Lokalt: Installera LibreOffice och sätt `LIBREOFFICE_PATH`

---

## 📝 Uppdaterad: 2025-01-XX

Sista ändringar:
- ✅ Pyramid thresholds justerade för Mid distribution (12-18%)
- ✅ Scorecard gjort till soft gate
- ✅ Assemble pyramid dataset steg tillagt
- ✅ Micro-mood golden tests kalibrerade (20/20 passerar)

