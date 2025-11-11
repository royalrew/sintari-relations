import json
import os
import subprocess
import sys
import tempfile

SCRIPT = os.path.join("scripts", "metrics", "enforce_honesty_gate.py")


def write_events(events):
    tmp = tempfile.NamedTemporaryFile("w", delete=False, suffix=".jsonl")
    for event in events:
        tmp.write(json.dumps(event) + "\n")
    tmp.close()
    return tmp.name


def run_gate(path: str, **kwargs):
    args = [sys.executable, SCRIPT, path]
    for key, value in kwargs.items():
        args.extend([f"--{key.replace('_', '-')}", str(value)])
    result = subprocess.run(args, capture_output=True, text=True)
    return result


def make_event(**overrides):
    base = {
      "ts": "2025-11-07T18:00:00Z",
      "session_id": "sess-1",
      "reply_text": "I’m taking in what you shared.",
      "honesty": {
          "active": True,
          "reasons": ["memory_miss"],
          "rate": 0.12,
          "repair_accept_rate": 0.6,
      },
      "kpi": {
          "explain": {
              "no_advice": 1.0,
          }
      }
    }
    base.update(overrides)
    return base


def test_honesty_gate_passes():
    path = write_events([
        make_event(session_id="sess-pass", honesty={"active": True, "reasons": ["memory_miss"], "rate": 0.12, "repair_accept_rate": 0.6}, kpi={"explain": {"no_advice": 1.0}})
    ])
    result = run_gate(path)
    os.unlink(path)
    assert result.returncode == 0, result.stdout + result.stderr


def test_honesty_gate_blocks_advice():
    path = write_events([
        make_event(session_id="sess-advice", kpi={"explain": {"no_advice": 0.0}})
    ])
    result = run_gate(path)
    os.unlink(path)
    assert result.returncode != 0
    assert "advice" in result.stdout.lower()


def test_honesty_gate_blocks_rate_and_repair():
    path = write_events([
        make_event(session_id="sess-rate", honesty={"active": True, "reasons": ["data_gap"], "rate": 0.05, "repair_accept_rate": 0.4})
    ])
    result = run_gate(path)
    os.unlink(path)
    assert result.returncode != 0
    assert "rate" in result.stdout.lower()
