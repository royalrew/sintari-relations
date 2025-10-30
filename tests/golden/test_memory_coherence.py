#!/usr/bin/env python3
"""Health test for memory_score coherence and scale consistency."""
import sys
import pathlib
import importlib.util
from statistics import mean

# Load helper modules
def _load(name, rel_path):
    root = pathlib.Path(__file__).resolve().parents[2]
    p = root / rel_path
    spec = importlib.util.spec_from_file_location(name, str(p))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)  # type: ignore
    return m

_bridge = _load("orchestrator_bridge", "tests/_helpers/orchestrator_bridge.py")
orchestrator_analyze = _bridge.orchestrator_analyze


def test_memory_coherence_min_avg():
    """Test that memory scores are coherent and reasonably high for memory-rich dialogs."""
    dialog = [
        {"speaker": "P1", "text": "Check-in varje kväll."},
        {"speaker": "P2", "text": "Okej."},
        {"speaker": "P1", "text": "Paus om det blir hett."},
        {"speaker": "P2", "text": "Bra plan."},
        {"speaker": "P1", "text": "Byter kanal till IRL vid eskalering."}
    ]
    text = " ".join(m.get("text", "") for m in dialog)
    
    ms = [orchestrator_analyze(text=text, dialog=dialog, lang="sv").get("memory_score", 0.0) for _ in range(3)]
    avg = mean(ms)
    
    # Should detect multiple signals
    assert avg >= 0.6, f"Suspiciously low memory avg ({avg:.2f}) for rich dialog — scale/drift issue?"
    print(f"[OK] Memory coherence: avg={avg:.2f} (expected >=0.6)")


def test_memory_scale_range():
    """Test that memory_score is always in [0,1] for dialogs."""
    # Note: Empty dialog falls through to text-only path without memory_score
    test_dialogs = [
        [{"speaker": "P1", "text": "Hej"}],  # No signals
        [{"speaker": "P1", "text": "Check-in"}, {"speaker": "P2", "text": "Paus"}],  # Some signals
    ]
    
    for dialog in test_dialogs:
        text = " ".join(m.get("text", "") for m in dialog)
        result = orchestrator_analyze(text=text, dialog=dialog, lang="sv")
        mem = result.get("memory_score", None)
        assert mem is not None, "memory_score missing from result"
        assert isinstance(mem, (int, float)), f"memory_score wrong type: {type(mem)}"
        assert 0.0 <= mem <= 1.0, f"memory_score out of range: {mem:.2f}"
    
    print("[OK] All memory scores in [0,1] range")


def test_memory_diamond_cases():
    """Test that diamond cases have appropriate memory scores."""
    high_signal_dialog = [
        {"speaker": "P1", "text": "Check-in kvällstid."},
        {"speaker": "P2", "text": "Regel för paus vid stress."},
        {"speaker": "P1", "text": "Byta kanal till IRL om hetta."},
        {"speaker": "P2", "text": "Spegla först."},
        {"speaker": "P1", "text": "Missförstådd-känsla."}
    ]
    text = " ".join(m.get("text", "") for m in high_signal_dialog)
    
    result = orchestrator_analyze(text=text, dialog=high_signal_dialog, lang="sv")
    signals = result.get("signals", {})
    sig_count = sum(bool(signals.get(k)) for k in ("checkin", "pause", "switch_channel", "boundary", "empathy"))
    mem = result.get("memory_score", 0.0)
    
    # Should have high signal count → high memory score
    assert sig_count >= 3, f"Low signal count: {sig_count}/5"
    assert mem >= 0.6, f"Memory score too low for {sig_count} signals: {mem:.2f}"
    print(f"[OK] Diamond coherence: {sig_count}/5 signals -> memory={mem:.2f}")


if __name__ == "__main__":
    print("Running memory coherence health tests...\n")
    try:
        test_memory_scale_range()
        test_memory_coherence_min_avg()
        test_memory_diamond_cases()
        print("\n[OK] All memory coherence tests passed!")
    except AssertionError as e:
        print(f"\n[FAIL] Test failed: {e}")
        sys.exit(1)

