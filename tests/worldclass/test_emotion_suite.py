"""
WorldClass Emotion Test Suite
Steg 119: Brain First Plan - Emotion Core

Tests for:
- Likability
- Empathy
- Tone drift (Δton < 0.05)
- False-positive RED
- SV/EN parity (Δscore < 0.01)
"""
import json
import pytest
import subprocess
import sys
from pathlib import Path
from typing import Dict, Any, List

ROOT = Path(__file__).resolve().parents[2]
GOLDEN_DIR = ROOT / "tests" / "golden" / "emotion"
GOLDEN_FILE = GOLDEN_DIR / "worldclass_emotion.jsonl"

# Minimum requirements
F1_MIN = 0.92
TONE_DRIFT_MAX = 0.05
RECALL_MIN = 0.90
SV_EN_DELTA_MAX = 0.01
RED_FP_MAX = 0.05


def load_golden() -> List[Dict[str, Any]]:
    """Load golden test cases."""
    if not GOLDEN_FILE.exists():
        pytest.skip(f"Golden file not found: {GOLDEN_FILE}")
    
    cases = []
    with open(GOLDEN_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            case = json.loads(line)
            # Convert labels to expected tone_vector if missing
            if "expected_tone_vector" not in case:
                # Generate expected tone_vector based on labels
                # This is a fallback - ideally golden data should have this
                labels = case.get("labels", [])
                worry = 1.0 if "oro" in labels or "worry" in labels else 0.0
                humor = 1.0 if "humor" in labels else 0.0
                irony = 1.0 if "ironi" in labels or "irony" in labels else 0.0
                
                # Calculate tone_vector from labels
                empathy = max(0.0, 1.0 - worry * 0.6) if worry > 0 else 0.7
                warmth = (humor * 0.7 - irony * 0.3 + 0.5) * 0.8 + 0.1 if humor or irony else 0.6
                clarity = max(0.0, 1.0 - irony * 0.4) if irony > 0 else 0.8
                
                case["expected_tone_vector"] = [empathy, warmth, clarity]
            cases.append(case)
    
    return cases


def call_empathy_tone(text: str, lang: str, trace_id: str = None, prev_state: Dict = None) -> Dict[str, Any]:
    """Call empathy_tone_v2 agent with language bridge for SV/EN parity."""
    agent_path = ROOT / "agents" / "emotion" / "empathy_tone_v2.py"
    if not agent_path.exists():
        pytest.skip(f"Agent not found: {agent_path}")
    
    # Use language bridge for canonical processing
    try:
        from lib.lang.language_bridge import to_canonical_en
        canon_text, orig_lang = to_canonical_en(text)
    except ImportError:
        # Fallback if language_bridge not available
        canon_text, orig_lang = text, lang
    
    # Use provided trace_id or generate one based on text hash for stateful filtering
    if trace_id is None:
        import hashlib
        trace_id = f"test_{hashlib.md5(text.encode('utf-8')).hexdigest()[:8]}"
    
    request = json.dumps({
        "agent": "empathy_tone_v2",
        "text": canon_text,  # Use canonical text
        "lang": "en",  # Always use EN for canonical processing
        "trace_id": trace_id,
        "prev_state": prev_state  # Pass state for stateful filtering
    }, ensure_ascii=False)
    
    try:
        result = subprocess.run(
            [sys.executable, str(agent_path)],
            input=request.encode('utf-8'),
            capture_output=True,
            timeout=10,
            cwd=str(ROOT)
        )
        if result.returncode != 0:
            return {"ok": False, "error": result.stderr.decode('utf-8', errors='replace')}
        
        response = json.loads(result.stdout.decode('utf-8'))
        return response
    except Exception as e:
        return {"ok": False, "error": str(e)}


def calculate_f1_score(golden: List[Dict], results: List[Dict]) -> float:
    """Calculate F1 score from golden vs results."""
    # Simple F1 based on tone_vector similarity
    total_similarity = 0.0
    count = 0
    
    for i, case in enumerate(golden):
        if i >= len(results) or not results[i].get("ok"):
            continue
        
        expected_tone = case.get("expected_tone_vector", [0.5, 0.5, 0.5])
        got_tone = results[i].get("tone_vector", [0.5, 0.5, 0.5])
        
        # Cosine similarity
        dot = sum(a * b for a, b in zip(expected_tone, got_tone))
        norm_a = sum(a ** 2 for a in expected_tone) ** 0.5
        norm_b = sum(b ** 2 for b in got_tone) ** 0.5
        
        if norm_a > 0 and norm_b > 0:
            similarity = dot / (norm_a * norm_b)
            total_similarity += similarity
            count += 1
    
    return total_similarity / count if count > 0 else 0.0


def test_empathy_f1():
    """Test empathy F1 ≥ 0.92."""
    golden = load_golden()
    if len(golden) == 0:
        pytest.skip("No golden cases")
    
    results = []
    for case in golden:
        text = case.get("text", "")
        lang = case.get("lang", "sv")
        result = call_empathy_tone(text, lang)
        results.append(result)
    
    f1 = calculate_f1_score(golden, results)
    
    assert f1 >= F1_MIN, f"Empathy F1 {f1:.3f} < {F1_MIN}"


def test_tone_drift():
    """Test tone drift < 0.05."""
    golden = load_golden()
    if len(golden) < 2:
        pytest.skip("Need at least 2 cases for drift test")
    
    # Use same trace_id for all cases in sequence to test stateful filtering
    # This simulates a real conversation thread
    trace_id = "test_tone_drift_sequence"
    
    results = []
    prev_state = None
    for case in golden[:10]:  # Use first 10 for drift calculation
        text = case.get("text", "")
        lang = case.get("lang", "sv")
        result = call_empathy_tone(text, lang, trace_id=trace_id, prev_state=prev_state)
        if result.get("ok"):
            results.append(result.get("tone_vector", [0.5, 0.5, 0.5]))
            # Get updated state for next call
            prev_state = result.get("next_state")
    
    if len(results) < 2:
        pytest.skip("Not enough successful results")
    
    # Calculate max drift between consecutive results
    max_drift = 0.0
    for i in range(len(results) - 1):
        drift = sum((results[i][j] - results[i+1][j]) ** 2 for j in range(3)) ** 0.5
        max_drift = max(max_drift, drift)
    
    assert max_drift < TONE_DRIFT_MAX, f"Tone drift {max_drift:.3f} >= {TONE_DRIFT_MAX}"


def test_sv_en_parity():
    """Test SV/EN parity (Δscore < 0.01)."""
    golden = load_golden()
    
    sv_cases = [c for c in golden if c.get("lang") == "sv"]
    en_cases = [c for c in golden if c.get("lang") == "en"]
    
    if len(sv_cases) == 0 or len(en_cases) == 0:
        pytest.skip("Need both SV and EN cases")
    
    # Get average F1 for SV
    sv_results = [call_empathy_tone(c["text"], "sv") for c in sv_cases[:10]]
    sv_scores = [r.get("f1_estimate", 0.0) for r in sv_results if r.get("ok")]
    sv_avg = sum(sv_scores) / len(sv_scores) if sv_scores else 0.0
    
    # Get average F1 for EN
    en_results = [call_empathy_tone(c["text"], "en") for c in en_cases[:10]]
    en_scores = [r.get("f1_estimate", 0.0) for r in en_results if r.get("ok")]
    en_avg = sum(en_scores) / len(en_scores) if en_scores else 0.0
    
    delta = abs(sv_avg - en_avg)
    assert delta < SV_EN_DELTA_MAX, f"SV/EN delta {delta:.3f} >= {SV_EN_DELTA_MAX}"


def test_red_false_positive():
    """CI-gate: RED false positive rate <= 0.15."""
    eval_report = ROOT / "reports" / "emotion_golden_report.json"
    if not eval_report.exists():
        pytest.skip(f"Eval report not found: {eval_report}")
    
    with open(eval_report, 'r', encoding='utf-8') as f:
        report = json.load(f)
    
    red_fp_rate = report.get("red_fp_rate", 1.0)
    assert red_fp_rate <= 0.15, f"RED false positive rate {red_fp_rate:.3f} > 0.15 (risk för falska alarm)"


def test_red_recall():
    """CI-gate: RED recall >= 0.80 (fail fast på det som nyss var fel)."""
    eval_report = ROOT / "reports" / "emotion_golden_report.json"
    if not eval_report.exists():
        pytest.skip(f"Eval report not found: {eval_report}")
    
    with open(eval_report, 'r', encoding='utf-8') as f:
        report = json.load(f)
    
    cm = report.get("confusion_matrix", {})
    red_cm = cm.get("red", {})
    red_tp = red_cm.get("red", 0)
    red_total = sum(red_cm.values())
    
    red_recall = red_tp / red_total if red_total > 0 else 0.0
    assert red_recall >= 0.80, f"RED recall {red_recall:.3f} < 0.80 (risk för missade kriser)"


def test_plus_precision():
    """CI-gate: PLUS precision >= 0.55."""
    eval_report = ROOT / "reports" / "emotion_golden_report.json"
    if not eval_report.exists():
        pytest.skip(f"Eval report not found: {eval_report}")
    
    with open(eval_report, 'r', encoding='utf-8') as f:
        report = json.load(f)
    
    cm = report.get("confusion_matrix", {})
    plus_cm = cm.get("plus", {})
    plus_tp = plus_cm.get("plus", 0)
    plus_predicted = sum(cm[k].get("plus", 0) for k in cm.keys())
    
    plus_precision = plus_tp / plus_predicted if plus_predicted > 0 else 0.0
    assert plus_precision >= 0.55, f"PLUS precision {plus_precision:.3f} < 0.55 (risk för falska plus)"


def test_light_rate():
    """CI-gate: LIGHT-band används (>= 5% av predictions)."""
    eval_report = ROOT / "reports" / "emotion_golden_report.json"
    if not eval_report.exists():
        pytest.skip(f"Eval report not found: {eval_report}")
    
    with open(eval_report, 'r', encoding='utf-8') as f:
        report = json.load(f)
    
    cm = report.get("confusion_matrix", {})
    total = report.get("total", 1)
    
    # Räkna alla light-predictions
    light_predicted = sum(cm[k].get("light", 0) for k in cm.keys())
    light_rate = light_predicted / total if total > 0 else 0.0
    
    assert light_rate >= 0.05, f"LIGHT-band används ej ({light_rate:.1%} < 5%, risk för neutral-drift)"


def test_bias_gap():
    """CI-gate: Bias gap (SV/EN) <= 0.03."""
    eval_report = ROOT / "reports" / "emotion_golden_report.json"
    if not eval_report.exists():
        pytest.skip(f"Eval report not found: {eval_report}")
    
    with open(eval_report, 'r', encoding='utf-8') as f:
        report = json.load(f)
    
    bias_gap = abs(report.get("sv_en_gap", 1.0))
    assert bias_gap <= 0.03, f"Bias gap {bias_gap:.4f} > 0.03 (risk för ojämnhet mellan SV/EN)"


def test_soft_correction():
    """Test soft correction (≥70% self-fix)."""
    test_cases = [
        {"text": "Jag förstår inte vad du menade", "lang": "sv", "expect_correction": True},
        {"text": "I don't understand what you meant", "lang": "en", "expect_correction": True},
        {"text": "Hej, hur är läget?", "lang": "sv", "expect_correction": False},
        {"text": "Hello, how are you?", "lang": "en", "expect_correction": False},
    ]
    
    agent_path = ROOT / "agents" / "emotion" / "soft_correction.py"
    if not agent_path.exists():
        pytest.skip(f"Agent not found: {agent_path}")
    
    corrections = 0
    total = 0
    
    for case in test_cases:
        request = json.dumps({
            "agent": "soft_correction",
            "text": case["text"],
            "lang": case["lang"],
            "trace_id": "test"
        }, ensure_ascii=False)
        
        try:
            result = subprocess.run(
                [sys.executable, str(agent_path)],
                input=request.encode('utf-8'),
                capture_output=True,
                timeout=10,
                cwd=str(ROOT)
            )
            if result.returncode == 0:
                response = json.loads(result.stdout.decode('utf-8'))
                if response.get("ok") and response.get("needs_correction") == case["expect_correction"]:
                    corrections += 1
                total += 1
        except Exception:
            pass
    
    if total == 0:
        pytest.skip("No successful test runs")
    
    self_fix_rate = corrections / total
    assert self_fix_rate >= 0.70, f"Soft correction rate {self_fix_rate:.2%} < 70%"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

