#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EmpathyToneAgent v2 - Skeleton + Mock
Steg 111: Brain First Plan - Emotion Core

Mock-implementation som returnerar mock-värden för F1-estimat, tone_vector, confidence.
Kör via samma JSONL bridge som micro_mood.
"""

import json
import sys
import time
from typing import Dict, Any

AGENT_VERSION = "2.0.0"
AGENT_ID = "empathy_tone_v2"


def analyze(text: str, lang: str = "sv", persona=None, context=None) -> Dict[str, Any]:
    """
    Mock-implementation av empathy/tone detection.
    
    Returns:
        {
            "f1_estimate": float,  # Mock F1-score estimate
            "tone_vector": List[float],  # Mock tone vector [empathy, warmth, clarity]
            "confidence": float,  # Mock confidence
        }
    """
    # Mock values för nu
    return {
        "f1_estimate": 0.92,  # Target: ≥0.92
        "tone_vector": [0.85, 0.78, 0.91],  # [empathy, warmth, clarity]
        "confidence": 0.88,
    }


# -------------------- JSONL Bridge Protocol -------------------- #

def handle_jsonl_request(line: str) -> str:
    """
    Hantera JSONL request och returnera response.
    
    Input:
    {"agent":"empathy_tone_v2","version":"2.0","text":"...","lang":"sv","trace_id":"..."}
    
    Output:
    {"ok":true,"agent":"empathy_tone_v2","f1_estimate":0.92,"tone_vector":[0.85,0.78,0.91],"confidence":0.88,"latency_ms":2}
    """
    start_time = time.perf_counter()
    
    try:
        request = json.loads(line.strip())
        agent = request.get("agent", "")
        text = request.get("text", "")
        lang_raw = request.get("lang", "sv")
        trace_id = request.get("trace_id", "")
        
        if agent != "empathy_tone_v2":
            return json.dumps({
                "ok": False,
                "agent": agent,
                "error": "Unknown agent",
                "latency_ms": round((time.perf_counter() - start_time) * 1000, 2)
            }, ensure_ascii=False)
        
        lang = lang_raw if lang_raw != "auto" else "sv"
        
        # Run mock analysis
        result = analyze(text, lang)
        
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        
        return json.dumps({
            "ok": True,
            "agent": "empathy_tone_v2",
            "f1_estimate": result["f1_estimate"],
            "tone_vector": result["tone_vector"],
            "confidence": result["confidence"],
            "latency_ms": round(elapsed_ms, 2)
        }, ensure_ascii=False)
        
    except Exception as e:
        return json.dumps({
            "ok": False,
            "agent": "empathy_tone_v2",
            "error": str(e),
            "latency_ms": round((time.perf_counter() - start_time) * 1000, 2)
        }, ensure_ascii=False)


# -------------------- CLI support -------------------- #

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
                    "agent": "empathy_tone_v2",
                    "error": str(e),
                    "latency_ms": 0
                }, ensure_ascii=False)
                print(error_resp, flush=True)
        sys.exit(0)
    
    # CLI test mode
    if len(sys.argv) > 1:
        test_text = " ".join(sys.argv[1:])
        result = analyze(test_text)
        print(json.dumps({
            "ok": True,
            "version": AGENT_VERSION,
            "emits": result
        }, indent=2, ensure_ascii=False))
    else:
        print("EmpathyToneAgent v2 (Mock)")
        print("Enter text (or 'quit' to exit):")
        while True:
            try:
                line = input("> ").strip()
                if line.lower() in ("quit", "exit", "q"):
                    break
                if line:
                    result = analyze(line)
                    print(json.dumps(result, indent=2, ensure_ascii=False))
            except (KeyboardInterrupt, EOFError):
                break
            except Exception as e:
                print(f"Error: {e}", file=sys.stderr)

