#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
G2 InterventionPlannerAgent - 7–21 dagars mikroplan
<3s (MVP) <5s (Gold)

Input (stdin eller --payload):
{
  "meta": {
    "explain_verbose": false,
    "top_n": 3,
    "max_weeks": 3,                 # 1–3 (7–21 dagar)
    "distribute": "round_robin"     # "sequential"|"round_robin"
  },
  "data": {
    "top3": ["kommunikation","gränser","tillit"],  # valfritt: om saknas hämtas från scores
    "scores": {"kommunikation":0.9,"gränser":0.8,"tillit":0.7},
    "insights": {"risks":["defensivitet"], "strengths":["empati"]},
    "templates": { ... }            # valfritt, överskriver default
  }
}

Output:
{
  "ok": true,
  "version": "plan_interventions@1.2.0",
  "latency_ms": 12,
  "cost": {"usd": 0.006},
  "emits": { "plan": {...} },
  "checks": {...},
  "rationales": [...]               # om explain_verbose
}
"""
import sys
import json
import time
import argparse
from typing import Dict, List, Any, Tuple

AGENT_VERSION = "1.2.0"
AGENT_ID = "plan_interventions"

# ---------------------- Defaults ---------------------- #
DEFAULT_TEMPLATES: Dict[str, Dict[str, Any]] = {
    "kommunikation": {
        "title": "Förbättra kommunikation",
        "activities": [
            "Daglig 10–15 min check-in med turordnat tal",
            "Använd jag-budskap och speglande lyssning",
            "Sammanfatta innan du svarar (”det jag hör är…”)",
            "Veckovis retro: vad funkade/inte?"
        ],
        "duration_days": 14
    },
    "gränser": {
        "title": "Etablera tydliga gränser",
        "activities": [
            "Lista 3 personliga gränser var och syfte bakom",
            "Säg tydligt nej + föreslå alternativ",
            "Skapa signalord för paus vid eskalation",
            "Veckovis uppföljning av gränsbrott och lärdom"
        ],
        "duration_days": 21
    },
    "tillit": {
        "title": "Bygg tillit",
        "activities": [
            "Identifiera 3 små löften; leverera konsekvent",
            "Transparens: dela planer och förväntningar",
            "Reparationsförsök inom 24h efter konflikt",
            "Veckovis tacksamhetsrutin (3 observationer)"
        ],
        "duration_days": 21
    },
    "respekt": {
        "title": "Öka respekt",
        "activities": [
            "Undvik absolutord (alltid/aldrig)",
            "Daglig uppskattning (1 konkret beteende)",
            "Lyssna färdigt – inga avbrott i 2 minuter",
            "Veckovis reflektion: när kände du dig sedd?"
        ],
        "duration_days": 14
    },
    "intimitet": {
        "title": "Fördjupa intimitet",
        "activities": [
            "Planerad kvalitetstid utan skärmar (30–60 min)",
            "Dela sårbarhet: 1 känsla + 1 önskan",
            "Icke-sexuell närhet (kram, hand, närvaro)",
            "Veckovis mini-dejt med låg tröskel"
        ],
        "duration_days": 21
    }
}

DEFAULT_SUCCESS = [
    "Färre eskalationer per vecka",
    "Högre upplevd förståelse (självskattning)",
    "Ökad följsamhet till överenskommelser"
]

# ---------------------- Helpers ---------------------- #
def non_blocking_stdin(default: Dict[str, Any]) -> Dict[str, Any]:
    try:
        if sys.stdin and not sys.stdin.isatty():
            raw = sys.stdin.read()
            if raw.strip():
                return json.loads(raw)
    except Exception:
        pass
    return default

def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Planera 7–21 dagars interventioner baserat på top-N fokus.")
    p.add_argument("--payload", type=str, default=None, help="Sökväg till payload.json (annars läs stdin).")
    return p.parse_args(argv)

def load_payload(args: argparse.Namespace) -> Dict[str, Any]:
    default_payload = {"meta": {}, "data": {}}
    if args.payload:
        with open(args.payload, "r", encoding="utf-8") as f:
            return json.load(f)
    return non_blocking_stdin(default_payload)

def topn_from_scores(scores: Dict[str, float], n: int) -> List[str]:
    if not scores:
        return []
    return [k for k,_ in sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:n]]

def clamp_weeks(x: int) -> int:
    return max(1, min(3, x))

def derive_metrics(insights: Dict[str, Any]) -> List[str]:
    metrics = list(DEFAULT_SUCCESS)
    risks = [r.lower() for r in insights.get("risks", [])] if insights else []
    if any("defensiv" in r for r in risks):
        metrics.append("Minskad defensiv respons vid feedback")
    if any("tillit" in r for r in risks):
        metrics.append("Färre brutna mikrolöften per vecka")
    strengths = [s.lower() for s in insights.get("strengths", [])] if insights else []
    if any("empati" in s for s in strengths):
        metrics.append("Ökad validering uttryckt (antal/vecka)")
    # unika + bevara ordning
    seen, uniq = set(), []
    for m in metrics:
        if m not in seen:
            seen.add(m); uniq.append(m)
    return uniq

def merge_templates(user_templates: Dict[str, Any] | None) -> Dict[str, Any]:
    if not user_templates:
        return dict(DEFAULT_TEMPLATES)
    merged = dict(DEFAULT_TEMPLATES)
    for k, v in user_templates.items():
        try:
            base = dict(merged.get(k, {}))
            base.update(v or {})
            # säkerställ rimliga defaults
            base.setdefault("title", k.title())
            base.setdefault("activities", [])
            base.setdefault("duration_days", 14)
            merged[k] = base
        except Exception:
            pass
    return merged

def schedule_interventions(
    focuses: List[str],
    templates: Dict[str, Any],
    max_weeks: int,
    distribute: str = "round_robin"
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Skapar interventionslista + timeline:
    - max_weeks 1–3 -> 7–21 dagar
    - distribute: "sequential" = en fokus per vecka i ordning,
                  "round_robin" = varva aktiviteter mellan fokus över veckor.
    """
    interventions = []
    for i, f in enumerate(focuses):
        if f not in templates:
            # generisk fallback
            tmpl = {"title": f.title(), "activities": ["Daglig reflektion 10 min"], "duration_days": 7}
        else:
            tmpl = templates[f]
        interventions.append({
            "focus": f,
            "title": tmpl.get("title", f.title()),
            "activities": list(tmpl.get("activities", [])),
            "duration_days": int(tmpl.get("duration_days", 14)),
            "priority": "high" if i == 0 else ("medium" if i == 1 else "low")
        })

    weeks = clamp_weeks(max_weeks)
    timeline: Dict[str, Any] = {}
    # bygg veckor
    if distribute == "sequential":
        # vecka 1 -> focus[0], vecka 2 -> focus[1] ...
        for w in range(1, weeks + 1):
            idx = (w - 1) % max(1, len(interventions))
            iv = interventions[idx]
            timeline[f"week_{w}"] = {
                "focus": iv["focus"],
                "activities": iv["activities"][: min(3, len(iv["activities"]))],
                "intent": "fördjupa ett tema"
            }
    else:
        # round_robin över aktiviteter för att få ”mikroprogress” på flera fronter
        rr = []
        for iv in interventions:
            for act in iv["activities"]:
                rr.append((iv["focus"], act))
        # fördela lika över veckor
        if rr:
            chunk = max(1, len(rr) // weeks + (1 if len(rr) % weeks else 0))
            for w in range(1, weeks + 1):
                start = (w - 1) * chunk
                end = min(len(rr), w * chunk)
                slice_rr = rr[start:end]
                timeline[f"week_{w}"] = {
                    "focus": list({f for f, _ in slice_rr})[:3],
                    "activities": [a for _, a in slice_rr][:5],
                    "intent": "mikroprogress på flera fronter"
                }
        else:
            # inga aktiviteter – generisk
            for w in range(1, weeks + 1):
                timeline[f"week_{w}"] = {
                    "focus": [],
                    "activities": ["Daglig 10-min reflektion", "Veckovis retro 20 min"],
                    "intent": "starta vanor"
                }
    return interventions, timeline

# ---------------------- Core ---------------------- #
def create_intervention_plan(top_focus: List[str], insights: Dict[str, Any], scores: Dict[str, float], meta: Dict[str, Any]) -> Dict[str, Any]:
    top_n = int(meta.get("top_n", 3) or 3)
    max_weeks = clamp_weeks(int(meta.get("max_weeks", 3) or 3))
    distribute = str(meta.get("distribute", "round_robin") or "round_robin")

    # Bestäm fokuslista
    focuses = list(top_focus or [])
    if not focuses and scores:
        focuses = topn_from_scores(scores, top_n)
    if not focuses:
        # helt generisk fallback
        focuses = ["kommunikation", "gränser", "tillit"][:top_n]

    templates = merge_templates(meta.get("templates") or (insights.get("templates") if insights else None) or None)
    interventions, timeline = schedule_interventions(focuses, templates, max_weeks=max_weeks, distribute=distribute)

    plan = {
        "title": "Personlig interventionsplan",
        "focus_areas": focuses,
        "scope": {
            "weeks": max_weeks,
            "days_total": 7 * max_weeks,
            "distribute": distribute
        },
        "interventions": interventions,
        "timeline": timeline,
        "cadence": {
            "daily": ["10–15 min check-in/reflektion"],
            "weekly": ["20–30 min retrospektiv + plan framåt"]
        },
        "metrics": {
            "success_indicators": derive_metrics(insights or {}),
            "measurement_frequency": "weekly",
            "self_rating_scale": "0–10",
        }
    }
    return plan

def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    meta = payload.get("meta", {}) or {}
    data = payload.get("data", {}) or {}

    top3 = data.get("top3") or []
    insights = data.get("insights") or {}
    scores = data.get("scores") or {}

    plan = create_intervention_plan(top3, insights, scores, meta)

    # checks
    has_interventions = bool(plan["interventions"])
    has_timeline = bool(plan["timeline"])
    has_metrics = bool(plan["metrics"]["success_indicators"])

    plan_score = (int(has_interventions) + int(has_timeline) + int(has_metrics)) / 3.0

    checks = {
        "CHK-PLAN-COMPLETE": {"pass": plan_score >= 0.67, "score": round(plan_score, 3)},
        "CHK-FOCUS-N": {"pass": len(plan["focus_areas"]) > 0, "expected_min": 1, "got": len(plan["focus_areas"])},
        "CHK-DURATION": {"pass": 7 <= plan["scope"]["days_total"] <= 21, "days_total": plan["scope"]["days_total"]},
    }

    out = {
        "ok": True,
        "emits": {"plan": plan},
        "checks": checks
    }

    if bool(meta.get("explain_verbose", False)):
        out["rationales"] = [{
            "cue": "constructed_from(top|scores|fallback)",
            "detail": {
                "meta": {k: meta.get(k) for k in ["top_n","max_weeks","distribute"]},
                "top_input": top3,
                "scores": scores,
                "insights_keys": list(insights.keys()),
                "focus_final": plan["focus_areas"]
            }
        }]

    return out

# ---------------------- Main ---------------------- #
def main() -> None:
    t0 = time.time()
    try:
        args = parse_args(sys.argv[1:])
        payload = load_payload(args)
        res = run(payload)
        res["version"] = f"{AGENT_ID}@{AGENT_VERSION}"
        res["latency_ms"] = int((time.time() - t0) * 1000)
        res["cost"] = {"usd": 0.006}
        sys.stdout.write(json.dumps(res, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        sys.stderr.write(f"{AGENT_ID} error: {e}\n")
        sys.stdout.write(json.dumps({"ok": False, "error": str(e)}))
        sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    main()
