# Memory V2 - Fas 5B

## Översikt

Memory V2 ger kontextuell minneshantering för multi-turn konversationer med hybrid retrieval (episodic + semantic + recency).

## Feature Flags

### Aktivera Memory V2

```bash
# Explicit enable
export MEMORY_V2=1

# Canary rollout (10% av trafik)
export MEMORY_V2=0
export MEMORY_V2_CANARY=10
```

### Kill-Switch

```bash
# Hard disable (alltid av)
export MEMORY_V2=0
```

## Konfiguration

Baseline config: `configs/memory/v2/2025-11-06.json`

- **Weights**: α=0.35 (BM25), β=0.40 (dense), γ=0.15 (recency), δ=0.10 (facet)
- **Tau**: 14 dagar (recency half-life)
- **K**: 5 (top-k retrieval)
- **TTL**: 90 dagar
- **LRU cap**: 500 items per thread

## CI Gates

Memory CI gates körs automatiskt på PR:

- Hit@3 ≥ 0.70
- MRR ≥ 0.65
- P95 latency < 150ms
- Fail rate < 1%
- Dup rate < 5%

## SLO

- **Latency**: p95 retrieve < 150ms
- **Reliability**: fail_rate < 1%
- **Quality**: dup_rate < 5%
- **Privacy**: 0 PII-leaks (pii_masked_ratio = 1.0)

## Rollback

Memory V1 kodväg finns kvar. För att rollbacka:

```bash
export MEMORY_V2=0
```

## Monitoring

- Dashboard: Memory hit@k, MRR, nDCG, p95, fail_rate
- Evictions: ttl_evicted, lru_evicted, items_after_cleanup
- Alerts: p95 > 200ms (10min), fail_rate > 2%, pii_masked_ratio < 1.0

## Testing

```bash
# Smoke test
python tests/memory/test_memory_smoke.py

# Full eval
python tests/memory/eval_memory.py \
  --golden "tests/memory/golden/*.jsonl" \
  --config configs/memory/v2/2025-11-06.json

# Ablation study
python scripts/memory_ablation.py --golden "tests/memory/golden/*.jsonl"
```

## Nightly Calibration

Körs automatiskt 02:15 CET via `.github/workflows/memory_nightly.yml`

- Cleanup (TTL + LRU)
- Tuning (grid search)
- Evaluation
- CI gates

## Risklogg

**Bevaka första veckan:**

1. **Latensspikar** vid stora trådar → höj per-thread cap eller sänk k
2. **Facet-bias** (övervikt på fel facet) → sänk δ → retunea
3. **Kostnadsdrift** från embeddings → batcha + cachea queries

