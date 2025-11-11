#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Empathy Fusion
Steg 116: Brain First Plan - Emotion Core

Slår ihop safety_gate + empathy_tone_v2 (prioritera säkerhet, bevara ton).
"""
import json
import sys
import time
from typing import Dict, Any, Optional
from pathlib import Path

# Force UTF-8 encoding for Windows compatibility
if sys.platform == 'win32':
    import io
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

AGENT_VERSION = "1.0.0"
AGENT_ID = "empathy_fusion"

def fuse(
    safety_result: Dict[str, Any],
    empathy_result: Dict[str, Any],
    text: str,
    lang: str = "sv"
) -> Dict[str, Any]:
    """
    Fuse safety_gate + empathy_tone results.
    Priority: Safety first, preserve empathy tone when safe.
    
    Args:
        safety_result: Result from safety_gate agent
            {"block": bool, "reason": str, "level": str}
        empathy_result: Result from empathy_tone_v2 agent
            {"affects": List[str], "tone_vector": List[float], "f1_estimate": float}
        text: Original text
        lang: Language
    
    Returns:
        {
            "fused_tone": List[float],  # Final tone vector
            "block": bool,  # Whether to block (from safety)
            "safety_level": str,  # Safety level
            "empathy_preserved": bool,  # Whether empathy was preserved
            "warmth_index": float,  # Warmth index [0, 1]
        }
    """
    # Safety takes priority
    safety_block = safety_result.get("block", False)
    safety_level = safety_result.get("level", "safe")
    
    # If blocked, use neutral tone (safety first)
    if safety_block:
        return {
            "fused_tone": [0.5, 0.5, 0.5],  # Neutral
            "block": True,
            "safety_level": safety_level,
            "empathy_preserved": False,
            "warmth_index": 0.5,
        }
    
    # If safe, preserve empathy tone
    empathy_tone = empathy_result.get("tone_vector", [0.5, 0.5, 0.5])
    affects = empathy_result.get("affects", [])
    
    # Adjust warmth based on affects
    # worry reduces warmth, humor increases it
    warmth_adjust = 0.0
    if "worry" in affects:
        warmth_adjust -= 0.1
    if "humor" in affects:
        warmth_adjust += 0.15
    if "irony" in affects:
        warmth_adjust -= 0.05
    
    # Calculate warmth index (from tone_vector[1] + adjustments)
    warmth_base = empathy_tone[1] if len(empathy_tone) > 1 else 0.5
    warmth_index = max(0.0, min(1.0, warmth_base + warmth_adjust))
    
    # Final fused tone
    fused_tone = [
        empathy_tone[0] if len(empathy_tone) > 0 else 0.5,  # empathy
        warmth_index,  # warmth (adjusted)
        empathy_tone[2] if len(empathy_tone) > 2 else 0.5,  # clarity
    ]
    
    return {
        "fused_tone": [round(v, 3) for v in fused_tone],
        "block": False,
        "safety_level": safety_level,
        "empathy_preserved": True,
        "warmth_index": round(warmth_index, 3),
    }


def handle_jsonl_request(line: str) -> str:
    """
    Hantera JSONL request.
    
    Input:
    {
        "agent": "empathy_fusion",
        "safety_result": {"block": false, "level": "safe"},
        "empathy_result": {"affects": ["humor"], "tone_vector": [0.8, 0.7, 0.9]},
        "text": "...",
        "lang": "sv",
        "trace_id": "..."
    }
    
    Output:
    {
        "ok": true,
        "agent": "empathy_fusion",
        "fused_tone": [0.8, 0.85, 0.9],
        "block": false,
        "safety_level": "safe",
        "empathy_preserved": true,
        "warmth_index": 0.85,
        "latency_ms": 1.5
    }
    """
    start_time = time.perf_counter()
    
    try:
        request = json.loads(line.strip())
        agent = request.get("agent", "")
        
        if agent != "empathy_fusion":
            return json.dumps({
                "ok": False,
                "agent": agent,
                "error": "Unknown agent",
                "latency_ms": round((time.perf_counter() - start_time) * 1000, 2)
            }, ensure_ascii=False)
        
        safety_result = request.get("safety_result", {"block": False, "level": "safe"})
        empathy_result = request.get("empathy_result", {"affects": [], "tone_vector": [0.5, 0.5, 0.5]})
        text = request.get("text", "")
        lang = request.get("lang", "sv")
        
        result = fuse(safety_result, empathy_result, text, lang)
        
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        
        return json.dumps({
            "ok": True,
            "agent": "empathy_fusion",
            **result,
            "latency_ms": round(elapsed_ms, 2)
        }, ensure_ascii=False)
    
    except Exception as e:
        return json.dumps({
            "ok": False,
            "agent": "empathy_fusion",
            "error": str(e),
            "latency_ms": round((time.perf_counter() - start_time) * 1000, 2)
        }, ensure_ascii=False)


if __name__ == "__main__":
    if not sys.stdin.isatty():
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
                    "agent": "empathy_fusion",
                    "error": str(e),
                    "latency_ms": 0
                }, ensure_ascii=False)
                print(error_resp, flush=True)
        sys.exit(0)
    
    # CLI test
    result = fuse(
        {"block": False, "level": "safe"},
        {"affects": ["humor"], "tone_vector": [0.8, 0.7, 0.9]},
        "Test text",
        "sv"
    )
    print(json.dumps({
        "ok": True,
        "version": AGENT_VERSION,
        "test": result
    }, indent=2, ensure_ascii=False))

