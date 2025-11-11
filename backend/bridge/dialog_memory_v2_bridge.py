#!/usr/bin/env python3
"""
Dialog Memory v2 Bridge
PR7: Orchestrator integration

Bridge for calling DialogMemoryV2 from TypeScript orchestrator
"""
import json
import sys
from pathlib import Path

# Add root to path
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    from agents.memory.dialog_memory_v2 import DialogMemoryV2, MemoryRecord, extract_facets
    MEMORY_V2_AVAILABLE = True
except ImportError as e:
    print(f"[WARN] DialogMemoryV2 not available: {e}", file=sys.stderr)
    MEMORY_V2_AVAILABLE = False


def handle_jsonl_request(line: str) -> str:
    """Handle JSONL request from TypeScript orchestrator."""
    if not MEMORY_V2_AVAILABLE:
        return json.dumps({
            "ok": False,
            "agent": "dialog_memory_v2",
            "error": "DialogMemoryV2 not available",
            "latency_ms": 0
        }, ensure_ascii=False)
    
    # Delegate to dialog_memory_v2's handler
    from agents.memory.dialog_memory_v2 import handle_jsonl_request as handle
    
    try:
        return handle(line)
    except Exception as e:
        return json.dumps({
            "ok": False,
            "agent": "dialog_memory_v2",
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
                "agent": "dialog_memory_v2",
                "error": str(e),
                "latency_ms": 0
            }, ensure_ascii=False)
            print(error_resp, flush=True)

