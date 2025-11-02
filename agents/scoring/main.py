#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
F1 ScoringAgent – Normalisering & viktning (Drift<5%)

Input (stdin eller --payload path):
{
  "meta": {
    "normalize": "minmax",                  # none|minmax|softmax
    "topic_boost": 0.2,
    "drift_limit": 0.05,
    "explain_verbose": false,
    "weights": {"features":0.4,"topics":0.3,"insights":0.3},  # valfritt (för info, ej hård vikt)
    "base_scores": {"kommunikation":0.5,"gränser":0.5,"tillit":0.5,"respekt":0.5,"intimitet":0.5,"vardag":0.5,"ekonomi":0.5},
    "feature_rules": {
      "kritik": {"kommunikation": 0.3, "respekt": 0.2},
      "försvar": {"tillit": 0.2, "gränser": 0.3}
    },
    "insight_rules": [
      {"if":{"path":"communication.communication_quality","equals":"excellent"}, "add":{"kommunikation":0.3}},
      {"if":{"path":"conflict.conflict_level","equals":"high"}, "add":{"gränser":0.2}}
    ]
  },
  "data": {
    "tags": ["kommunikation","gränser"],     # topics
    "features": ["kritik"],                  # upptäckta fenomen
    "scores": {},                            # valfritt pre-scores (om du vill initiera)
    "comm_insights": {"communication_quality":"poor"},
    "conflict_insights": {"conflict_level":"high"}
  }
}

Output:
{
  "ok": true,
  "version": "scoring@1.5.0",
  "latency_ms": 3,
  "cost": {"usd": 0.004},
  "emits": {
    "scores": {"kommunikation":0.86, "gränser":0.78, ...},
    "confidence": 0.82,
    "contribs": { "kommunikation":{"base":0.5,"features":0.3,"topics":0.2,"insights":0.0}, ... },
    "raw": {"kommunikation":1.0,"gränser":1.0,...}
  },
  "checks": {
    "CHK-NORM-RANGE":{"pass":true},
    "CHK-SCORE-DRIFT":{"pass":true,"drift":0.02,"limit":0.05}
  },
  "rationales":[...]
}
"""
import sys, json, time, argparse
from typing import Dict, Any, List, Tuple

AGENT_VERSION = "1.5.0"
AGENT_ID = "scoring"

# ---------- I/O ---------- #
def nb_stdin(default: Dict[str,Any]) -> Dict[str,Any]:
    try:
        if sys.stdin and not sys.stdin.isatty():
            raw = sys.stdin.read()
            if raw.strip():
                return json.loads(raw)
    except Exception:
        pass
    return default

def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="F1 ScoringAgent – normalisering & viktning.")
    p.add_argument("--payload", type=str, default=None, help="Sökväg till payload.json (annars stdin).")
    p.add_argument("--normalize", type=str, default=None, choices=["none","minmax","softmax"])
    p.add_argument("--drift-limit", type=float, default=None)
    p.add_argument("--explain-verbose", action="store_true")
    return p.parse_args(argv)

def load_payload(args: argparse.Namespace) -> Dict[str,Any]:
    default_payload = {"meta": {}, "data": {}}
    if args.payload:
        with open(args.payload, "r", encoding="utf-8") as f:
            return json.load(f)
    return nb_stdin(default_payload)

# ---------- Helpers ---------- #
def clamp(x: float, a: float, b: float) -> float:
    return max(a, min(b, x))

def deep_get(obj: Any, path: str):
    cur = obj
    for p in [p for p in path.split(".") if p]:
        if isinstance(cur, dict) and p in cur:
            cur = cur[p]
        else:
            return None
    return cur

def softmax(d: Dict[str, float]) -> Dict[str, float]:
    import math
    xs = list(d.values())
    if not xs: return {}
    m = max(xs)
    exps = [math.exp(v - m) for v in xs]
    s = sum(exps) or 1.0
    keys = list(d.keys())
    return {k: exps[i] / s for i, k in enumerate(keys)}

def minmax01(d: Dict[str, float]) -> Dict[str, float]:
    if not d: return {}
    vals = list(d.values())
    lo, hi = min(vals), max(vals)
    if hi - lo <= 1e-12:
        return {k: 0.5 for k in d}
    return {k: (v - lo) / (hi - lo) for k, v in d.items()}

def normalize_scores(scores: Dict[str, float], mode: str) -> Dict[str, float]:
    if mode == "none":
        # klampa bara till [0,1]
        return {k: clamp(v, 0.0, 1.0) for k, v in scores.items()}
    if mode == "softmax":
        # softmax ger fördelning (sum=1). Skala upp till [0,1] mha max.
        sm = softmax(scores)
        m = max(sm.values()) if sm else 1.0
        return {k: (v/m if m > 0 else 0.0) for k, v in sm.items()}
    # default: minmax
    mm = minmax01(scores)
    return {k: clamp(v, 0.0, 1.0) for k, v in mm.items()}

def gather_insights(data: Dict[str,Any]) -> Dict[str,Any]:
    mapping = {
        "comm_insights":"communication",
        "conflict_insights":"conflict",
        "boundary_insights":"boundaries",
        "align_insights":"alignment",
        "attachment_insights":"attachment",
        "power_insights":"power",
    }
    out = {}
    for k, v in data.items():
        if k.endswith("_insights"):
            out[mapping.get(k, k.replace("_insights",""))] = v
    return out

# ---------- Core scoring ---------- #
def apply_feature_rules(features: List[str], rules: Dict[str, Dict[str, float]], contribs: Dict[str, Dict[str,float]], scores: Dict[str,float]):
    for f in features or []:
        deltas = rules.get(f, {})
        for tag, dv in deltas.items():
            scores[tag] = scores.get(tag, 0.5) + float(dv)
            contribs.setdefault(tag, {}).setdefault("features", 0.0)
            contribs[tag]["features"] += float(dv)

def apply_topic_boost(tags: List[str], boost: float, contribs: Dict[str, Dict[str,float]], scores: Dict[str,float]):
    for t in tags or []:
        scores[t] = scores.get(t, 0.5) + float(boost)
        contribs.setdefault(t, {}).setdefault("topics", 0.0)
        contribs[t]["topics"] += float(boost)

def apply_insight_rules(insights: Dict[str,Any], rules: List[Dict[str,Any]], contribs: Dict[str, Dict[str,float]], scores: Dict[str,float]) -> int:
    hits = 0
    for r in rules or []:
        cond = r.get("if",{})
        path = cond.get("path")
        equals = cond.get("equals", None)
        in_set = cond.get("in", None)
        val = deep_get(insights, path) if path else None
        ok = True
        if equals is not None: ok = ok and (val == equals)
        if in_set is not None and isinstance(in_set, list): ok = ok and (val in in_set)
        if not ok: continue
        adds = r.get("add", {})
        for tag, dv in adds.items():
            scores[tag] = scores.get(tag, 0.5) + float(dv)
            contribs.setdefault(tag, {}).setdefault("insights", 0.0)
            contribs[tag]["insights"] += float(dv)
        hits += 1
    return hits

def calculate_scores(features: List[str], insights: Dict[str,Any], topics: List[str], meta: Dict[str,Any]) -> Tuple[Dict[str,float], float, Dict[str,Dict[str,float]], Dict[str,float]]:
    base = dict(meta.get("base_scores") or {
        "kommunikation":0.5,"gränser":0.5,"tillit":0.5,"respekt":0.5,"intimitet":0.5,"vardag":0.5,"ekonomi":0.5
    })
    topic_boost = float(meta.get("topic_boost", 0.2))
    feature_rules = meta.get("feature_rules") or {
        "kritik":{"kommunikation":0.3,"respekt":0.2},
        "försvar":{"tillit":0.2,"gränser":0.3}
    }
    insight_rules = meta.get("insight_rules") or []

    # init scores = base
    scores = dict(base)
    contribs: Dict[str, Dict[str,float]] = {k: {"base": v} for k, v in base.items()}

    # features
    apply_feature_rules(features, feature_rules, contribs, scores)

    # topics
    apply_topic_boost(topics, topic_boost, contribs, scores)

    # insights
    hits = apply_insight_rules(insights, insight_rules, contribs, scores)

    # clamp raw
    raw = {k: clamp(v, 0.0, 1.5) for k, v in scores.items()}

    # confidence: starts at 0.5 + signals*0.1 - negatives*0.05 (bounded)
    signals = len(features or []) + len(topics or []) + hits
    confidence = clamp(0.5 + 0.1*signals, 0.0, 0.99)

    return raw, confidence, contribs, base

def drift_against_base(raw: Dict[str,float], base: Dict[str,float]) -> float:
    if not raw:
        return 0.0
    keys = set(raw.keys()) | set(base.keys())
    if not keys:
        return 0.0
    # absolut medeldrift per tag
    diffs = []
    for k in keys:
        r = float(raw.get(k, 0.0))
        b = float(base.get(k, 0.0))
        diffs.append(abs(r - b))
    # skala till [0,1] (bas-poäng ligger ofta nära 0.5)
    avg = sum(diffs) / len(diffs)
    # en enkel konservativ normalisering: 1.0 diff ~ max drift
    return clamp(avg, 0.0, 1.0)

# ---------- Runner ---------- #
def run(payload: Dict[str,Any], normalize_mode: str, drift_limit: float, explain_verbose: bool) -> Dict[str,Any]:
    data = payload.get("data", {}) or {}
    meta = payload.get("meta", {}) or {}

    # Check if core input is missing
    clean_text = data.get("clean_text") or data.get("text") or data.get("source_text") or ""
    missing_core = not clean_text.strip()
    
    DOMAINS = ["kommunikation", "gränser", "tillit", "respekt", "intimitet", "vardag", "ekonomi"]
    
    if missing_core:
        return {
            "ok": True,
            "emits": {
                "scores": {d: None for d in DOMAINS},
                "confidence": 0.0,
                "contribs": {d: {"base": None} for d in DOMAINS},
                "raw": {d: None for d in DOMAINS},
                "reason": "insufficient_input"
            },
            "checks": {
                "CHK-NORM-RANGE": {"pass": True},
                "CHK-SCORE-DRIFT": {"pass": True, "drift": 0.0, "limit": 0.05}
            }
        }

    features = data.get("features") or []
    topics = data.get("tags") or []
    insights = gather_insights(data)

    # compute
    raw, confidence, contribs, base = calculate_scores(features, insights, topics, meta)
    norm_mode = (normalize_mode or meta.get("normalize") or "minmax").lower()
    scores = normalize_scores(raw, norm_mode)

    # checks
    drift = drift_against_base(scores, base)  # drift på normaliserad skala
    ok_drift = drift < float(drift_limit if drift_limit is not None else meta.get("drift_limit", 0.05))
    in_range = all(0.0 <= v <= 1.0 for v in scores.values())

    out = {
        "ok": True,
        "emits": {
            "scores": scores,
            "confidence": round(confidence, 3),
            "contribs": contribs,
            "raw": raw
        },
        "checks": {
            "CHK-NORM-RANGE": {"pass": bool(in_range)},
            "CHK-SCORE-DRIFT": {"pass": bool(ok_drift), "drift": round(drift, 4), "limit": drift_limit if drift_limit is not None else meta.get("drift_limit", 0.05)}
        }
    }

    if explain_verbose or bool(meta.get("explain_verbose", False)):
        out["rationales"] = [{
            "cue":"score_pipeline_v1",
            "detail":{
                "normalize": norm_mode,
                "signals": {"features": len(features), "topics": len(topics), "insight_hits": len(meta.get("insight_rules") or [])},
                "weights_hint": meta.get("weights") or {"features":0.4,"topics":0.3,"insights":0.3}
            }
        }]

    return out

def main() -> None:
    t0 = time.time()
    try:
        args = parse_args(sys.argv[1:])
        payload = load_payload(args)
        res = run(
            payload,
            normalize_mode=(args.normalize or None),
            drift_limit=(args.drift_limit if args.drift_limit is not None else None),
            explain_verbose=args.explain_verbose
        )
        res["version"] = f"{AGENT_ID}@{AGENT_VERSION}"
        res["latency_ms"] = int((time.time() - t0) * 1000)
        res["cost"] = {"usd": 0.004}
        sys.stdout.write(json.dumps(res, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        sys.stderr.write(f"{AGENT_ID} error: {e}\n")
        sys.stdout.write(json.dumps({"ok": False, "error": str(e)}))
        sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    main()
