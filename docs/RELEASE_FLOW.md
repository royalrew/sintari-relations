## Chat Style Canary

Promote canary 5% → 10% → 25% först när de senaste 200 sessionerna uppfyller:

- STYLE_GATE = 0 fel
- empathy_score p95 ≥ 0.95
- likability_proxy p95 ≥ 0.85
- question_count == 1 (100%)
- echo_ratio == 0 (100%)
- Ingen regression i RED-träffar eller p95-latens

Rollback vid första STYLE_GATE-fail i produktion.
