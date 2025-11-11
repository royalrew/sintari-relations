# Analys av Metrics Scripts

## Översikt

Dessa scripts är från gamla tester och telemetry-system. Här är en analys av vad de gör och om de är relevanta för den nya coach-pipelinen.

## Scripts och deras status

### ✅ Aktiva / Relevanta

1. **`enforce_pyramid_targets.py`**
   - **Syfte**: Verifierar pyramid-fördelning (fastpath/base/mid/top tiers)
   - **Status**: ✅ Används aktivt i CI (`.github/workflows/ci.yml`)
   - **Relevans**: Relevant för routing-systemet
   - **Åtgärd**: Behåll

2. **`pyramid_report.py`**
   - **Syfte**: Genererar pyramid-rapport från shadow-logs
   - **Status**: ✅ Används aktivt i CI
   - **Relevans**: Relevant för routing-systemet
   - **Åtgärd**: Behåll

3. **`normalize_worldclass.ts`**
   - **Syfte**: Normaliserar telemetry-data (snake_case keys, ISO timestamps, dedupe, tone deltas)
   - **Status**: ✅ Används aktivt
   - **Relevans**: Relevant för telemetry-processing
   - **Åtgärd**: Behåll

4. **`normalise_worldclass_live.mjs`**
   - **Syfte**: Wrapper för `normalize_worldclass.ts`
   - **Status**: ✅ Används aktivt
   - **Relevans**: Relevant för telemetry-processing
   - **Åtgärd**: Behåll

5. **`telemetry_budget_check.ts`**
   - **Syfte**: Kontrollerar telemetry budget
   - **Status**: ✅ Används aktivt (har test-filer)
   - **Relevans**: Relevant för kostnadskontroll
   - **Åtgärd**: Behåll

6. **`rotate_worldclass_log.py`**
   - **Syfte**: Roterar `worldclass_live.jsonl` när den blir för stor
   - **Status**: ✅ Användbar för maintenance
   - **Relevans**: Relevant för log-hantering
   - **Åtgärd**: Behåll

7. **`schema_validate.mjs`**
   - **Syfte**: Validerar JSONL-data mot schema
   - **Status**: ✅ Användbar för data-validering
   - **Relevans**: Relevant för kvalitetssäkring
   - **Åtgärd**: Behåll

### ⚠️ Potentiellt Föråldrade / Från Gamla Tester

8. **`enforce_style_gate.py`**
   - **Syfte**: Kontrollerar style-metrics (tone_delta, echo_ratio, question_count, likability_proxy, language parity)
   - **Status**: ⚠️ Från gamla tester, använder gamla telemetry-format
   - **Relevans**: **LÅG** - Coach-pipelinen använder nu templates och tone_fixer istället
   - **Åtgärd**: **Överväg att ta bort eller uppdatera** för nya coach-pipelinen

9. **`enforce_red_snapshot.py`**
   - **Syfte**: Validerar RED farewell responses mot frozen snapshots
   - **Status**: ⚠️ Från gamla tester
   - **Relevans**: **MEDEL** - Säkerhetslagret har nu ny implementation, men snapshot-validering kan vara användbar
   - **Åtgärd**: **Överväg att uppdatera** för nya säkerhetslagret eller ta bort om inte längre relevant

10. **`enforce_honesty_gate.py`**
    - **Syfte**: Kontrollerar honesty-metrics (rate, repair_accept_rate, no_advice)
    - **Status**: ⚠️ Från gamla tester (har test-filer)
    - **Relevans**: **LÅG** - Coach-pipelinen har inte längre samma honesty-system
    - **Åtgärd**: **Överväg att ta bort** om honesty-systemet inte längre används

11. **`enforce_parity_gate.py`**
    - **Syfte**: Kontrollerar language parity (SV vs EN likability_proxy gap)
    - **Status**: ⚠️ Från gamla tester
    - **Relevans**: **MEDEL** - Kan vara användbar för att säkerställa jämn kvalitet mellan språk
    - **Åtgärd**: **Överväg att behålla** om language parity är viktigt

12. **`enforce_release_criteria.py`**
    - **Syfte**: GO/NO-GO gate för release (kontrollerar artifacts)
    - **Status**: ⚠️ Från gamla release-processer
    - **Relevans**: **MEDEL** - Kan vara användbar för release-processer
    - **Åtgärd**: **Överväg att uppdatera** för nya release-kriterier eller ta bort om inte längre relevant

13. **`oversight_gate.ts`**
    - **Syfte**: GPT-5-review för svarskvalitet (har test-filer)
    - **Status**: ⚠️ Från gamla tester
    - **Relevans**: **LÅG** - Coach-pipelinen har redan GPT-5 Teacher integrerad (`lib/coach/quality_teacher.ts`)
    - **Åtgärd**: **Överväg att ta bort** eller konsolidera med GPT-5 Teacher

## Rekommendationer

### Behåll (7 scripts)
- `enforce_pyramid_targets.py` - Aktiv i CI
- `pyramid_report.py` - Aktiv i CI
- `normalize_worldclass.ts` - Aktiv
- `normalise_worldclass_live.mjs` - Aktiv
- `telemetry_budget_check.ts` - Aktiv
- `rotate_worldclass_log.py` - Användbar
- `schema_validate.mjs` - Användbar

### Överväg att ta bort eller uppdatera (6 scripts)
- `enforce_style_gate.py` - **TA BORT** (ersatt av templates + tone_fixer)
- `enforce_honesty_gate.py` - **TA BORT** (om honesty-systemet inte längre används)
- `oversight_gate.ts` - **TA BORT** (ersatt av GPT-5 Teacher)
- `enforce_red_snapshot.py` - **UPPDATERA** eller ta bort (nytt säkerhetslager)
- `enforce_parity_gate.py` - **BEHÅLL** om language parity är viktigt
- `enforce_release_criteria.py` - **UPPDATERA** för nya release-kriterier eller ta bort

## Nästa steg

1. **Verifiera användning**: Kontrollera om de potentiellt föråldrade scripts faktiskt används någonstans
2. **Uppdatera eller ta bort**: Besluta om scripts ska uppdateras för nya coach-pipelinen eller tas bort
3. **Dokumentera**: Uppdatera dokumentation om vilka scripts som är aktiva

