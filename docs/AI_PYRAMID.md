# AI Pyramid Routing - Operational Guide

**Version:** 2025-01-30-pyramid-pass  
**Status:** LOCKED - Requires HITL (Human-In-The-Loop) approval for changes

## Overview

The pyramid routing system distributes cases across four tiers to optimize cost and performance:

- **FastPath** (22-25%): Trivial cases (greetings, acknowledgements, short confirmations)
- **Base** (72-78%): Simple, high-confidence cases → cheapest model
- **Mid** (12-15%): Medium complexity → mid-tier model
- **Top** (4-6%): Complex cases → premium model

## Configuration Variables

### Environment Variables (ROUTER.env.example)

All routing parameters are controlled via environment variables. **Do not modify without HITL approval.**

#### Base/Mid Thresholds

```bash
ROUTER_BASE_THR=0.83   # Confidence threshold for Base tier (higher = more Base)
ROUTER_MID_THR=0.70    # Confidence threshold for Mid tier
```

**Effect:** Controls Base ↔ Mid distribution. Higher `ROUTER_BASE_THR` pushes more cases from Mid to Base.

#### Top-Tier Epsilon Promotion

```bash
ROUTER_EPS_TOP=0.012   # Epsilon probability for Top promotion (1.2%)
```

**Effect:** Promotes complex cases (`is_complex=true`, `text_len >= 220`) to Top tier with this probability. Only applies to eligible complex cases.

**When to adjust:**
- Top < 4%: Increase `ROUTER_EPS_TOP` (e.g., 0.015)
- Top > 6%: Decrease `ROUTER_EPS_TOP` (e.g., 0.010)

#### Top-Tier Minimum Quota

```bash
ROUTER_TOP_BLOCK=100   # Block size for quota calculation
ROUTER_TOP_MIN=0.01    # Minimum Top % per block (1%)
```

**Effect:** Guarantees at least `ROUTER_TOP_MIN%` of cases are forced to Top tier every `ROUTER_TOP_BLOCK` cases, ensuring coverage even in small batches.

#### FastPath Limits

```bash
FASTPATH_MAX_LEN=130      # Maximum text length (characters)
FASTPATH_MAX_TOKENS=28    # Maximum token count
```

**Effect:** Controls how generous FastPath matching is. Longer limits = more FastPath hits.

**When to adjust:**
- FastPath < 22%: Increase limits (e.g., `LEN=140`, `TOKENS=30`)
- FastPath > 30%: Decrease limits (e.g., `LEN=120`, `TOKENS=26`)

#### Batch Processing

```bash
BATCH_CONCURRENCY=1       # Number of parallel cases
PYTHONUNBUFFERED=1        # Python unbuffered output (required)
PYTHONIOENCODING=utf-8    # Encoding for Python I/O
```

## Configuration Files

### `config/model_routing.json`

Frozen configuration file with current thresholds and distribution targets:

```json
{
  "tiers": {
    "base": { "confidence_min": 0.0, "confidence_max": 0.83 },
    "mid": { "confidence_min": 0.70, "confidence_max": 0.83 },
    "top": { "confidence_min": 0.0, "confidence_max": 0.70 }
  },
  "distribution_target": {
    "fastpath": 0.22,
    "base": 0.75,
    "mid": 0.14,
    "top": 0.05
  },
  "exploration": {
    "epsilon_top": 0.012
  },
  "version": "2025-01-30-pyramid-pass",
  "locked": true
}
```

**Status:** LOCKED. Do not modify without approval.

## Change Process (HITL Required)

1. **Identify target deviation:** Check CI reports or run `pyramid_report.py`
2. **Propose change:** Document expected impact on distribution
3. **Get approval:** Human reviewer must approve
4. **Test locally:** Run `batch_run_sample.mjs --n=500 --mix=live`
5. **Update frozen config:** Only after CI passes and approval
6. **Document:** Update this guide with rationale

## Monitoring

### CI Checks

The CI pipeline enforces strict targets:

- FastPath: [22, 25]%
- Base: [72, 78]%
- Mid: [12, 18]% (allows slight variation)
- Top: [4, 6]%

If any tier is outside these bounds, CI **fails**.

### Reports

- `reports/pyramid_live.jsonl`: Raw shadow-logging data
- `reports/pyramid_live.md`: Human-readable report

## Current Baseline

**Locked:** 2025-01-30-pyramid-pass

- FastPath: 24.7%
- Base: 78.1%
- Mid: 17.2%
- Top: 4.7%

All targets: ✅ PASS

