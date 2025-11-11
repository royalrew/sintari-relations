#!/usr/bin/env python3
"""Self-Improvement Core (Step 1: Shadow Run).

Runs a fixed number of shadow conversations, logs KPIs to worldclass_live.jsonl
and stores nightly summaries for later analysis. No automatic changes.
"""
from __future__ import annotations

import argparse
import json
import random
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

WORLDCLASS_LIVE = Path("reports/worldclass_live.jsonl")
SI_DIR = Path("reports/si")
SI_DIR.mkdir(parents=True, exist_ok=True)

DATASETS = [
    Path("tests/memory/golden/episodic_threads.jsonl"),
    Path("tests/memory/golden/semantic_pairs.jsonl"),
    Path("tests/golden/relations/silver/lang_pairs.jsonl"),
]


def _read_jsonl(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _write_jsonl(path: Path, records: List[Dict[str, Any]]):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")


def _mock_run(case: Dict[str, Any]) -> Dict[str, Any]:
    run_id = f"si-{int(time.time() * 1000)}-{random.randint(100, 999)}"
    empathy = max(0.0, min(1.0, 0.6 + random.uniform(-0.05, 0.05)))
    warmth = max(0.0, min(1.0, 0.4 + random.uniform(-0.05, 0.05)))
    clarity = max(0.0, min(1.0, 0.5 + random.uniform(-0.05, 0.05)))
    explain = {
        "style": "warm",
        "level": "standard",
        "why": "Det du delar visar hög empati och något lägre värme.",
        "patterns": ["tolkningsmönster: värde/tempo‑missmatch"],
        "reflection": "Vill du stanna upp vid den känslan en stund?",
        "evidence": case.get("spans", [])[:1],
        "no_advice": True,
    }
    kpi = {
        "explain.coverage": 1.0,
        "explain.no_advice": 1.0,
        "memory.mrr": 0.92,
        "memory.hit@3": 1.0,
    }
    return {
        "run_id": run_id,
        "tone": (empathy, warmth, clarity),
        "explain": explain,
        "kpi": kpi,
        "seed": {k: case.get(k) for k in ("id", "query", "facets", "spans")},
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=50)
    parser.add_argument("--out", type=Path, default=SI_DIR / "nightly.jsonl")
    args = parser.parse_args()

    seeds: List[Dict[str, Any]] = []
    for dataset in DATASETS:
        seeds.extend(_read_jsonl(dataset)[:100])
    random.shuffle(seeds)
    seeds = seeds[: args.count]

    nightly_records: List[Dict[str, Any]] = []
    for seed in seeds:
        result = _mock_run(seed)
        _write_jsonl(WORLDCLASS_LIVE, [{"ts": int(time.time()), **result}])
        nightly_records.append(result)
        time.sleep(0.01)

    _write_jsonl(args.out, nightly_records)
    print(f"[SI] Wrote {len(nightly_records)} runs to {args.out}")


if __name__ == "__main__":
    main()

