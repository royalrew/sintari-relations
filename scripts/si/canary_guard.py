#!/usr/bin/env python3
import json
import os
import sys
import argparse
import time

ap = argparse.ArgumentParser()
ap.add_argument("--infile", default="reports/worldclass_live.jsonl")
ap.add_argument("--window", type=int, default=200)
ap.add_argument("--slo_mrr", type=float, default=float(os.getenv("CANARY_SLO_MRR", "0.65")))
ap.add_argument("--slo_explain", type=float, default=float(os.getenv("CANARY_SLO_EXPLAIN", "0.95")))
ap.add_argument("--slo_tone", type=float, default=float(os.getenv("CANARY_SLO_TONE", "0.05")))
ap.add_argument("--json", action="store_true")
ap.add_argument("--out", default="reports/si/canary_guard_last.json")
args = ap.parse_args()

STATE_PATH = "reports/si/canary_state.json"


def read_state():
    try:
        with open(STATE_PATH, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        return {}


def eligibility_from_state(state):
    now = int(time.time())
    percent = float(state.get("percent", 0) or 0)
    passes = int(state.get("passes_in_row", 0) or 0)
    fails = int(state.get("fails_in_row", 0) or 0)
    last_action = int(state.get("last_action_ts", 0) or 0)
    age = now - last_action

    reason = None
    if percent < 5:
        reason = "canary < 5%"
    elif passes < 2:
        reason = "< 2 raka PASS"
    elif age < 24 * 60 * 60:
        reason = "< 24h sedan senaste ändring"
    elif fails > 0:
        reason = "nyligen FAIL"

    return {
        "percent": percent,
        "passes_in_row": passes,
        "fails_in_row": fails,
        "last_action_ts": last_action,
        "age_sec": age,
        "ok": reason is None,
        "reason": reason or "",
    }


def read_jsonl(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return [json.loads(line) for line in fh if line.strip()]
    except FileNotFoundError:
        return []


state = read_state()
eligibility = eligibility_from_state(state)

rows = read_jsonl(args.infile)[-args.window:]
canary = [r for r in rows if r.get("cohort") == "canary"]
if not canary:
    summary = {
        "ok": True,
        "mrr": 0.0,
        "explain": 0.0,
        "tone_drift": 0.0,
        "slo": {"mrr": args.slo_mrr, "explain": args.slo_explain, "tone": args.slo_tone},
        "note": "no-canary-data",
        "eligibility": eligibility,
        "ts": int(time.time()),
    }
    if args.json:
        print(json.dumps(summary, ensure_ascii=False))
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(summary, fh, ensure_ascii=False, indent=2)
    sys.exit(0)


def mean(key, default=0.0):
    values = [r.get("kpi", {}).get(key) for r in canary if isinstance(r.get("kpi", {}).get(key), (int, float))]
    return (sum(values) / len(values)) if values else default


def severity(mrr, explain, tone):
    return mrr < 0.8 * args.slo_mrr or explain < 0.8 * args.slo_explain or tone > 1.2 * args.slo_tone


mrr = mean("memory.mrr")
explain = mean("explain.coverage", 1.0)
tone_drift = mean("tone.drift", 0.0)

ok = (mrr >= args.slo_mrr) and (explain >= args.slo_explain) and (tone_drift <= args.slo_tone)
summary = {
    "ok": ok,
    "mrr": round(mrr, 3),
    "explain": round(explain, 3),
    "tone_drift": round(tone_drift, 3),
    "slo": {"mrr": args.slo_mrr, "explain": args.slo_explain, "tone": args.slo_tone},
    "severe": not ok and severity(mrr, explain, tone_drift),
    "eligibility": eligibility,
    "ts": int(time.time()),
}

print(
    f"[GUARD] canary mrr={summary['mrr']:.3f} explain={summary['explain']:.3f} drift={summary['tone_drift']:.3f} -> {'OK' if ok else 'FAIL'} | eligibility={'OK' if eligibility['ok'] else eligibility['reason']}"
)
if args.json:
    print(json.dumps(summary, ensure_ascii=False))

os.makedirs(os.path.dirname(args.out), exist_ok=True)
with open(args.out, "w", encoding="utf-8") as fh:
    json.dump(summary, fh, ensure_ascii=False, indent=2)

sys.exit(0 if ok else 2)
