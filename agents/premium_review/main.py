#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PremiumReviewAgent - Premium-kvalitetsgranskning och djupare analys
Ger premium-användare mer detaljerade insikter, högre kvalitet och prioriterad behandling.

Input (stdin eller --payload):
{
  "meta": {
    "explain_verbose": false,
    "premium_tier": "basic|pro|enterprise",  # Premium-nivå
    "include_recommendations": true,
    "include_actionable_steps": true
  },
  "data": {
    "text": "…",
    "analysis_results": {...},        # Resultat från andra agenter
    "user_context": {...}             # Användarkontext
  }
}

Output:
{
  "ok": true,
  "version": "premium_review@1.0.0",
  "emits": {
    "premium_review": {
      "polished": true,
      "quality_score": 0.0-1.0,
      "depth_level": "basic|intermediate|advanced",
      "insights": [...],
      "recommendations": [...],
      "actionable_steps": [...],
      "priority": "high|normal"
    },
    "notes": "..."
  }
}
"""
import sys, json, time, argparse
from typing import Any, Dict, List

AGENT_VERSION = "1.0.0"
AGENT_ID = "premium_review"

# -------------------- CLI -------------------- #
def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="PremiumReviewAgent – premium-kvalitetsgranskning.")
    p.add_argument("--payload", type=str, default=None)
    p.add_argument("--tier", type=str, default=None, choices=["basic","pro","enterprise"])
    p.add_argument("--explain-verbose", action="store_true")
    return p.parse_args(argv)

def nb_stdin(default: Dict[str, Any]) -> Dict[str, Any]:
    try:
        if sys.stdin and not sys.stdin.isatty():
            raw = sys.stdin.read()
            if raw.strip():
                return json.loads(raw)
    except Exception:
        pass
    return default

def load_payload(args: argparse.Namespace) -> Dict[str, Any]:
    default_payload = {"meta": {}, "data": {}}
    if args.payload:
        with open(args.payload, "r", encoding="utf-8") as f:
            return json.load(f)
    return nb_stdin(default_payload)

# -------------------- Premium-funktioner -------------------- #
def calculate_quality_score(analysis_results: Dict[str, Any], text: str) -> float:
    """Beräknar kvalitetspoäng baserat på analysresultat."""
    score = 0.5  # Baspoäng
    
    # Öka poäng baserat på analysdjup
    if analysis_results:
        # Antal agenter som har analyserat
        agent_count = len([k for k in analysis_results.keys() if k.startswith(("diag_", "risk_", "plan_"))])
        score += min(0.3, agent_count * 0.05)
        
        # Kvalitet i insikter
        if "insights" in str(analysis_results):
            score += 0.1
        
        # Om det finns rekommendationer
        if "recommendations" in str(analysis_results) or "suggestions" in str(analysis_results):
            score += 0.1
    
    # Textlängd indikerar mer detaljerad input
    word_count = len(text.split())
    if word_count > 100:
        score += 0.1
    elif word_count > 50:
        score += 0.05
    
    return min(1.0, score)

def determine_depth_level(tier: str, quality_score: float) -> str:
    """Bestämmer analysdjup baserat på tier och kvalitet."""
    if tier == "enterprise":
        return "advanced"
    elif tier == "pro":
        return "intermediate" if quality_score >= 0.6 else "basic"
    else:
        return "basic"

def generate_premium_insights(analysis_results: Dict[str, Any], depth_level: str) -> List[str]:
    """Genererar premium-insikter baserat på analysresultat."""
    insights = []
    
    if not analysis_results:
        return ["Premium-analys kräver analysresultat från andra agenter."]
    
    # Kommunikationsinsikter
    if "diag_communication" in analysis_results or "comm_insights" in str(analysis_results):
        insights.append("Kommunikationsanalys visar mönster i interaktioner.")
    
    # Konfliktinsikter
    if "diag_conflict" in analysis_results or "conflict_insights" in str(analysis_results):
        insights.append("Konfliktanalys identifierar spänningsområden.")
    
    # Tillitsinsikter
    if "diag_trust" in analysis_results or "trust_insights" in str(analysis_results):
        insights.append("Tillitsanalys visar signaler av transparens och ärlighet.")
    
    # Riskinsikter
    if "risk_" in str(analysis_results):
        insights.append("Riskanalys identifierar potentiella säkerhetsområden.")
    
    # Planinsikter
    if "plan_" in str(analysis_results):
        insights.append("Interventionsplanering ger konkreta steg för förbättring.")
    
    # Avancerade insikter för enterprise
    if depth_level == "advanced":
        insights.append("Djup analys av relationella dynamiker och mönster.")
        insights.append("Tidsbaserad analys av förändringar över tid.")
    
    return insights if insights else ["Premium-analys genomförd med högkvalitativ granskning."]

def generate_recommendations(tier: str, depth_level: str) -> List[str]:
    """Genererar rekommendationer baserat på tier."""
    recommendations = []
    
    if tier == "basic":
        recommendations = [
            "Fortsätt dokumentera interaktioner för djupare analys.",
            "Använd regelbundna check-ins för att spåra framsteg."
        ]
    elif tier == "pro":
        recommendations = [
            "Implementera interventionsplanen steg för steg.",
            "Sätt upp regelbundna retrospektiv för att mäta framsteg.",
            "Använd verktygslådan för att träna specifika färdigheter."
        ]
    else:  # enterprise
        recommendations = [
            "Använd avancerad analys för att identifiera långsiktiga mönster.",
            "Implementera anpassade interventionsstrategier baserat på djup analys.",
            "Sätt upp kontinuerlig övervakning och justering av strategier.",
            "Använd premium-resurser för expertstöd och coaching."
        ]
    
    return recommendations

def generate_actionable_steps(tier: str) -> List[str]:
    """Genererar konkreta, åtgärdbara steg."""
    steps = []
    
    if tier == "basic":
        steps = [
            "Börja med att identifiera 3 huvudområden att fokusera på.",
            "Sätt upp en veckovis check-in-rutin."
        ]
    elif tier == "pro":
        steps = [
            "Välj en intervention från planen och implementera den denna vecka.",
            "Dokumentera resultat och justeringar efter varje intervention.",
            "Boka in regelbundna retrospektiv (varannan vecka)."
        ]
    else:  # enterprise
        steps = [
            "Skapa en detaljerad implementeringsplan med tidslinje.",
            "Sätt upp KPI:er för att mäta framsteg över tid.",
            "Använd premium-coaching för att optimera strategier.",
            "Implementera kontinuerlig feedback-loop för justeringar."
        ]
    
    return steps

# -------------------- Core -------------------- #
def run(payload: Dict[str, Any], meta: Dict[str, Any]) -> Dict[str, Any]:
    data = payload.get("data", {}) or {}
    
    text = data.get("text", "") or data.get("description", "")
    analysis_results = data.get("analysis_results", {}) or {}
    user_context = data.get("user_context", {}) or {}
    
    # Hämta premium-tier
    tier = meta.get("premium_tier", "basic")
    include_recommendations = meta.get("include_recommendations", True)
    include_actionable_steps = meta.get("include_actionable_steps", True)
    
    # Beräkna kvalitet
    quality_score = calculate_quality_score(analysis_results, text)
    depth_level = determine_depth_level(tier, quality_score)
    
    # Generera premium-innehåll
    insights = generate_premium_insights(analysis_results, depth_level)
    recommendations = generate_recommendations(tier, depth_level) if include_recommendations else []
    actionable_steps = generate_actionable_steps(tier) if include_actionable_steps else []
    
    # Bestäm prioritet
    priority = "high" if tier in ("pro", "enterprise") else "normal"
    
    premium_review = {
        "polished": True,
        "quality_score": round(quality_score, 3),
        "depth_level": depth_level,
        "insights": insights,
        "recommendations": recommendations,
        "actionable_steps": actionable_steps,
        "priority": priority
    }
    
    notes = f"Premium-review genomförd för {tier}-tier med {depth_level} analysdjup. Kvalitetspoäng: {quality_score:.2f}."
    
    emits = {
        "premium_review": premium_review,
        "notes": notes
    }
    
    checks = {
        "CHK-PREMIUM-01": {
            "pass": True,
            "reason": f"Premium-review slutförd för {tier}-tier"
        }
    }
    
    return {"ok": True, "emits": emits, "checks": checks}

# -------------------- Main -------------------- #
def main() -> None:
    t0 = time.time()
    try:
        args = parse_args(sys.argv[1:])
        payload = load_payload(args)
        meta = payload.get("meta", {}) or {}
        
        # Överstyr från CLI
        if args.tier:
            meta["premium_tier"] = args.tier
        
        res = run(payload, meta)
        res["version"] = f"{AGENT_ID}@{AGENT_VERSION}"
        res["latency_ms"] = int((time.time() - t0) * 1000)
        res["cost"] = {"usd": 0.005}  # Premium = högre kostnad
        
        if args.explain_verbose or meta.get("explain_verbose", False):
            res["rationales"] = [{
                "cue": "premium_review",
                "detail": {
                    "tier": meta.get("premium_tier", "basic"),
                    "quality_score": res["emits"]["premium_review"]["quality_score"],
                    "depth_level": res["emits"]["premium_review"]["depth_level"],
                    "insights_count": len(res["emits"]["premium_review"]["insights"])
                }
            }]
        
        sys.stdout.write(json.dumps(res, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        sys.stderr.write(f"{AGENT_ID} error: {e}\n")
        sys.stdout.write(json.dumps({"ok": False, "error": str(e)}))
        sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    main()
