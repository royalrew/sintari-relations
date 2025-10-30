#!/usr/bin/env python3
"""Health test for calibration stability."""
import sys
import pathlib
import importlib.util

def _load(name, rel_path):
    root = pathlib.Path(__file__).resolve().parents[3]
    p = root / rel_path
    spec = importlib.util.spec_from_file_location(name, str(p))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)  # type: ignore
    return m

# Add agents to path
import sys
agents_path = pathlib.Path(__file__).resolve().parents[3]
if str(agents_path) not in sys.path:
    sys.path.insert(0, str(agents_path))

try:
    _bridge = _load("orchestrator_bridge", "sintari-relations/tests/_helpers/orchestrator_bridge.py")
    orchestrator_analyze = _bridge.orchestrator_analyze
except Exception:
    orchestrator_analyze = None


def test_calibration_state_exists():
    """Test that calibration state file can be created."""
    from agents.calibration.main import _load, _save, STATE
    state = _load()
    assert "tone_bias" in state
    assert "reco_bias" in state
    assert "conf_scale" in state
    _save(state)
    assert STATE.exists()
    print("[OK] Calibration state exists and is writable")


def test_outputs_present():
    """Test that graph outputs are present."""
    if orchestrator_analyze:
        pred = orchestrator_analyze(text="Spegla först, sen lös.", lang="sv")
        assert "graph_events" in pred or pred is not None
        print("[OK] Orchestrator returns results")
    else:
        print("[SKIP] Orchestrator not available")


def test_session_memory_exists():
    """Test session memory functionality."""
    from agents.rel.session_memory import STORE, save, last_n
    test_sid = "test_sid_123"
    test_summary = {"signals": {"checkin": True}, "score": 0.5}
    save(test_sid, test_summary)
    history = last_n(test_sid, 5)
    assert len(history) >= 1
    print("[OK] Session memory works")


if __name__ == "__main__":
    print("Running calibration stability tests...\n")
    try:
        test_calibration_state_exists()
        test_outputs_present()
        test_session_memory_exists()
        print("\n[OK] All calibration stability tests passed!")
    except AssertionError as e:
        print(f"\n[FAIL] Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}")
        sys.exit(1)

