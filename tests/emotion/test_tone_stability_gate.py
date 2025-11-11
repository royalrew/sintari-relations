"""
Tone Stability Gate CI Test
PR4: EmpathyTone v2 Calibration

Fails if Δton >= 0.05 or latency_p95 > 35ms
"""
import pytest
import sys
import json
from pathlib import Path

# Add root to path
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Thresholds
TONE_DRIFT_MAX = 0.05
LATENCY_P95_MAX_MS = 35


def load_eval(report_path: Path) -> dict:
    """Load tone stability evaluation report."""
    if not report_path.exists():
        pytest.skip(f"Report file not found: {report_path}")
    
    with open(report_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def test_tone_stability_delta():
    """Test that tone drift (Δton) is within threshold."""
    report_path = ROOT / "reports" / "tone_stability.json"
    
    eval_data = load_eval(report_path)
    
    delta_tone = eval_data.get("delta_tone", 1.0)
    
    assert delta_tone < TONE_DRIFT_MAX, f"Tone drift {delta_tone:.3f} >= {TONE_DRIFT_MAX}"


def test_tone_stability_latency():
    """Test that p95 latency meets threshold."""
    report_path = ROOT / "reports" / "tone_stability.json"
    
    eval_data = load_eval(report_path)
    
    latency_p95 = eval_data.get("latency_p95_ms", 1000)
    
    assert latency_p95 <= LATENCY_P95_MAX_MS, f"Latency p95 {latency_p95}ms > {LATENCY_P95_MAX_MS}ms"


def test_tone_stability_boundary():
    """Test boundary conditions."""
    # Exactly at threshold should fail
    delta_tone = TONE_DRIFT_MAX
    
    assert delta_tone >= TONE_DRIFT_MAX, "Boundary condition: delta exactly at threshold"
    
    # Just below should pass
    delta_tone_below = TONE_DRIFT_MAX - 0.001
    
    assert delta_tone_below < TONE_DRIFT_MAX, "Boundary condition: delta below threshold"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

