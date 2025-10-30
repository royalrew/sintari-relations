from __future__ import annotations

from typing import Dict, Any
import json
import pathlib


def detect(summary: Dict[str, Any]) -> Dict[str, Any]:
    # Minimal placeholder: flag drift when error rate spikes
    err_rate = float(summary.get("error_rate", 0))
    drift = err_rate >= 0.1
    return {"drift": drift, "error_rate": err_rate}


MET = pathlib.Path("runs/metrics/diamond_memory.jsonl")


def recent_diamond_mem(n: int = 3):
    if not MET.exists():
        return []
    rows = [json.loads(l) for l in MET.read_text(encoding="utf-8").splitlines() if l.strip()]
    return [r.get("diamond_mem_avg", 0.0) for r in rows][-n:]


def should_warn(min_avg: float = 0.90, n: int = 3):
    vals = recent_diamond_mem(n)
    return len(vals) == n and all(v < min_avg for v in vals)


def warn_line():
    vals = recent_diamond_mem()
    if not vals:
        return "Diamond memory: no history"
    return "Diamond memory last %d: %s" % (len(vals), ", ".join(f"{v:.2f}" for v in vals))


__all__ = ["detect", "recent_diamond_mem", "should_warn", "warn_line"]


