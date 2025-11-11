#!/usr/bin/env python3
"""
Micro SI pilot (ingen shadow-deploy): detect → plan → simulate → score → JSON-diff

Kör lokalt mot ett subset av golden (t.ex. 100 case).
"""
import json
import random
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "reports" / "si_micro.json"


def simulate_patch(case):
    # TODO: plugga in verklig patchplan
    return {"patch": "noop", "expected_gain": 0.001}


def score_cases(cases):
    # TODO: koppla till scoring_relations.py
    # För nu: simulera score-förbättring
    base = sum(random.uniform(0.94, 0.97) for _ in cases) / len(cases)
    after = base + random.uniform(0.002, 0.006)
    return base, after


def main():
    # Sample: 100 cases (ersätt med riktiga golden cases senare)
    sample = list(range(100))
    base, after = score_cases(sample)
    
    payload = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "cases": len(sample),
        "score_base": round(base, 4),
        "score_after": round(after, 4),
        "delta": round(after - base, 4),
        "status": "simulated"  # eller "applied" när riktig patch körts
    }
    
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False),
        encoding="utf-8"
    )
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()

