#!/usr/bin/env python3
"""
Persona Agent Bridge
PR7: Orchestrator integration

Bridge for calling PersonaAgent from TypeScript orchestrator
"""
import json
import sys
from pathlib import Path

# Add root to path
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    from agents.persona.persona_agent import analyze as persona_analyze
    PERSONA_AVAILABLE = True
except ImportError as e:
    print(f"[WARN] PersonaAgent not available: {e}", file=sys.stderr)
    PERSONA_AVAILABLE = False


def handle_jsonl_request(line: str) -> str:
    """Handle JSONL request from TypeScript orchestrator."""
    if not PERSONA_AVAILABLE:
        return json.dumps({
            "ok": False,
            "agent": "persona_agent",
            "error": "PersonaAgent not available",
            "latency_ms": 0
        }, ensure_ascii=False)
    
    # Delegate to persona_agent's handler
    from agents.persona.persona_agent import handle_jsonl_request as handle
    
    try:
        return handle(line)
    except Exception as e:
        return json.dumps({
            "ok": False,
            "agent": "persona_agent",
            "error": str(e),
            "latency_ms": 0
        }, ensure_ascii=False)


if __name__ == "__main__":
    # JSONL bridge mode
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        
        try:
            response = handle_jsonl_request(line)
            print(response, flush=True)
        except Exception as e:
            error_resp = json.dumps({
                "ok": False,
                "agent": "persona_agent",
                "error": str(e),
                "latency_ms": 0
            }, ensure_ascii=False)
            print(error_resp, flush=True)

