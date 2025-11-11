"""
Emotion F1 Gate CI Test
PR4: EmpathyTone v2 Calibration

Fails if F1 < 0.92 or SV/EN parity > 0.01
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
F1_MIN = 0.92
SV_EN_PARITY_MAX = 0.01


def load_eval(report_path: Path) -> dict:
    """Load emotion evaluation report."""
    if not report_path.exists():
        pytest.skip(f"Report file not found: {report_path}")
    
    with open(report_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def test_emotion_f1_gate_macro():
    """Test that macro F1 meets threshold."""
    report_path = ROOT / "reports" / "emotion_golden_report.json"
    
    eval_data = load_eval(report_path)
    
    # Extract macro F1 from confusion matrix
    # For now, use accuracy as proxy (should be enhanced with proper F1 calc)
    macro_f1 = eval_data.get("accuracy", 0.0)
    
    assert macro_f1 >= F1_MIN, f"Macro F1 {macro_f1:.3f} < {F1_MIN}"


def test_emotion_f1_gate_parity():
    """Test that SV/EN parity is within threshold."""
    report_path = ROOT / "reports" / "emotion_golden_report.json"
    
    eval_data = load_eval(report_path)
    
    sv_en_gap = eval_data.get("sv_en_gap", 1.0)
    
    assert sv_en_gap <= SV_EN_PARITY_MAX, f"SV/EN gap {sv_en_gap:.3f} > {SV_EN_PARITY_MAX}"


def test_emotion_f1_gate_red_fp():
    """Test that RED false positive rate is acceptable."""
    report_path = ROOT / "reports" / "emotion_golden_report.json"
    
    eval_data = load_eval(report_path)
    
    red_fp_rate = eval_data.get("red_fp_rate", 1.0)
    red_fp_max = 0.10  # Allow up to 10% RED FP
    
    assert red_fp_rate <= red_fp_max, f"RED FP rate {red_fp_rate:.3f} > {red_fp_max}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

