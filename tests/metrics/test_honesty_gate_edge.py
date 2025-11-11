import json
import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
NPM = "npm.cmd" if os.name == "nt" else "npm"


def build_event(session_id: str, *, honesty_active: bool, rate: float | None = None, repair_accept: float | None = None, reasons: list[str] | None = None, no_advice: bool = True) -> dict:
  event = {
      "ts": "2025-11-07T20:00:00Z",
      "session_id": session_id,
      "run_id": "edge_test",
      "seed_id": session_id,
      "turn": 3,
      "mode": "personal",
      "risk": "SAFE",
      "locale": "sv" if honesty_active else "en",
      "reply_text": "Jag tar in det du beskriver." if honesty_active else "I hear how important this feels to you.",
      "kpi": {
          "explain": {"coverage": 1, "has_evidence": 1, "no_advice": 1 if no_advice else 0, "level": "standard", "style": "warm"},
          "memory": {"mrr": 0.92, "hit_at_3": 1},
      },
      "tone": {"vec": [0.62, 0.38, 0.53], "delta": 0.01},
      "style": {
          "likability_proxy": 0.95,
          "empathy_score": 0.7,
          "question_count": 1,
          "echo_ratio": 0,
          "tone_delta": 0.01,
      },
      "honesty": {
          "active": honesty_active,
          "reasons": reasons or ([] if not honesty_active else ["low_conf"]),
          "no_advice": no_advice,
      },
  }
  if rate is not None:
      event["honesty"]["rate"] = rate
  if repair_accept is not None:
      event["honesty"]["repair_accept_rate"] = repair_accept
  return event


def test_honesty_gate_edge(tmp_path: Path):
  raw_file = tmp_path / "worldclass_live.jsonl"

  events = [
      build_event("sess-safe-1", honesty_active=False),
      build_event("sess-safe-2", honesty_active=False),
      build_event("sess-honesty-1", honesty_active=True, rate=0.12, repair_accept=0.6, reasons=["low_conf", "data_gap"]),
      build_event("sess-honesty-2", honesty_active=True, rate=0.15, repair_accept=0.55, reasons=["lang_mismatch"]),
      build_event("sess-honesty-3", honesty_active=True, rate=0.11, repair_accept=0.52, reasons=["tone_drift"]),
      build_event("sess-safe-3", honesty_active=False),
  ]

  with raw_file.open("w", encoding="utf-8") as fh:
      for ev in events:
          fh.write(json.dumps(ev) + "\n")

  norm_file = tmp_path / "worldclass_live.norm.jsonl"

  subprocess.check_call([
      "node",
      str(ROOT / "scripts" / "metrics" / "normalise_worldclass_live.mjs"),
      str(raw_file),
      "--out",
      str(norm_file),
      "--enforce-monotonic",
      "--dedupe-sec",
      "900",
      "--session-window-limit",
      "50",
  ], cwd=ROOT)

  subprocess.check_call([
      NPM,
      "run",
      "schema:validate",
      "--",
      str(norm_file),
  ], cwd=ROOT)

  subprocess.check_call([
      "python",
      str(ROOT / "scripts" / "metrics" / "enforce_honesty_gate.py"),
      str(norm_file),
      "--min-honesty-rate",
      "0.10",
      "--no-advice-when-honest",
      "1",
      "--min-repair-accept",
      "0.50",
  ], cwd=ROOT)
