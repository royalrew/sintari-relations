import json
from pathlib import Path


def test_worldclass_live_json_integrity():
    p = Path("reports/worldclass_live.json")
    assert p.exists(), "worldclass_live.json saknas – kör backend/metrics/worldclass_live.py"
    
    data = json.loads(p.read_text(encoding="utf-8"))
    
    for k in ["empathy_f1", "tone_drift", "recall_rate", "si_loop_status", "likability", "retention_7d"]:
        assert k in data, f"Saknar KPI {k}"
    
    # Strict thresholds (Emotion Core DoD)
    assert data["empathy_f1"] >= 0.92, f"Empathy F1 under 0.92: {data['empathy_f1']}"
    assert data["tone_drift"] < 0.05, f"Tone drift för hög: {data['tone_drift']}"
    assert data["recall_rate"] >= 0.90, f"Recall under 0.90: {data['recall_rate']}"
    
    # SV/EN parity check (if available)
    if "sv_en_gap" in data:
        assert data["sv_en_gap"] < 0.01, f"SV/EN gap för stor: {data['sv_en_gap']}"

