#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
L1 ReportComposerAgent — Syr ihop rapport (JSON→UI/PDF)
Komplett payload, generisk, regelstyrd, UI/PDF-block.

Input (stdin eller --payload path):
{
  "meta": {
    "explain_verbose": false,
    "score_weights": {"insights":0.4,"plan":0.4,"safety":0.2},
    "section_order": ["summary","insights","plan","recommendations","next_steps"],
    "recommendation_rules": [
      {"if": {"path":"insights.communication.communication_quality","equals":"poor"},
       "then": "Förbättra kommunikation med jag-budskap och speglande lyssning."}
    ]
  },
  "data": {
    "case_id": "abc-123",
    "topN": ["kommunikation","gränser","tillit"],
    "top3": ["kommunikation","gränser","tillit"],
    "safety": {"status":"OK","notes":[]},
    "scores": {"kommunikation":0.9,"gränser":0.8,"tillit":0.7},
    "plan": {...},                    # från plan_interventions
    "comm_insights": {...},
    "conflict_insights": {...},
    "boundary_insights": {...},
    "align_insights": {...},
    "attachment_insights": {...},
    "power_insights": {...}
  }
}

Output:
{
  "ok": true,
  "version": "report_comp@1.4.0",
  "latency_ms": 10,
  "cost": {"usd": 0.003},
  "emits": { "report": {...}, "ui_blocks": [...], "pdf_layout": {...} },
  "checks": {...},
  "rationales": [...]
}
"""
import sys
import json
import time
import argparse
from typing import Any, Dict, List, Tuple, Union

AGENT_VERSION = "1.4.0"
AGENT_ID = "report_comp"

# -------------------------- Helpers -------------------------- #
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
    p = argparse.ArgumentParser(description="Compose relation-/analysrapport från samlade agentinsikter.")
    p.add_argument("--payload", type=str, default=None, help="Sökväg till payload.json (annars läs stdin).")
    p.add_argument("--explain-verbose", action="store_true", help="Inkludera rationales.")
    return p.parse_args(argv)

def load_payload(args: argparse.Namespace) -> Dict[str, Any]:
    default_payload = {"meta": {}, "data": {}}
    if args.payload:
        with open(args.payload, "r", encoding="utf-8") as f:
            return json.load(f)
    return non_blocking_stdin(default_payload)

def safe_mean(values: List[float], default: float = 0.5) -> float:
    vals = [v for v in values if isinstance(v,(int,float))]
    if not vals:
        return default
    return sum(vals) / max(1, len(vals))

def pick_focus(data: Dict[str, Any]) -> List[str]:
    if data.get("topN"): return list(data["topN"])
    if data.get("top3"): return list(data["top3"])
    # fallback från scores
    scores = data.get("scores") or {}
    if scores:
        return [k for k,_ in sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:3]]
    return []

def gather_insights(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Plocka generiskt upp alla nycklar som slutar på '_insights' och mappa till korta namn.
    Ex: 'boundary_insights' -> 'boundaries'
    """
    mapping = {
        "comm_insights": "communication",
        "conflict_insights": "conflict",
        "boundary_insights": "boundaries",
        "align_insights": "alignment",
        "attachment_insights": "attachment",
        "power_insights": "power",
    }
    out: Dict[str, Any] = {}
    for k, v in data.items():
        if k.endswith("_insights") and v is not None:
            out[mapping.get(k, k.replace("_insights",""))] = v
    # behåll bakåtkompatibla keys om de redan fanns som i originalet
    for k, alias in mapping.items():
        if k in data and alias not in out:
            out[alias] = data[k]
    return out

def deep_get(obj: Any, path: str) -> Any:
    """Hämta värde via punktstig, t.ex. 'insights.communication.communication_quality'."""
    parts = [p for p in path.split(".") if p]
    cur = obj
    for p in parts:
        if isinstance(cur, dict) and p in cur:
            cur = cur[p]
        else:
            return None
    return cur

def apply_recommendation_rules(report: Dict[str, Any], rules: List[Dict[str, Any]]) -> List[str]:
    recs: List[str] = []
    for r in rules or []:
        cond = r.get("if", {})
        target_path = cond.get("path")
        equals = cond.get("equals", None)
        in_set = cond.get("in", None)
        exists = cond.get("exists", None)
        then_text = r.get("then")
        if not then_text: 
            continue
        val = deep_get(report, target_path) if target_path else None
        ok = True
        if equals is not None:
            ok = ok and (val == equals)
        if in_set is not None and isinstance(in_set, list):
            ok = ok and (val in in_set)
        if exists is not None:
            ok = ok and ((val is not None) if exists else (val is None))
        if ok:
            recs.append(str(then_text))
    # unika + bevara ordning
    seen, uniq = set(), []
    for r in recs:
        if r not in seen:
            seen.add(r); uniq.append(r)
    return uniq

def score_overall(scores: Dict[str, float], plan: Dict[str, Any], safety: Union[str, Dict[str, Any]], weights: Dict[str, float]) -> Union[float, None]:
    # Filter out None values
    valid_scores = [v for v in scores.values() if v is not None and isinstance(v, (int, float))]
    if not valid_scores:
        return None  # Return None if all scores are None
    
    s_ins = safe_mean(valid_scores, 0.5)
    # plan-kvalitet: antal interventioner + har timeline
    if isinstance(plan, dict):
        n_iv = len(plan.get("interventions", [])) if plan.get("interventions") else 0
        has_tl = 1 if plan.get("timeline") else 0
        s_plan = min(1.0, 0.5 + 0.1 * n_iv + 0.4 * has_tl) if (n_iv or has_tl) else 0.5
    else:
        s_plan = 0.5
    # safety: OK=1.0, WARNING=0.6, RISK/HIGH=0.3, annars 0.5
    s_flag = "OK"
    if isinstance(safety, dict):
        s_flag = str(safety.get("status","OK")).upper()
    elif isinstance(safety, str):
        s_flag = safety.upper()
    s_map = {"OK":1.0, "LOW":0.9, "MEDIUM":0.7, "WARNING":0.6, "RISK":0.4, "HIGH":0.3, "CRITICAL":0.2}
    s_safety = s_map.get(s_flag, 0.5)

    w_ins = float(weights.get("insights", 0.4))
    w_plan = float(weights.get("plan", 0.4))
    w_safe = float(weights.get("safety", 0.2))
    total_w = max(1e-9, w_ins + w_plan + w_safe)
    return (s_ins*w_ins + s_plan*w_plan + s_safety*w_safe) / total_w

def build_ui_blocks(report: Dict[str, Any]) -> List[Dict[str, Any]]:
    """UI-block för webben (kortsiktigt JSON-schema som frontend lätt kan mappa)."""
    s = report.get("summary", {})
    blocks = [
        {"type":"header","title":"Relationsrapport","subtitle":s.get("case_id","—")},
        {"type":"kpis","items":[
            {"label":"Övergripande poäng","value":round(s.get("overall_score",0.0),3) if s.get("overall_score") is not None else "N/A"},
            {"label":"Säkerhet","value":s.get("safety_status","OK")},
            {"label":"Fokusområden","value":", ".join(s.get("focus_areas",[])) or "—"},
        ]},
        {"type":"section","title":"Rekommendationer","items": report.get("recommendations",[]) or ["—"]},
        {"type":"section","title":"Nästa steg","items": report.get("next_steps",[]) or ["—"]},
    ]
    return blocks

def build_pdf_layout(report: Dict[str, Any], section_order: List[str]) -> Dict[str, Any]:
    """Enkel layoutdefinition för PDF-generator (rubriker + innehållsstigar)."""
    layout = {"title": "Relationsrapport", "sections": []}
    sections_map = {
        "summary": {"title":"Sammanfattning","path":"summary"},
        "insights": {"title":"Insikter","path":"insights"},
        "plan": {"title":"Interventionsplan","path":"plan"},
        "recommendations": {"title":"Rekommendationer","path":"recommendations"},
        "next_steps": {"title":"Nästa steg","path":"next_steps"},
    }
    for key in section_order or ["summary","insights","plan","recommendations","next_steps"]:
        if key in sections_map:
            layout["sections"].append(sections_map[key])
    return layout

# -------------------------- Composer -------------------------- #
def compose_report(data: Dict[str, Any], meta: Dict[str, Any]) -> Dict[str, Any]:
    insights = gather_insights(data)
    scores = data.get("scores", {}) or {}
    plan = data.get("plan", {}) or {}
    safety = data.get("safety", "OK")
    focus = pick_focus(data)

    weights = meta.get("score_weights") or {"insights":0.4,"plan":0.4,"safety":0.2}
    overall = score_overall(scores, plan, safety, weights)

    report = {
        "schema_version": "1.1.0",
        "summary": {
            "case_id": data.get("case_id", "unknown"),
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "focus_areas": focus,
            "safety_status": safety["status"] if isinstance(safety, dict) else safety,
            "overall_score": round(float(overall), 3) if overall is not None else None
        },
        "insights": insights,
        "plan": plan,
        "recommendations": [],
        "next_steps": []
    }

    # Basrekommendationer (generella tumregler)
    base_recs: List[str] = []
    # Kommunikation
    comm = insights.get("communication", {})
    if str(comm.get("communication_quality","")).lower() in {"poor","low","svag"}:
        base_recs.append("Träna jag-budskap, spegling och sammanfattning vid alla check-ins.")
    # Konflikt
    confl = insights.get("conflict", {})
    if str(confl.get("conflict_level","")).lower() in {"high","hög"}:
        base_recs.append("Inför 24-timmars reparationsfönster efter konflikt och använd paus-signal.")
    # Gränser
    bnd = insights.get("boundaries", {})
    if str(bnd.get("respect_level","")).lower() in {"low","låg"}:
        base_recs.append("Definiera och synliggör 3 st nyckelgränser var; följ upp veckovis.")
    # Tillit
    aln = insights.get("alignment", {})
    if str(aln.get("trust_signals","")).lower() in {"weak","svag"}:
        base_recs.append("Skapa 3 mikrolöften och leverera dem konsekvent under 14 dagar.")
    # Attachment (exempel)
    att = insights.get("attachment", {})
    if str(att.get("anxiety","")).lower() in {"high","hög"}:
        base_recs.append("Planera förutsägbar kontakt-rutin (tid, kanal) för att minska osäkerhet.")

    # Regelmotor från meta (kan ersätta/komplettera basrecs)
    rule_recs = apply_recommendation_rules(
        {"insights": insights, "summary": report["summary"], "plan": plan},
        meta.get("recommendation_rules") or []
    )

    # Slå ihop och av-duplicera
    seen, recs = set(), []
    for r in base_recs + rule_recs:
        if r and r not in seen:
            seen.add(r); recs.append(r)
    report["recommendations"] = recs

    # Nästa steg (generiska + från plan)
    next_steps = [
        "Kör interventionsplanens nästa vecka enligt tidslinjen.",
        "Sätt 20-min veckoretro där ni skattar framsteg (0–10) mot målen.",
        "Logga hinder/eskalationer och planera en konkret förbättring inför nästa vecka."
    ]
    # om plan har aktiviteter: lyft första 2
    try:
        if isinstance(plan, dict) and plan.get("interventions"):
            acts = []
            for iv in plan["interventions"]:
                acts += iv.get("activities", [])
            if acts:
                next_steps.insert(0, f"Starta med: {', '.join(acts[:2])}.")
    except Exception:
        pass
    report["next_steps"] = next_steps

    return report

# -------------------------- Runner -------------------------- #
def run(payload: Dict[str, Any], explain_verbose: bool) -> Dict[str, Any]:
    meta = payload.get("meta", {}) or {}
    data = payload.get("data", {}) or {}

    report = compose_report(data, meta)

    # UI/PDF strukturer
    ui_blocks = build_ui_blocks(report)
    section_order = meta.get("section_order") or ["summary","insights","plan","recommendations","next_steps"]
    pdf_layout = build_pdf_layout(report, section_order)

    # Checks
    has_summary = isinstance(report.get("summary"), dict) and "overall_score" in report["summary"]
    has_insights = isinstance(report.get("insights"), dict)
    has_plan = "plan" in report
    has_recs = bool(report.get("recommendations"))
    completeness = (int(has_summary)+int(has_insights)+int(has_plan)+int(has_recs))/4.0

    checks = {
        "CHK-REPORT-COMPLETE": {"pass": completeness >= 0.75, "score": round(completeness,3)},
        "CHK-SCORE-RANGE": {"pass": report["summary"]["overall_score"] is None or (0.0 <= report["summary"]["overall_score"] <= 1.0), "value": report["summary"]["overall_score"]},
        "CHK-UI-PDF": {"pass": bool(ui_blocks) and bool(pdf_layout.get("sections")), "ui_blocks": len(ui_blocks), "pdf_sections": len(pdf_layout.get("sections",[]))}
    }

    out = {
        "ok": True,
        "emits": {
            "report": report,
            "ui_blocks": ui_blocks,
            "pdf_layout": pdf_layout
        },
        "checks": checks
    }

    if explain_verbose or bool(meta.get("explain_verbose", False)):
        out["rationales"] = [{
            "cue": "overall_scoring_v1",
            "detail": {
                "weights": meta.get("score_weights") or {"insights":0.4,"plan":0.4,"safety":0.2},
                "focus_areas": report["summary"]["focus_areas"],
                "insight_keys": list(report["insights"].keys())
            }
        }]

    return out

def main() -> None:
    t0 = time.time()
    try:
        args = parse_args(sys.argv[1:])
        payload = load_payload(args)
        res = run(payload, explain_verbose=args.explain_verbose)
        res["version"] = f"{AGENT_ID}@{AGENT_VERSION}"
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
