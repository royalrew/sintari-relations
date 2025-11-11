# PR Checklist - Memory V2 Release

## Pre-PR Verification

- [ ] Smoke test passes: `python tests/memory/test_memory_smoke.py`
- [ ] CI gates pass: `pytest -q tests/worldclass/test_memory_suite.py`
- [ ] Config tagged: `configs/memory/v2/2025-11-06.json` committed
- [ ] Feature flag default: `MEMORY_V2=0` in `env.template`

## PR Requirements

### Code Changes
- [ ] `configs/memory/v2/<date>.json` committed with alpha/beta/gamma/delta, τ, k
- [ ] Feature flag integration: `lib/memory/memory_feature_flag.ts`
- [ ] Orchestrator integration: `lib/agents/agent_orchestrator.ts`
- [ ] Kill-switch: `MEMORY_V2=0` disables memory

### CI/CD
- [ ] CI gate: `tests/memory/eval_memory.py` green against thresholds
- [ ] Canary env vars: `MEMORY_V2_CANARY=10` (percent) documented
- [ ] Nightly workflow: `.github/workflows/memory_nightly.yml` active

### Documentation
- [ ] README: "Memory V2" section added (`README_MEMORY_V2.md`)
- [ ] Kill-switch documented
- [ ] Dashboard + alerts linked in PR description

### Testing
- [ ] Golden data: `tests/memory/golden/*.jsonl` populated
- [ ] Regression tests: `tests/memory/regression_core.jsonl` (6 cases)
- [ ] Red-team tests: `tests/memory/redteam/pii_leak_check.jsonl`

## Post-PR Monitoring (First Week)

### Metrics to Watch
- [ ] Latency spikes on large threads → adjust per-thread cap or lower k
- [ ] Facet bias (overweight on wrong facet) → lower δ → retune
- [ ] Cost drift from embeddings → batch + cache queries

### Alerts Configured
- [ ] p95 > 200ms for 10min → page
- [ ] fail_rate > 2% → page
- [ ] pii_masked_ratio < 1.0 → page

## Rollback Plan

If issues occur:
1. Set `MEMORY_V2=0` in production env
2. Memory V1 code path remains available
3. No data migration needed (V2 is additive)

## Acceptance Criteria

- [ ] All CI gates pass
- [ ] Canary rollout tested (10% traffic)
- [ ] Dashboard shows metrics
- [ ] Alerts configured
- [ ] Documentation complete

