#!/usr/bin/env python3
"""
Router Bridge - Minimal, robust bridge för routing-beslut.
Anropas från TypeScript orchestrator eller batch-runner.

SKRIVER ALLT ANNAT TILL STDERR - endast sista JSON-raden på stdout.
"""

import json
import sys
import os
from pathlib import Path

# Add backend to path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.ai.model_router import route_case

def eprint(*args, **kwargs):
    """Print to stderr (debug/info only)."""
    print(*args, file=sys.stderr, **kwargs)

def main():
    """CLI entry point - line-framed: en rad in, en rad JSON ut."""
    raw = sys.stdin.readline()
    if not raw:
        return
    
    try:
        payload = json.loads(raw)
    except Exception as e:
        eprint(f"[BRIDGE] JSON parse error: {e}\nRAW={raw!r}")
        print(json.dumps({"error": "bad_json", "tier": "base", "routing": {"tier": "base"}}))
        sys.stdout.flush()
        return
    
    text = payload.get("text", "")
    lang = payload.get("lang", "sv")
    
    # Samla ihop hints korrekt - säkerställ __forceTop forwardas
    hints = payload.get("complexity_hints") or {}
    if payload.get("__forceTop"):
        hints["__forceTop"] = True
    
    # Debug: logga om forceTop finns
    if hints.get("__forceTop"):
        eprint(f"[BRIDGE] __forceTop detected for text: {text[:60]}...")
    
    try:
        res = route_case(
            text=text,
            lang=lang,
            has_dialog=payload.get("has_dialog", False) or bool(payload.get("dialog")),
            complexity_hints=hints if hints else None,
            safety_flags=payload.get("safety_flags"),
            previous_tier=payload.get("previous_tier"),
            previous_failed=bool(payload.get("previous_failed", False)),
        )
        
        # Debug: logga om result inte är top trots forceTop
        if hints.get("__forceTop") and res.get("tier") != "top":
            eprint(f"[BRIDGE] WARNING: __forceTop set but tier={res.get('tier')}, reason={res.get('reason')}")
            
    except Exception as e:
        eprint(f"[BRIDGE] route_case error: {e}")
        import traceback
        eprint(traceback.format_exc())
        print(json.dumps({
            "error": "route_case_failed",
            "tier": "base",
            "routing": {"tier": "base", "confidence": 0.5}
        }))
        sys.stdout.flush()
        return
    
    # Skriv EN ren JSON-rad på stdout (inget annat)
    # Normalisera tier: lowercase, strip (förhindra "Top"/"TOP" etc)
    final_tier = str(res.get("tier", "base")).strip().lower()
    
    out = {
        "tier": final_tier,  # <- top-level tier (normaliserad)
        "routing": {
            "tier": final_tier,  # <- samma tier (normaliserad)
            "confidence": res.get("confidence"),
            "model": res.get("model"),
            "cost_multiplier": res.get("cost_multiplier", 1.0),
            "reason": res.get("reason"),
        },
        "fastpath": None,
        "cost_check": {"ok": True, "action": "allow"},
    }
    
    # Debug: logga om forceTop inte respekterades
    if hints.get("__forceTop") and final_tier != "top":
        eprint(f"[BRIDGE] ERROR: __forceTop set but tier={final_tier}, reason={res.get('reason')}")
    
    print(json.dumps(out, ensure_ascii=False))
    sys.stdout.flush()

if __name__ == "__main__":
    main()
