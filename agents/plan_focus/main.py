#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
plan_focus – Generic Top-N focus selector

- Tar in ett payload (stdin eller --payload <fil>) med struktur:
  {
    "meta": {"explain_verbose": bool, "top_n": int, "normalize": bool, "tie_break": "alpha|input"},
    "data": {
      "tags": ["a","b",...],
      "scores": {"a": 0.9, "c": 0.4, ...},
      "weights": {"a": 1.2, ...}   # valfritt: multipliceras med scores
    }
  }

- Om scores saknas men tags finns -> alla tags får default_weight (CLI-flagga).
- Om både scores och tags saknas -> använd generella fallbacks (kan sättas via CLI).
- Stöd för top-N (inte bara top3), normalisering, deterministisk tiebreak.

Exempel:
  echo '{"data":{"tags":["impact","urgency"]}}' | ./plan_focus.py --top-n 3
"""

import sys
import json
import time
import argparse
from typing import Dict, List, Tuple, Any

AGENT_VERSION = "1.3.0"
AGENT_ID = "plan_focus"


# ---------------------------- Core logic ------------------------------------- #
def stable_rank(
    scores: Dict[str, float],
    tie_break: str = "input",
    input_order: Dict[str, int] | None = None,
    descending: bool = True,
) -> List[Tuple[str, float]]:
    """
    Returnerar stabil sortering: primärt på score, sekundärt på namn (alpha) eller input-ordning.
    """
    if tie_break not in {"alpha", "input"}:
        tie_break = "input"

    if input_order is None:
        input_order = {k: i for i, k in enumerate(scores.keys())}

    def key_fn(it: Tuple[str, float]):
        k, v = it
        secondary = k if tie_break == "alpha" else input_order.get(k, 10**9)
        # sortera score desc, secondary asc
        return (-v if descending else v, secondary)

    return sorted(scores.items(), key=key_fn)


def normalize_scores(scores: Dict[str, float]) -> Dict[str, float]:
    """Skalar till [0,1] baserat på max-värde (robust mot tomma/negativa)."""
    if not scores:
        return scores
    max_val = max(scores.values())
    if max_val <= 0:
        # undvik div/0 och behåll original om allt är <=0
        return scores
    return {k: (v / max_val) for k, v in scores.items()}


def coerce_float(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except Exception:
        return default


def apply_weights(scores: Dict[str, float], weights: Dict[str, float] | None) -> Dict[str, float]:
    if not weights:
        return scores
    return {k: coerce_float(scores.get(k, 0.0)) * coerce_float(weights.get(k, 1.0)) for k in set(scores.keys()) | set(weights.keys())}


def build_effective_scores(
    data: Dict[str, Any],
    default_weight: float,
    fallback_scores: Dict[str, float],
    normalize: bool,
    tie_break: str
) -> Tuple[Dict[str, float], List[str]]:
    """
    Skapar en komplett score-karta enligt regler:
    1) Finns scores -> använd dem (+ weights om angivet)
    2) Annars om tags -> ge varje tag default_weight
    3) Annars -> använd fallback_scores
    Returnerar (scores, rank_order_keys_for_tiebreak)
    """
    tags = data.get("tags") or []
    raw_scores = data.get("scores") or {}
    weights = data.get("weights") or {}

    # För att kunna bryta likapoäng enligt "input" tar vi ordningen:
    input_order = {}
    idx = 0
    # prioritet: befintlig ordning i scores (insertion-order), därefter tags, därefter fallbacks
    for k in raw_scores.keys():
        input_order.setdefault(k, idx); idx += 1
    for k in tags:
        input_order.setdefault(k, idx); idx += 1
    for k in fallback_scores.keys():
        input_order.setdefault(k, idx); idx += 1

    if raw_scores:
        eff = {k: coerce_float(v) for k, v in raw_scores.items()}
        if weights:
            eff = apply_weights(eff, weights)
    elif tags:
        eff = {t: float(default_weight) for t in tags}
    else:
        eff = {k: coerce_float(v, 0.0) for k, v in fallback_scores.items()}

    if normalize:
        eff = normalize_scores(eff)

    # Stabil rangordning
    ranked = stable_rank(eff, tie_break=tie_break, input_order=input_order)

    # return both dict and rank list (keys)
    return dict(ranked), [k for k, _ in ranked]


def select_top(scores_ranked_dict: Dict[str, float], top_n: int) -> List[str]:
    if top_n <= 0:
        return []
    return list(scores_ranked_dict.keys())[:top_n]


# ---------------------------- I/O helpers ------------------------------------ #
def read_stdin_json(default: Dict[str, Any]) -> Dict[str, Any]:
    """
    Läs JSON från stdin om möjligt, annars returnera default.
    Blockerar inte när stdin är TTY.
    """
    try:
        if sys.stdin and not sys.stdin.isatty():
            data = sys.stdin.read()
            if data.strip():
                return json.loads(data)
    except Exception:
        pass
    return default


def load_payload(args: argparse.Namespace) -> Dict[str, Any]:
    default_payload = {
        "meta": {"explain_verbose": False},
        "data": {"scores": {}, "tags": [], "features": []}
    }

    if args.payload:
        with open(args.payload, "r", encoding="utf-8") as f:
            return json.load(f)

    # stdin fallback
    return read_stdin_json(default_payload)


# ---------------------------- CLI & run -------------------------------------- #
def run(payload: Dict[str, Any], cfg: argparse.Namespace) -> Dict[str, Any]:
    meta = payload.get("meta", {}) or {}
    data = payload.get("data", {}) or {}

    explain_verbose = bool(meta.get("explain_verbose", cfg.explain_verbose))
    top_n = int(meta.get("top_n", cfg.top_n))
    normalize = bool(meta.get("normalize", cfg.normalize))
    tie_break = str(meta.get("tie_break", cfg.tie_break))

    # Fallbacks
    fallback_scores = cfg.fallback_scores or {"impact": 0.9, "urgency": 0.8, "confidence": 0.7}

    # Bygg effektiva scores och sorterad ordning
    ranked_dict, ranked_keys = build_effective_scores(
        data=data,
        default_weight=cfg.default_weight,
        fallback_scores=fallback_scores,
        normalize=normalize,
        tie_break=tie_break,
    )

    top_keys = select_top(ranked_dict, top_n)
    focus_scores = {k: float(ranked_dict.get(k, 0.0)) for k in top_keys}

    out = {
        "ok": True,
        "version": f"{AGENT_ID}@{AGENT_VERSION}",
        "emits": {
            "topN": top_keys,
            "focus_scores": focus_scores,
            "all_scores_sorted": [{"tag": k, "score": float(v)} for k, v in ranked_dict.items()],
        },
        "checks": {
            "CHK-TOPN-COUNT": {
                "pass": len(top_keys) == min(top_n, len(ranked_dict)),
                "expected": min(top_n, len(ranked_dict)),
                "got": len(top_keys),
                "score": 1.0 if len(top_keys) > 0 else 0.0,
            },
            "CHK-NONEMPTY": {
                "pass": len(ranked_dict) > 0,
                "score": 1.0 if ranked_dict else 0.0,
            },
        },
    }

    if explain_verbose:
        out["rationales"] = [{
            "flag": "",
            "cue": "scores+weights" if data.get("scores") else ("tags->default_weight" if data.get("tags") else "fallback"),
            "span_src": [0, 0],
            "detail": {
                "normalize": normalize,
                "tie_break": tie_break,
                "top_n": top_n,
                "input": {
                    "tags": data.get("tags") or [],
                    "scores_in": data.get("scores") or {},
                    "weights_in": data.get("weights") or {},
                },
                "fallback_scores": fallback_scores,
                "ranked_keys": ranked_keys,
                "topN": top_keys,
            }
        }]

    return out


def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Select Top-N focus areas from scores/tags.")
    p.add_argument("--payload", type=str, default=None, help="Path to JSON payload file. If omitted, reads stdin.")
    p.add_argument("--top-n", type=int, default=3, help="Number of items to select (default 3).")
    p.add_argument("--normalize", action="store_true", help="Normalize scores to [0,1] by max.")
    p.add_argument("--tie-break", type=str, default="input", choices=["input", "alpha"], help="Tiebreak strategy.")
    p.add_argument("--default-weight", type=float, default=1.0, help="Weight for tags when scores missing.")
    p.add_argument("--fallback-tags", type=str, default="", help='Comma-separated fallback tags, e.g. "impact,urgency,confidence".')
    p.add_argument("--fallback-scores", type=str, default="", help='JSON map for fallback scores, e.g. \'{"impact":0.9,"urgency":0.8}\'.')
    p.add_argument("--explain-verbose", action="store_true", help="Emit rationales.")
    return p.parse_args(argv)


def parse_fallbacks(args: argparse.Namespace) -> None:
    # CLI → args.fallback_scores (dict)
    fb_map = {}
    if args.fallback_scores:
        try:
            fb_map = json.loads(args.fallback_scores)
            if not isinstance(fb_map, dict):
                fb_map = {}
        except Exception:
            fb_map = {}
    elif args.fallback_tags:
        tags = [t.strip() for t in args.fallback_tags.split(",") if t.strip()]
        fb_map = {t: 1.0 for t in tags}
    args.fallback_scores = fb_map


def main() -> None:
    t0 = time.time()
    try:
        args = parse_args(sys.argv[1:])
        parse_fallbacks(args)
        payload = load_payload(args)
        res = run(payload, args)
        res["latency_ms"] = int((time.time() - t0) * 1000)
        res["cost"] = {"usd": 0.003}
        sys.stdout.write(json.dumps(res, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        sys.stderr.write(f"{AGENT_ID} error: {e}\n")
        sys.stdout.write(json.dumps({"ok": False, "error": str(e)}))
        sys.stdout.flush()
        sys.exit(1)


if __name__ == "__main__":
    main()
