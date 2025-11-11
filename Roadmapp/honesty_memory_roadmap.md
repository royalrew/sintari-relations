# Honesty & Memory Roadmap

## Översikt

Detta dokument beskriver implementeringsplanen för "Honesty" (ärlighet vid osäkerhet) och "Memory Drawer" (Minnespanel) i chatten.

**Senaste status (2025-11-07):**
- ✅ Fas 0 färdigställd (schema + normalisering + strukturfiler)
- ✅ Fas 1 komplett – honesty-signaler, svar, policy-hook, telemetri och CI-gate levererade
- ✅ Fas 4.2/4.3/4.4/4.5 uppdaterade med ny admin-dashboard, paritetsgate, RED-snapshot och nightly driftlarm
- Pågående nästa steg: Fas 2 (Subject Memory) och Fas 3 (Goals & Privacy)

---

## Fas 0: Setup & Grundläggande

### 0.1 Setup - Skapa plan & mappar
**Leverabel:** Grundfiler + kataloger enligt planen  
**Filer/Platser:** 
- `Roadmapp/honesty_memory_plan.csv`
- `schemas/`
- `scripts/metrics/`
- `tests/golden/style/`

**Nyckellogik:** Lägg grundfiler + kataloger enligt planen  
**Tester:** -  
**CI-Gate:** -  
**Env-Flaggor:** -  
**Ägare:** Jimmy  
**ETA:** 0.5d  
**Acceptance Criteria:** Repo innehåller mappar & tomma filer enligt plan  
**CLI/Kommandon:** `git add . && git commit -m 'Bootstrap honesty+memory plan'`

### 0.2 Schema - JSON-schema för worldclass_live
**Leverabel:** Schema som validerar normaliserad logg  
**Filer/Platser:** `schemas/worldclass_live.schema.json`  
**Nyckellogik:** Definiera required keys: `ts`, `session_id`, `run_id`, `seed_id`, `turn`, `mode`, `risk`, `reply_text`, `kpi.*`, `tone.vec`, `style.*`, `honesty.*`  
**Tester:** `tests/schema/schema_valid.test.ts`  
**CI-Gate:** CI: jsonschema-val mot normaliserad fil  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Schema validerar senaste normaliserade logg  
**CLI/Kommandon:** `npm run test -- tests/schema/schema_valid.test.ts`

### 0.3 Normalisering - Normaliserare m. monotonic + dedupe
**Leverabel:** Normaliserare med monotonic timestamp-check och dedupe  
**Filer/Platser:** `scripts/metrics/normalise_worldclass_live.ts`  
**Nyckellogik:** 
- `--enforce-monotonic`
- `--dedupe-sec 900`
- Window N=50
- `skip_reason` loggas

**Tester:** `tests/metrics/normalise_smoke.test.ts`  
**CI-Gate:** CI: normalise → schema-val körs före gates  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** p95 time mono OK; 0 schema-fel  
**CLI/Kommandon:** `node scripts/metrics/normalise_worldclass_live.ts reports/worldclass_live.jsonl > reports/worldclass_live.norm.jsonl`

---

## Fas 1: Honesty (Ärlighet vid osäkerhet)

### 1.1 Honesty-signals - Signalmotor (shouldTriggerHonesty)
**Leverabel:** Signalmotor som detekterar när honesty ska aktiveras  
**Filer/Platser:** `lib/policy/honesty_signals.ts`  
**Nyckellogik:** Trigga på:
- `memory.hit_at_3 < 1.0`
- `confidence < 0.6`
- `explain.has_evidence = 0`
- `expected_lang ≠ detected_lang`
- `tone_delta > 0.05` (p95)
- `data_gap`
- `RED/HR`

**Tester:** `tests/style/honesty_signals.test.ts`  
**CI-Gate:** Style Gate: breach om råd ges när honesty=true  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** 100% branch-träff i tests; alla signalfall detekteras  
**CLI/Kommandon:** `npm test -- tests/style/honesty_signals.test.ts --runInBand`
**Status:** ✅ Klar (2025-11-07)

### 1.2 Honesty-reply - Mallbyggare (composeHonestReply)
**Leverabel:** Mallbyggare för ärliga svar  
**Filer/Platser:** `lib/policy/honesty_reply.ts`  
**Nyckellogik:** 
- SV/EN byggblock: 'Jag ser' + 'Jag saknar' + 'Vill du…' (1 fråga max)
- HR/RED-variant
- no-advice

**Tester:** `tests/style/honesty_reply.test.ts`  
**CI-Gate:** Snapshot-gate: varma fraser + inga diagnoser  
**Env-Flaggor:** `NEXT_PUBLIC_SHOW_INTERJECTION=false`  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Svar följer mall; question_count=1; allowAdvice=false  
**CLI/Kommandon:** `npm test -- tests/style/honesty_reply.test.ts`
**Status:** ✅ Klar (2025-11-07)

### 1.3 Policy-hook - Integrera i policy_reply
**Leverabel:** Honesty-integration i policy_reply  
**Filer/Platser:** `copy/policy_reply.ts`  
**Nyckellogik:** När honesty=true:
- blockera råd
- lås interjection
- tvinga seed.locale-pool
- returnera composeHonestReply

**Tester:** `tests/style/test_chat_policy.test.ts` (utökad)  
**CI-Gate:** Style Gate + Honesty Gate  
**Env-Flaggor:** `NEXT_PUBLIC_SHOW_THINK=false`  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Alla style-tester passerar; RED/HR säkra  
**CLI/Kommandon:** `npm test -- tests/style/test_chat_policy.test.ts --runInBand`
**Status:** ✅ Klar (2025-11-07)

### 1.4 Telemetry - Honesty-fält i logg
**Leverabel:** Honesty-telemetry i worldclass_live  
**Filer/Platser:** 
- `lib/metrics/style_telemetry.ts`
- `pages/api/style/log.ts`

**Nyckellogik:** Emit `honesty:{active,reasons,missing_facets,suggested_probe}`; räkna `honesty.rate/repair_accept_rate/time_to_repair`  
**Tester:** `tests/metrics/telemetry_honesty.test.ts`  
**CI-Gate:** Schema Gate: honesty.* krävs när active  
**Env-Flaggor:** `STYLE_TELEMETRY_SAMPLE=base:1,post3:3`  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Loggar rätt shape; sampling följs  
**CLI/Kommandon:** `npm test -- tests/metrics/telemetry_honesty.test.ts`
**Status:** ✅ Klar (2025-11-07)

### 1.5 CI-gate - Honesty Gate (p95/råd-block)
**Leverabel:** CI-gate för honesty-kvalitet  
**Filer/Platser:** `scripts/metrics/enforce_honesty_gate.py`  
**Nyckellogik:** Fail om:
- råd vid honesty=true
- honesty.rate < 0.10 (i brist-cases)
- repair_accept_rate < 0.5

**Tester:** `tests/metrics/enforce_honesty_gate.test.py`  
**CI-Gate:** GitHub Actions: kör efter schema + style  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Gate stoppar regress; rapport visar breaches  
**CLI/Kommandon:** `python scripts/metrics/enforce_honesty_gate.py reports/worldclass_live.norm.jsonl`
**Status:** ✅ Klar (2025-11-07)

---

## Fas 2: Subject Memory (Personminne)

### 2.1 Subject Core - Subject-minne (Pin/Alias)
**Leverabel:** Core subject memory-struktur  
**Filer/Platser:** `lib/memory/subject_memory.ts`  
**Nyckellogik:** Struktur: `subject_id`, `primary_name`, `aliases[]`, `pronouns`, `trust_score`, `last_seen_ts`  
**Tester:** `tests/memory/subject_memory.test.ts`  
**CI-Gate:** -  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** CRUD funkar; alias-merge fungerar  
**CLI/Kommandon:** `npm test -- tests/memory/subject_memory.test.ts`  
**Status:** ✅ Klar (2025-11-07) – repo, helper-exporter och in-memory store implementerad

### 2.2 Resolver - Subject-resolver (text→person)
**Leverabel:** Resolver som matchar text till personer  
**Filer/Platser:** `lib/memory/subject_resolver.ts`  
**Nyckellogik:**  
- Heuristik + fuzzy match + relationstitlar  
- Hash per kontext  
- LRU-cache + TTL via `SubjectResolver`

**Tester:** `tests/memory/subject_resolver.test.ts`  
**CI-Gate:** CI: p95 resolver-precision ≥0.9 på golden  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** p95 ≥0.9; korrekt subject_id för Fredrick/Fredrik  
**CLI/Kommandon:** `npm test -- tests/memory/subject_resolver.test.ts`  
**Status:** ✅ Klar (2025-11-07) – indexbyggare, fuzzy resolver och stateful cache levererad

### 2.3 GhostChip v2 - Frontend-detektor + 'Pin as subject'
**Leverabel:** Förbättrad GhostChip med Pin-funktionalitet  
**Filer/Platser:**  
- `components/memory/GhostChip.tsx`  
- `app/api/memory/pin/route.ts`  
- `app/api/memory/alias/route.ts`

**Nyckellogik:**  
- Markerar namn i löptext (>1 rad)  
- Pin → primary (skapar subject vid behov)  
- Alias → lägger alias på aktivt subject  
- Undo via föregående primary

**Tester:** (UI-skelett `tests/ui/ghost_chip.test.tsx` för senare automatisering)  
**CI-Gate:** Playwright TODO – manuell QA tills vidare  
**Env-Flaggor:** `NEXT_PUBLIC_ENABLE_ANALYTICS=false`  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Chip visas korrekt; pin sparas; alias + undo fungerar  
**CLI/Kommandon:** `npm test -- tests/memory/subject_resolver.test.ts` (röktestens backend)  
**Status:** ✅ Klar (2025-11-07) – GhostChip v2 + pin/alias API aktiva

### 2.4 Memory UI - Utdragbar minnes-panel
**Leverabel:** Memory Dashboard-komponent  
**Filer/Platser:**  
- `components/memory/MemoryDashboard.tsx`  
- `app/api/memory/subject/[id]/route.ts`

**Nyckellogik:** Visa aktivt subject, aliases, senaste citat, 'Lägg till mål' CTA  
**Tester:** `tests/ui/memory_dashboard.test.tsx` (skelett för vidare UI-automation)  
**CI-Gate:** -  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Panel visar aktivt subject; CTA fungerar  
**CLI/Kommandon:** -  
**Status:** ✅ Klar (2025-11-07) – slide-over panel med alias-hantering & mål-CTA live mot API

### 2.5 Intent Hook - composeIntro + PromptWithFollowCards
**Leverabel:** Subject-integration i chatten  
**Filer/Platser:**  
- `lib/policy/intent_hook.ts`  
- `lib/memory/subject_context.ts`  
- `tests/style/test_chat_policy_subject_context.test.ts`

**Nyckellogik:** På varje reply: resolve subject; uppdatera last_seen; injicera context-tokens (`[[CTX:...]]`) med subject-info  
**Tester:** `tests/style/test_chat_policy_subject_context.test.ts` (paritet)  
**CI-Gate:** Style Gate fortfarande grön  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Subject följer med mellan turer; inga eko-brott; touch() körs per träff  
**CLI/Kommandon:** `npm test -- tests/style/test_chat_policy_subject_context.test.ts --runInBand`  
**Status:** ✅ Klar (2025-11-07) – intent hook injicerar [[CTX:…]] + återanvänder hint_subject_id

---

## Fas 3: Goals & Privacy

### 3.1 Goals Model - Relationsmål per subject
**Leverabel:** Goal model för relationsmål  
**Filer/Platser:** `lib/memory/subject_goals.ts`  
**Nyckellogik:** `goal_id`, `goal_text`, `valence=prosocial`, `constraints`, `progress(0-1)`, `created_by`  
**Tester:** `tests/memory/subject_goals.test.ts`  
**CI-Gate:** Etik-guard: blockera skada/manipulation  
**Env-Flaggor:** `ENABLE_AI_REPORTS=true`  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Skapa/uppd/arkivera mål; valence-check  
**CLI/Kommandon:** `npm test -- tests/memory/subject_goals.test.ts --runInBand`  
**Status:** ✅ Klar (2025-11-07) – mål-CRUD + progress/constraints/arkiv implementerad

### 3.2 Goal UI - Mål-widget i panel
**Leverabel:** GoalCard-komponent  
**Filer/Platser:** `components/memory/GoalCard.tsx`  
**Nyckellogik:** Skapa mål (mallar), progression, delmål, check-ins  
**Tester:** `tests/ui/goal_card.test.tsx`  
**CI-Gate:** -  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Mål kan skapas/uppdateras; UI stabilt  
**CLI/Kommandon:** `npx playwright test tests/ui/goal_card.test.tsx`  
**Status:** ✅ Klar (2025-11-07) – GoalList + GoalCard i MemoryDashboard; cadence/due/owner/blockers + coach-modal live

### 3.3 Goal Coach - Policy-coach för mål
**Leverabel:** Goal coaching-logik  
**Filer/Platser:** `lib/policy/goal_coach.ts`  
**Nyckellogik:** 
- Coachar endast prosociala mål
- Föreslår nästa mikro-steg
- Blockerar skadligt

**Tester:** `tests/style/goal_coach.test.ts`  
**CI-Gate:** Honesty Gate: kräver evidens innan råd  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Råd bara vid evidens; block vid tvekan  
**CLI/Kommandon:** `npm test -- tests/style/goal_coach.test.ts`  
**Status:** ✅ Klar (2025-11-07) – goalCoach med evidenskrav + Jest-test för block/OK

### 3.6 Admin KPI & Controls (live-metrics + job runner)
**Leverabel:** Live-adminpanel med polling + jobbkontroller  
**Filer/Platser:**  
- `app/api/admin/metrics/route.ts`  
- `lib/hooks/useAdminMetrics.ts`  
- `app/admin/page.tsx`  
- `components/admin/{DashboardPanels,WarningBanner}.tsx`  
- `app/admin/AdminControls.tsx`

**Nyckellogik:**  
- SWR-polling (20s default) för agg/threshold/status  
- Kontextvarningar (level warn/fail) + KPI-skeletons  
- Job runner med progress (deterministic/indeterminate), cancel (header, Esc, sekundärt i kortet), elapsed timer  
- Canary/Promote kontroller (enable/increase/disable/logrotate/promote)

**Tester:**  
- `npm test -- tests/memory/subject_goals.test.ts --runInBand`  
- `npm test -- tests/style/goal_coach.test.ts --runInBand`  
- (stub) `tests/api/admin_metrics.test.ts` – redo för mock

**CI-Gate:** Täcks av schema/style/honesty gates (norm-loggar)  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Dashboard uppdateras live; cancel fungerar (header + Esc + jobbkort); KPI-paneler visar goals/ctx/honesty/canary; API respekterar `?hours=`  
**CLI/Kommandon:** `npm run lint && npm test -- tests/memory/subject_goals.test.ts --runInBand && npm test -- tests/style/goal_coach.test.ts --runInBand`

### 3.4 Hearts (privat) - 'Känns som' 1-5 hjärtan (privat)
**Leverabel:** Privat känslomätare  
**Filer/Platser:** 
- `lib/memory/subject_feel.ts`
- `components/memory/PrivateFeel.tsx`

**Nyckellogik:** Privat slider 1-5; aldrig i export; väger likability_proxy  
**Tester:** `tests/ui/private_feel.test.tsx`  
**CI-Gate:** Gate: ej i PDF/Share  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Sätt/ändra hjärtan; ej läckage externt  
**CLI/Kommandon:** `npx playwright test tests/ui/private_feel.test.tsx`
**Status:** ✅ Klar (2025-11-07) – privat slider + repo/API; timestamp (“uppdaterad …”) visas i MemoryDashboard

### 3.5 Privacy Guard - Exportfilter & läckskydd
**Leverabel:** Privacy guard för export  
**Filer/Platser:** `lib/export/privacy_guard.ts`  
**Nyckellogik:** Strippar hearts, aliases-PII, debug-chips vid export  
**Tester:** `tests/export/privacy_guard.test.ts`  
**CI-Gate:** CI: export-snapshot utan privata fält  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** PDF/Share saknar privata fält  
**CLI/Kommandon:** `npm test -- tests/export/privacy_guard.test.ts --runInBand`  
**Status:** ✅ Klar (2025-11-07) – privacyGuard + assertNoForbiddenKeys aktiv i exportflödet

---

## Fas 4: Golden Cases & Gates

### 4.1 Golden H-cases - 8 honesty-fall i golden
**Leverabel:** Golden test cases för honesty  
**Filer/Platser:** `tests/golden/style/chat_cases.jsonl`  
**Nyckellogik:** H001-H008 enligt specifikationen  
**Tester:** `tests/style/test_chat_policy.test.ts`  
**CI-Gate:** Honesty Gate + Style Gate gröna  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Alla 8 passerar; malltext hittas  
**CLI/Kommandon:** `npm test -- tests/style/test_chat_policy.test.ts --runInBand`

### 4.2 Metrics Dash - Honesty KPI i admin
**Leverabel:** Admin dashboard med honesty KPI  
**Filer/Platser:**
- `app/admin/page.tsx`
- `components/admin/{MetricCard,WarningBanner,DashboardPanels}.tsx`
- `lib/metrics/{readNormJsonl,aggregateStyle}.ts`
- `reports/worldclass_live.norm.sample.jsonl`

**Nyckellogik:** Widgets: honesty.rate, repair_accept, no-advice; p95 tone/echo; parity-gap; canary breaches/backoff; varningsbanner (±10%)  
**Tester:** Manuell seedning via `reports/worldclass_live.norm.sample.jsonl` + pipeline-gates  
**CI-Gate:** Täcks av normalise → schema → style → honesty → red  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** KPI renderas server-side; varningsbanner triggas vid varningar; läser senaste norm-logg + canary-logg  
**CLI/Kommandon:**
- `node scripts/metrics/normalise_worldclass_live.mjs reports/worldclass_live.norm.sample.jsonl --out reports/worldclass_live.norm.jsonl --enforce-monotonic --dedupe-sec 900 --session-window-limit 50`
- `npm run schema:validate -- reports/worldclass_live.norm.jsonl`
- `python scripts/metrics/enforce_style_gate.py reports/worldclass_live.norm.jsonl --parity-p95-like-gap 0.02 --strict-lang-match`
- `python scripts/metrics/enforce_honesty_gate.py reports/worldclass_live.norm.jsonl --min-honesty-rate 0.10 --no-advice-when-honest 1 --min-repair-accept 0.50`
**Status:** ✅ Klar (2025-11-07)

### 4.3 Parity Gate - SV/EN likability-paritet
**Leverabel:** Språkparitets-gate  
**Filer/Platser:** `scripts/metrics/enforce_style_gate.py`  
**Nyckellogik:** `--parity-p95-like-gap 0.02`; `--strict-lang-match`  
**Tester:** `tests/metrics/enforce_style_gate.test.py`  
**CI-Gate:** CI: stoppa vid gap>0.02  
**Env-Flaggor:** `CANARY_PERCENT=5`  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Paritet OK på senaste batch  
**CLI/Kommandon:** `python scripts/metrics/enforce_style_gate.py reports/worldclass_live.norm.jsonl`
**Status:** ✅ Klar (2025-11-07)

### 4.4 RED Snapshot - RED-farewell snapshot-hash
**Leverabel:** RED-farewell snapshot-validering  
**Filer/Platser:** 
- `scripts/metrics/enforce_red_snapshot.py`
- `tests/golden/style/red_farewell_snap.json`

**Nyckellogik:** Stabil formulering; hash-kontroll  
**Tester:** `tests/metrics/enforce_red_snapshot.test.py`  
**CI-Gate:** CI stop vid diff  
**Env-Flaggor:** `CRISIS_RECO_ENABLED=false`  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Snapshot matchar exakt  
**CLI/Kommandon:** `python scripts/metrics/enforce_red_snapshot.py`
**Status:** ✅ Klar (2025-11-07)

### 4.5 Canary Nightly - Drift-larm workflow
**Leverabel:** Nightly drift-alarm workflow  
**Filer/Platser:** 
- `.github/workflows/canary_drift_nightly.yml`
- `scripts/metrics/canary_drift_alarm.py`

**Nyckellogik:** Auto-backoff vid 3 breaches/15min; logga why+prov  
**Tester:** `tests/metrics/canary_alarm.test.py`  
**CI-Gate:** Nightly 02:00 UTC  
**Env-Flaggor:** `SOFT_ROLLBACK=1`  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Alarm triggar korrekt; backoff loggas  
**CLI/Kommandon:** `pytest tests/metrics/canary_alarm.test.py -q`
**Status:** ✅ Klar (2025-11-07) – `.github/workflows/canary_drift_nightly.yml` aktiv, artefakt `reports/si/canary_drift_log.jsonl`

---

## Fas 5: UX & Repair

### 5.1 UX-Chip - 'Behöver mer underlag' chip
**Leverabel:** NeedMoreContextChip-komponent  
**Filer/Platser:** `components/memory/NeedMoreContextChip.tsx`  
**Nyckellogik:** Visas privat; öppnar snabbform (vem/när/citat)  
**Tester:** `tests/lib/need_more_ctx_util.test.ts`, `tests/api/cooldown_ping.test.ts`, `tests/api/cooldown_clear.test.ts`  
**CI-Gate:** -  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Chip visas bara vid honesty=true  
**CLI/Kommandon:**  
- `npm test -- tests/lib/need_more_ctx_util.test.ts --runInBand`  
- `npm test -- tests/api/cooldown_ping.test.ts --runInBand`  
- `npm test -- tests/api/cooldown_clear.test.ts --runInBand`  
**Status:** ✅ Klar (2025-11-07) – dubbel cooldown (sessionStorage + server TTL), auto-open + fokus, Cmd/Ctrl+Enter, funnel-logg (`shown/completed` + duration), retry×1 på save, optimistic close+rerun (`repair:saved`)

### 5.2 Fast-Repair - Snabbform → minnes-skriv
**Leverabel:** Quick repair-funktionalitet  
**Filer/Platser:**  
- `lib/memory/quick_repair.ts`  
- `app/api/memory/repair/save/route.ts`  
- `app/api/telemetry/honesty_repair/route.ts`
**Nyckellogik:** Sparar missing_facets till subject/context; reprompt  
**Tester:** `tests/memory/quick_repair.test.ts`  
**CI-Gate:** Honesty Gate: advice åter-tillåts efter repair  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Efter nytt faktum: advice OK  
**CLI/Kommandon:** `npm test -- tests/memory/quick_repair.test.ts --runInBand`  
**Status:** ✅ Klar (2025-11-07) – in-memory repo + REST-save, funnel telemetry (completion + duration), optimistic rerun-signal, TTL-reset (session + server) efter success

### 5.3 Docs - Mini-handbok för ärlighet
**Leverabel:** Dokumentation för honesty  
**Filer/Platser:** `docs/honesty_playbook.md`  
**Nyckellogik:** Ton, exempel, do/don't, edge-cases  
**Tester:** -  
**CI-Gate:** PR-check: länk från README  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Dokument finns & länkas i README  
**CLI/Kommandon:** -

### 5.4 Admin KPI - Repair funnel i dashboard
**Leverabel:** KPI-panel för honesty-repair  
**Filer/Platser:**  
- `lib/metrics/{readNormJsonl,aggregateStyle,thresholds,style_telemetry}.ts`  
- `app/api/admin/metrics/route.ts`  
- `components/admin/DashboardPanels.tsx`

**Nyckellogik:** prompt-rate, completion-rate, completion p50/p95 (minuter); thresholds för rate ≥0.50 och p95 ≤15m  
**Tester:** `npm test -- tests/lib/need_more_ctx_util.test.ts --runInBand` (helpers)  
**CI-Gate:** ingår i admin-metrics polling  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Panelen visar KPI (prompt/completion + tider); varnar vid low-rate eller lång completion  
**CLI/Kommandon:** `npm run lint && npm test -- tests/lib/need_more_ctx_util.test.ts --runInBand`
**Status:** ✅ Klar (2025-11-07) – adminpanelen visar repair prompt/completion-rate + p50/p95, varningsnivåer enligt trösklar, funnel-data från telemetri

---

## Fas 6: Performance & Kvalitet

### 6.1 Load-test - Telemetri-budget
**Leverabel:** Telemetry budget-check  
**Filer/Platser:** `scripts/metrics/telemetry_budget_check.ts`  
**Nyckellogik:** Varnar >10k events/dygn; föreslår sampling-höjning  
**Tester:** `tests/metrics/budget_check.test.ts`  
**CI-Gate:** CI warning-kommentar  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Varnar korrekt; inga hårda fails  
**CLI/Kommandon:** `node scripts/metrics/telemetry_budget_check.ts reports/worldclass_live.jsonl`

### 6.2 Perf - Resolver p95 < 8ms
**Leverabel:** Performance-optimerad resolver  
**Filer/Platser:**  
- `lib/memory/subject_resolver.ts`  
- `lib/memory/__perf__/fixtures.ts`  
- `tests/perf/resolver_bench.test.ts`

**Nyckellogik:** Alias-trie + phonex-index, bandad Levenshtein, zero-GC buffertar, LRU+TTL cache (context-aware)  
**Tester:** `npm test -- tests/perf/resolver_bench.test.ts --runInBand`  
**CI-Gate:** Bench p95 < 8ms lokalt  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Bench p95 < 8ms (warm 2k + measure 10k)  
**CLI/Kommandon:** `npm test -- tests/perf/resolver_bench.test.ts --runInBand`  
**Status:** ✅ Klar (2025-11-07) – normalisering, phonex, bandad fuzzy ≤2, kontext-LRU, p95 ≈ <4ms på 10k queries

### 6.3 Accessibility - Panel & chip A11Y
**Leverabel:** A11Y-kompatibla komponenter  
**Filer/Platser:** `components/memory/*`  
**Nyckellogik:** Fokusfällor, ARIA-labels, kontrast  
**Tester:** `tests/a11y/memory_a11y.test.ts`  
**CI-Gate:** -  
**Env-Flaggor:** -  
**Ägare:** Dev  
**ETA:** 0.5d  
**Acceptance Criteria:** Axe regler gröna  
**CLI/Kommandon:** `npx axe tests/a11y/memory_a11y.test.ts`

---

## Fas 7: Release

### 7.1 Release-flag - Prod-toggle
**Leverabel:** Production feature flags  
**Filer/Platser:** `.env(.production)`  
**Nyckellogik:** 
- `NEXT_PUBLIC_SHOW_INTERJECTION=false`
- `NEXT_PUBLIC_SHOW_THINK=false`
- `CANARY_PERCENT=5`

**Tester:** -  
**CI-Gate:** Release-checklista  
**Env-Flaggor:** -  
**Ägare:** Jimmy  
**ETA:** 0.5d  
**Acceptance Criteria:** Feature flags rätt i prod  
**CLI/Kommandon:** `vercel env pull && vercel deploy`

### 7.2 Go-Live - Samlad gate-körning
**Leverabel:** Full CI pipeline  
**Filer/Platser:** GH Actions  
**Nyckellogik:** Pipeline: normalise→schema→style→honesty→red→parity→nightly  
**Tester:** -  
**CI-Gate:** Alla gates gröna  
**Env-Flaggor:** -  
**Ägare:** Team  
**ETA:** 0.5d  
**Acceptance Criteria:** 0 breaches; dashboards uppdaterade  
**CLI/Kommandon:** `gh workflow run ci.yml`

---

## Totalt

**Total ETA:** ~8.5 dagar  
**Kritiska beroenden:** 
- Fas 0 måste vara klar innan Fas 1
- Fas 1 måste vara klar innan Fas 4 (gates)
- Fas 2 måste vara klar innan Fas 3 (goals)

**Milestones:**
- **M1 (Fas 0):** Grundläggande setup klar
- **M2 (Fas 1):** Honesty fungerar end-to-end
- **M3 (Fas 2):** Subject memory fungerar
- **M4 (Fas 4):** Alla gates gröna
- **M5 (Fas 7):** Production release

