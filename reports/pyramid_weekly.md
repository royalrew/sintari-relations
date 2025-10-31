# Pyramid Dashboard — Weekly Report

**Last Updated:** 2025-10-31  
**Source:** reports/pyramid_live.jsonl  
**Version:** 2025-01-30-pyramid-pass

## 📊 Historical Distribution

| Datum | FastPath | Base | Mid | Top | Kostnad p95 | Status |
|-------|----------|------|-----|-----|-------------|--------|
| 2025-10-31 | 24.7% | 78.1% | 17.2% | 4.7% | $0.0100 | ✅ PASS |

## 🎯 Current Status

**Date:** 2025-10-31
- **FastPath:** 24.7% (target: 22-25%) ✅
- **Base:** 78.1% (target: 72-78.5%) ✅
- **Mid:** 17.2% (target: 12-18%) ✅
- **Top:** 4.7% (target: 4-6%) ✅
- **p95 Cost:** $0.0100
- **Overall Status:** ✅ PASS

## 📈 Targets

- **FastPath:** 22-25% (trivial cases)
- **Base:** 72-78.5% (simple, high-confidence, allows slight over)
- **Mid:** 12-18% (medium complexity, allows slight variation)
- **Top:** 4-6% (complex cases)
- **Cost Reduction:** p95 cost should decrease by ~30% vs pre-routing baseline

## 🔄 Maintenance

This dashboard is automatically updated after each batch run.
For manual updates, run:
```bash
python scripts/gen_pyramid_dashboard.py reports/pyramid_live.jsonl
```
