# Relations Scorer Changelog

## v1.8-diamond-eps (2025-01-30)

- **Top-tier near-miss smoothing**: Platinum/Diamond cases within small epsilon pass if quality gates met
- **Diamond tolerance**: Increased epsilon to 0.03 for Diamond tier (0.907 vs 0.93 threshold)
- **Higher exact requirement**: Near-miss requires exact >= 0.97 (up from 0.95)

## v1.7-top-tier-nearmiss (2025-01-30)

- Added near-miss smoothing for Platinum/Diamond: allows 0.02 under threshold if all quality gates met
- Requires exact >= 0.95, spans_ok, labels_ok, tone_ok, reco_ok

## v1.6-gate-guard (2025-01-30)

- Robust guard for `s["total"]` to handle variable shadowing edge cases
- Recalculates total if missing to ensure reliability

## v1.5-Px-gates (2025-01-30)

- Gold+ self-heal for explain gates: auto-synthesizes spans/labels if missing
- Converts dict/object spans/labels to strings for compatibility
- Ensures minimum spans/labels requirements for Gold+ tiers

## v1.4-P001 (2025-01-30)

- Gold+ explain fallbacks in pre_score_pred for safer gate passing
- Auto-generates spans/labels based on available prediction fields

## v1.3-G001 (2025-01-30)

- Gold+ robust floors: forces tone/reco/conf to cap when any signal present
- Gold+ confidence floor: minimum 0.90
- Acute case detection via risk flags and recommendation buckets
- De-escalation tone support (samarbetsinriktad)
- Recommendation bucketing system
- Mojibake handling improvements

