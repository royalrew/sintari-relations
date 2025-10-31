# Release Criteria — Relations AI

This document defines the formal "GO/NO-GO" gates before any production release.

## ✅ Functional

- [ ] **Golden total ≥ 0.95**
  - All golden test suites pass with minimum 95% accuracy
  - Verified via `pytest tests/golden/`

- [ ] **Pyramid Distribution:**
  - FastPath: 22–25%
  - Base: 72–78.5%
  - Mid: 12–18%
  - Top: 4–6%
  - Verified via `enforce_pyramid_targets.py`

- [ ] **Routing accuracy ≥ 90%**
  - Correct tier assignment for test cases
  - Verified via `test_routing_accuracy`

## 💰 Cost

- [ ] **p95 cost −30% vs pre-routing baseline**
  - Measured via `pyramid_live.jsonl`
  - Tracked in `kpi_dashboard.md`

- [ ] **0 budget-övertramp i 7 dagar**
  - No CostGuard blocks in last 7 days
  - Verified via `cost_guard_blocks.jsonl`

## 🛡️ Safety

- [ ] **RedTeam pass rate ≥ 99% (no critical)**
  - All critical vulnerabilities blocked
  - Verified via `test_redteam_ci.py`

- [ ] **Prompt Shield coverage ≥ 80% (no bypass in CI)**
  - Injection/jailbreak detection active
  - Verified via `test_security_suite.py`

- [ ] **Drift p_value ≥ 0.01 (senaste dygnet)**
  - No significant distribution drift
  - Verified via `cron_drift_check.py`

## 🔧 Ops

- [ ] **Scorecard genererat för senaste körning**
  - `reports/scorecards/last.html` exists
  - Verified in CI after batch-run

- [ ] **KPI dashboard uppdaterad senaste 24h**
  - `reports/kpi_dashboard.md` updated
  - Verified via timestamp

- [ ] **Golden VERSION uppdaterad vid golden-ändringar**
  - `tests/golden/VERSION` matches latest changes
  - Enforced in CI (golden freeze check)

## 📋 Release Checklist

Before tagging a release:

1. ✅ Run full test suite: `pytest tests/`
2. ✅ Verify pyramid distribution: `python scripts/metrics/enforce_pyramid_targets.py reports/pyramid_live.jsonl`
3. ✅ Check KPI dashboard: `python scripts/gen_kpi_dashboard.py`
4. ✅ Verify release criteria: `python scripts/metrics/enforce_release_criteria.py`
5. ✅ Update CHANGELOG.md with release notes
6. ✅ Tag release: `git tag v0.X.Y-release-criteria-pass`
7. ✅ Push tags: `git push --tags`

## 🚨 Critical Blockers

These criteria **must** pass for any release:

- Golden total < 0.95 → **BLOCK**
- RedTeam critical failures → **BLOCK**
- Budget exceeded in last 7d → **BLOCK**
- Prompt Shield bypass → **BLOCK**
- Drift p_value < 0.01 → **REVIEW** (may block depending on severity)

## 📊 Current Status

See `reports/kpi_dashboard.md` for current metrics.

Last verified: _[Updated by CI]_

