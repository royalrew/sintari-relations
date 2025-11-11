#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CrisisRouterAgent - Akut krisrouting med resurser och handlingsplaner
Integrerar med risk_selfharm, risk_abuse, risk_coercion och SafetyGate.
Måste ha <60s responstid för kritiska situationer.

Input (stdin eller --payload):
{
  "meta": {
    "explain_verbose": false,
    "jurisdiction": "SE",              # SE|NO|DK|FI|EN
    "language": "sv"
  },
  "data": {
    "text": "…",
    "safety_gate": {"safety": "RED|WARN|OK"},
    "risk_selfharm": {"selfharm_risk": "HIGH|MEDIUM|LOW"},
    "risk_abuse": {"abuse_risk": "HIGH|MEDIUM|LOW"},
    "risk_coercion": {"coercion_risk": "HIGH|MEDIUM|LOW"}
  }
}

Output:
{
  "ok": true,
  "version": "crisis_router@1.0.0",
  "emits": {
    "crisis_required": true|false,
    "crisis_level": "CRITICAL|HIGH|MEDIUM|LOW",
    "crisis_plan": {
      "status": "CRISIS|WARNING|OK",
      "actions": [...],
      "resources": [...],
      "immediate_steps": [...]
    }
  }
}
"""
import sys, json, time, argparse
from typing import Any, Dict, List

AGENT_VERSION = "1.0.0"
AGENT_ID = "crisis_router"

# -------------------- CLI -------------------- #
def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="CrisisRouterAgent – akut krisrouting.")
    p.add_argument("--payload", type=str, default=None)
    p.add_argument("--jurisdiction", type=str, default=None)
    p.add_argument("--language", type=str, default=None)
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

# -------------------- Krisresurser per jurisdiktion -------------------- #
CRISIS_RESOURCES = {
    "SE": {
        "suicide_prevention": {
            "name": "Självmordslinjen",
            "phone": "90101",
            "phone_display": "90101",
            "url": "https://www.mind.se/hjalp-och-stod/sjalvmordslinjen/",
            "available": "24/7"
        },
        "crisis_helpline": {
            "name": "Jourhavande medmänniska",
            "phone": "08-702 16 80",
            "phone_display": "08-702 16 80",
            "url": "https://www.jourhavande-medmanniska.se/",
            "available": "18:00-06:00"
        },
        "abuse_helpline": {
            "name": "Kvinnofridslinjen",
            "phone": "020-50 50 50",
            "phone_display": "020-50 50 50",
            "url": "https://www.kvinnofridslinjen.se/",
            "available": "24/7"
        },
        "emergency": {
            "name": "Akut ambulans",
            "phone": "112",
            "phone_display": "112",
            "available": "24/7"
        }
    },
    "NO": {
        "suicide_prevention": {
            "name": "Mental Helse",
            "phone": "116 123",
            "phone_display": "116 123",
            "url": "https://www.mentalhelse.no/",
            "available": "24/7"
        },
        "crisis_helpline": {
            "name": "Kirkens SOS",
            "phone": "22 40 00 40",
            "phone_display": "22 40 00 40",
            "url": "https://www.kirkens-sos.no/",
            "available": "24/7"
        },
        "abuse_helpline": {
            "name": "Krisesentertelefonen",
            "phone": "800 40 008",
            "phone_display": "800 40 008",
            "url": "https://www.krisesenter.com/",
            "available": "24/7"
        },
        "emergency": {
            "name": "Akutt ambulans",
            "phone": "113",
            "phone_display": "113",
            "available": "24/7"
        }
    },
    "DK": {
        "suicide_prevention": {
            "name": "Livslinjen",
            "phone": "70 201 201",
            "phone_display": "70 201 201",
            "url": "https://www.livslinien.dk/",
            "available": "11:00-05:00"
        },
        "crisis_helpline": {
            "name": "Sind Telefon",
            "phone": "70 23 27 50",
            "phone_display": "70 23 27 50",
            "url": "https://www.sind.dk/",
            "available": "24/7"
        },
        "abuse_helpline": {
            "name": "Landsorganisationen for Kvindecentre",
            "phone": "70 20 30 82",
            "phone_display": "70 20 30 82",
            "url": "https://www.lokk.dk/",
            "available": "24/7"
        },
        "emergency": {
            "name": "Akut ambulans",
            "phone": "112",
            "phone_display": "112",
            "available": "24/7"
        }
    },
    "FI": {
        "suicide_prevention": {
            "name": "Kriisipuhelin",
            "phone": "09 2525 0111",
            "phone_display": "09 2525 0111",
            "url": "https://www.kriisipuhelin.fi/",
            "available": "24/7"
        },
        "crisis_helpline": {
            "name": "Mieli ry",
            "phone": "09 2525 0111",
            "phone_display": "09 2525 0111",
            "url": "https://www.mieli.fi/",
            "available": "24/7"
        },
        "abuse_helpline": {
            "name": "Nollalinja",
            "phone": "0800 02466",
            "phone_display": "0800 02466",
            "url": "https://www.nollalinja.fi/",
            "available": "24/7"
        },
        "emergency": {
            "name": "Hätäkeskus",
            "phone": "112",
            "phone_display": "112",
            "available": "24/7"
        }
    },
    "EN": {
        "suicide_prevention": {
            "name": "National Suicide Prevention Lifeline",
            "phone": "988",
            "phone_display": "988",
            "url": "https://suicidepreventionlifeline.org/",
            "available": "24/7"
        },
        "crisis_helpline": {
            "name": "Crisis Text Line",
            "phone": "Text HOME to 741741",
            "phone_display": "Text HOME to 741741",
            "url": "https://www.crisistextline.org/",
            "available": "24/7"
        },
        "abuse_helpline": {
            "name": "National Domestic Violence Hotline",
            "phone": "1-800-799-7233",
            "phone_display": "1-800-799-7233",
            "url": "https://www.thehotline.org/",
            "available": "24/7"
        },
        "emergency": {
            "name": "Emergency Services",
            "phone": "911",
            "phone_display": "911",
            "available": "24/7"
        }
    }
}

# Fallback till SE om jurisdiction saknas
DEFAULT_JURISDICTION = "SE"

# -------------------- Handlingsplaner -------------------- #
def build_crisis_plan(
    crisis_level: str,
    jurisdiction: str,
    risk_types: List[str],
    language: str = "sv"
) -> Dict[str, Any]:
    """Bygger krisplan baserat på risknivå och typer."""
    
    resources = CRISIS_RESOURCES.get(jurisdiction, CRISIS_RESOURCES[DEFAULT_JURISDICTION])
    
    if crisis_level == "CRITICAL":
        # Akut självskade/självmordstankar
        if "selfharm" in risk_types:
            return {
                "status": "CRISIS",
                "actions": [
                    "Ring akut ambulans (112) om omedelbar fara finns",
                    "Kontakta självmordslinjen för stöd",
                    "Sök omedelbar professionell hjälp",
                    "Ta kontakt med närstående eller vårdcentral"
                ],
                "resources": [
                    {
                        "type": "emergency",
                        "name": resources["emergency"]["name"],
                        "phone": resources["emergency"]["phone_display"],
                        "priority": "IMMEDIATE"
                    },
                    {
                        "type": "suicide_prevention",
                        "name": resources["suicide_prevention"]["name"],
                        "phone": resources["suicide_prevention"]["phone_display"],
                        "url": resources["suicide_prevention"]["url"],
                        "priority": "HIGH"
                    }
                ],
                "immediate_steps": [
                    "Du är inte ensam. Det finns hjälp tillgänglig.",
                    "Ring " + resources["emergency"]["phone_display"] + " om du är i omedelbar fara.",
                    "Ring " + resources["suicide_prevention"]["phone_display"] + " för stöd och samtal.",
                    "Ta kontakt med en närstående eller vårdcentral idag."
                ]
            }
        
        # Akut våld/abuse
        if "abuse" in risk_types or "coercion" in risk_types:
            return {
                "status": "CRISIS",
                "actions": [
                    "Ring akut ambulans (112) om omedelbar fara finns",
                    "Kontakta kvinnofridslinjen eller motsvarande stödlinje",
                    "Sök säker plats om du är i fara",
                    "Kontakta polisen om du är hotad"
                ],
                "resources": [
                    {
                        "type": "emergency",
                        "name": resources["emergency"]["name"],
                        "phone": resources["emergency"]["phone_display"],
                        "priority": "IMMEDIATE"
                    },
                    {
                        "type": "abuse_helpline",
                        "name": resources["abuse_helpline"]["name"],
                        "phone": resources["abuse_helpline"]["phone_display"],
                        "url": resources["abuse_helpline"]["url"],
                        "priority": "HIGH"
                    }
                ],
                "immediate_steps": [
                    "Din säkerhet är viktigast. Ring " + resources["emergency"]["phone_display"] + " om du är i omedelbar fara.",
                    "Ring " + resources["abuse_helpline"]["phone_display"] + " för stöd och rådgivning.",
                    "Sök en säker plats om möjligt.",
                    "Kontakta polisen om du är hotad eller utsatt för våld."
                ]
            }
    
    elif crisis_level == "HIGH":
        return {
            "status": "WARNING",
            "actions": [
                "Kontakta krislinje för stöd",
                "Sök professionell hjälp inom 24 timmar",
                "Ta kontakt med närstående",
                "Dokumentera händelser om relevant"
            ],
            "resources": [
                {
                    "type": "crisis_helpline",
                    "name": resources["crisis_helpline"]["name"],
                    "phone": resources["crisis_helpline"]["phone_display"],
                    "url": resources["crisis_helpline"].get("url", ""),
                    "priority": "HIGH"
                }
            ],
            "immediate_steps": [
                "Ring " + resources["crisis_helpline"]["phone_display"] + " för stöd och samtal.",
                "Sök professionell hjälp inom 24 timmar.",
                "Ta kontakt med en närstående eller vårdcentral."
            ]
        }
    
    else:
        return {
            "status": "OK",
            "actions": [],
            "resources": [],
            "immediate_steps": []
        }

# -------------------- Core -------------------- #
def run(payload: Dict[str, Any], meta: Dict[str, Any]) -> Dict[str, Any]:
    data = payload.get("data", {}) or {}
    
    # Hämta risk-signaler från andra agenter
    safety_gate = data.get("safety_gate", {}) or {}
    risk_selfharm = data.get("risk_selfharm", {}) or {}
    risk_abuse = data.get("risk_abuse", {}) or {}
    risk_coercion = data.get("risk_coercion", {}) or {}
    
    # Bestäm krisnivå
    crisis_level = "LOW"
    risk_types = []
    crisis_required = False
    
    # SafetyGate RED = CRITICAL
    if safety_gate.get("safety") == "RED":
        crisis_level = "CRITICAL"
        crisis_required = True
        risk_types.append("safety")
    
    # Self-harm HIGH = CRITICAL
    if risk_selfharm.get("selfharm_risk") == "HIGH":
        crisis_level = "CRITICAL"
        crisis_required = True
        risk_types.append("selfharm")
    
    # Abuse HIGH = CRITICAL
    if risk_abuse.get("abuse_risk") == "HIGH":
        crisis_level = "CRITICAL"
        crisis_required = True
        risk_types.append("abuse")
    
    # Coercion HIGH = HIGH (kan eskalera till CRITICAL)
    if risk_coercion.get("coercion_risk") == "HIGH":
        if crisis_level == "LOW":
            crisis_level = "HIGH"
        crisis_required = True
        risk_types.append("coercion")
    
    # MEDIUM risks = HIGH om ingen CRITICAL
    if crisis_level == "LOW":
        if (risk_selfharm.get("selfharm_risk") == "MEDIUM" or
            risk_abuse.get("abuse_risk") == "MEDIUM" or
            risk_coercion.get("coercion_risk") == "MEDIUM"):
            crisis_level = "HIGH"
            crisis_required = True
    
    # Bygg krisplan
    jurisdiction = meta.get("jurisdiction", DEFAULT_JURISDICTION).upper()
    language = meta.get("language", "sv")
    crisis_plan = build_crisis_plan(crisis_level, jurisdiction, risk_types, language)
    
    emits = {
        "crisis_required": crisis_required,
        "crisis_level": crisis_level,
        "crisis_plan": crisis_plan
    }
    
    checks = {
        "CHK-CRISIS-01": {
            "pass": True,
            "reason": (f"{crisis_level} kris detekterad" if crisis_required else "Ingen kris detekterad")
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
        
        # Överstyr från CLI om angivet
        if args.jurisdiction:
            meta["jurisdiction"] = args.jurisdiction
        if args.language:
            meta["language"] = args.language
        
        res = run(payload, meta)
        res["version"] = f"{AGENT_ID}@{AGENT_VERSION}"
        res["latency_ms"] = int((time.time() - t0) * 1000)
        res["cost"] = {"usd": 0.001}  # Låg kostnad, snabb routing
        
        if args.explain_verbose or meta.get("explain_verbose", False):
            res["rationales"] = [{
                "cue": "crisis_routing",
                "detail": {
                    "jurisdiction": meta.get("jurisdiction", DEFAULT_JURISDICTION),
                    "crisis_level": res["emits"]["crisis_level"],
                    "risk_types": res["emits"].get("risk_types", [])
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
