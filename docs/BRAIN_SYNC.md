# Brain Sync Pipeline

**Syfte:** Single source of truth för hjärnans komponenter och live-KPI:er.

## Pipeline

1. **Brain Sync** (`scripts/brain_sync.py`)
   - Läser `BRAIN_FIRST_PLAN.md` (från `Roadmapp/`)
   - Extraherar kärnfunktioner vs polish
   - Skriver `reports/brain_matrix.json` (kanonisk struktur)
   - Skriver `reports/brain_sync.json` (diff mot föregående körning)

2. **WorldClass Live** (`backend/metrics/worldclass_live.py`)
   - Läser `reports/pyramid_live_kpis.json` (fallback)
   - Läser `reports/brain_matrix.json` (för core presence tracking)
   - Skriver `reports/worldclass_live.json` (live KPI:er var 5:e min)

3. **Live KPI API** (`app/api/live_kpi/route.ts`)
   - Next.js endpoint: `GET /api/live_kpi`
   - Läser `reports/worldclass_live.json`
   - No-cache (alltid fresh data)

4. **CI Gate** (`.github/workflows/worldclass_live.yml`)
   - Kör var 5:e minut (cron) eller manuellt (`workflow_dispatch`)
   - Validerar att alla KPI-nycklar finns
   - Enforcerar hårda gränser:
     - `empathy_f1 >= 0.92`
     - `tone_drift < 0.05`
     - `recall_rate >= 0.90`

## KPI-nycklar (obligatoriska)

- `empathy_f1`: Empathy F1-score (mål: ≥0.92)
- `tone_drift`: Tone-drift över tid (mål: <0.05)
- `recall_rate`: Dialog Memory recall (mål: ≥0.90)
- `si_loop_status`: SI-loop status (`idle` | `running` | `blocked`)
- `likability`: Likability score (mål: ≥4.4)
- `retention_7d`: 7-day retention rate (mål: ≥0.40)

## Lokal körning

```bash
# 1) Synca hjärnan
make brain-sync

# 2) Skriv live-KPI (JSON)
make worldclass-live

# 3) Gate lokalt
make gate-live
```

## Filstruktur

```
reports/
├── brain_matrix.json      # Kanonisk struktur (kärna vs polish)
├── brain_sync.json         # Diff mot föregående körning
├── worldclass_live.json    # Live KPI:er (single source of truth)
└── si_micro.json          # Micro SI-loop resultat (opt)
```

## Filosofi

**Brain First:** Bygg hjärnan först, sedan karossen.

- Mät i JSON först (inte bara känsla)
- En enda sanning (`worldclass_live.json`)
- CI-gate som stoppar regress
- API klart när UI är redo

## Nästa steg

- [ ] Koppla in riktiga KPI-källor (istället för fallback)
- [ ] Micro SI-loop: koppla till golden tests
- [ ] Dialog Memory v2: hook för `recall_rate`
- [ ] Persona Agent: hook för `personalisering`
- [ ] Live Ticker UI (vänta tills KPI-JSON är grön)

