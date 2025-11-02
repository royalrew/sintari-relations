#!/usr/bin/env python3
"""
CalibrationAgent – stabiliserar skalan (tone/reco/conf) mot golden via EWMA.
Läser/skriv kalibreringsstate i runtime/calibration/relations.json.
"""
from __future__ import annotations
import json
import pathlib
import time
import sys
from typing import Dict, Any

STATE_DIR = pathlib.Path("runtime/calibration")
STATE_DIR.mkdir(parents=True, exist_ok=True)
STATE = STATE_DIR / "relations.json"

DEFAULT = {"v": 1, "updated": 0, "tone_bias": 0.0, "reco_bias": 0.0, "conf_scale": 1.0, "samples": 0}


def _load():
    if STATE.exists():
        try:
            return json.loads(STATE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return DEFAULT.copy()


def _save(s):
    s["updated"] = int(time.time())
    STATE.write_text(json.dumps(s, ensure_ascii=False, indent=2), encoding="utf-8")


def apply(pred: Dict[str, Any]) -> Dict[str, Any]:
    s = _load()
    tone = float(pred.get("tone_sim", pred.get("tone_score", 0.0)))
    reco = float(pred.get("reco_sim", pred.get("reco_score", 0.0)))
    conf = float(pred.get("confidence", 0.9))

    # applicera bias/scale
    tone_adj = max(0.0, min(1.0, tone + s["tone_bias"]))
    reco_adj = max(0.0, min(1.0, reco + s["reco_bias"]))
    conf_adj = max(0.0, min(1.0, conf * s["conf_scale"]))

    pred["tone_sim_cal"] = tone_adj
    pred["reco_sim_cal"] = reco_adj
    pred["confidence_cal"] = conf_adj
    pred["calibration_state"] = {"tone_bias": s["tone_bias"], "reco_bias": s["reco_bias"], "conf_scale": s["conf_scale"]}
    return pred


def update(eval_delta: Dict[str, float]) -> Dict[str, Any]:
    """
    eval_delta: {"tone_err": target - actual, "reco_err": target - actual, "conf_err": target - actual_scale}
    EWMA (alpha=0.2)
    """
    s = _load()
    a = 0.2
    s["tone_bias"] = round(s["tone_bias"] + a * eval_delta.get("tone_err", 0.0), 4)
    s["reco_bias"] = round(s["reco_bias"] + a * eval_delta.get("reco_err", 0.0), 4)
    s["conf_scale"] = round(max(0.5, min(1.5, s["conf_scale"] * (1.0 + a * eval_delta.get("conf_err", 0.0)))), 4)
    s["samples"] = s.get("samples", 0) + 1
    _save(s)
    return s


def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    data = payload.get("data", {})
    
    # Apply calibration to existing predictions
    result = apply({})
    return {
        "ok": True,
        "emits": result
    }


if __name__ == "__main__":
    payload = json.loads(sys.stdin.read())
    result = run(payload)
    print(json.dumps(result, ensure_ascii=False))
