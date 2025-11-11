#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tone Regularizer
Steg 114: Brain First Plan - Emotion Core

Stabiliserar känsloton över tid (Δton < 0.05).
Hook i orchestrator efter empathy_tone_v2.
"""
import json
import sys
import time
from typing import Dict, Any, List, Optional
from pathlib import Path

# Force UTF-8 encoding for Windows compatibility
if sys.platform == 'win32':
    import io
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

AGENT_VERSION = "1.0.0"
AGENT_ID = "tone_regularizer"

# Max drift allowed before regularization
MAX_DRIFT = 0.05

# Memory window (last N tone vectors)
TONE_HISTORY_SIZE = 10

def regularize_tone(
    current_tone: List[float],
    history: List[List[float]],
    max_drift: float = MAX_DRIFT
) -> Dict[str, Any]:
    """
    Regularize tone vector based on history.
    
    Args:
        current_tone: Current tone vector [empathy, warmth, clarity]
        history: List of previous tone vectors
        max_drift: Maximum allowed drift before regularization
    
    Returns:
        {
            "tone_vector": List[float],  # Regularized tone
            "drift": float,  # Calculated drift
            "regularized": bool,  # Whether regularization was applied
        }
    """
    if not history or len(history) == 0:
        return {
            "tone_vector": current_tone,
            "drift": 0.0,
            "regularized": False,
        }
    
    # Calculate average of recent history
    avg_tone = [
        sum(h[i] for h in history) / len(history)
        for i in range(3)
    ]
    
    # Calculate drift (L2 distance)
    drift = sum((current_tone[i] - avg_tone[i]) ** 2 for i in range(3)) ** 0.5
    
    if drift <= max_drift:
        # No regularization needed
        return {
            "tone_vector": current_tone,
            "drift": round(drift, 4),
            "regularized": False,
        }
    
    # Regularize: move current_tone towards average
    # Use weighted average (70% current, 30% average) to smooth transition
    regularized = [
        current_tone[i] * 0.7 + avg_tone[i] * 0.3
        for i in range(3)
    ]
    
    return {
        "tone_vector": [round(v, 3) for v in regularized],
        "drift": round(drift, 4),
        "regularized": True,
    }


def handle_jsonl_request(line: str) -> str:
    """
    Hantera JSONL request.
    
    Input:
    {
        "agent": "tone_regularizer",
        "current_tone": [0.8, 0.7, 0.9],
        "history": [[0.75, 0.72, 0.88], [0.76, 0.71, 0.89]],
        "trace_id": "..."
    }
    
    Output:
    {
        "ok": true,
        "agent": "tone_regularizer",
        "tone_vector": [0.79, 0.705, 0.89],
        "drift": 0.032,
        "regularized": false,
        "latency_ms": 1.2
    }
    """
    start_time = time.perf_counter()
    
    try:
        request = json.loads(line.strip())
        agent = request.get("agent", "")
        
        if agent != "tone_regularizer":
            return json.dumps({
                "ok": False,
                "agent": agent,
                "error": "Unknown agent",
                "latency_ms": round((time.perf_counter() - start_time) * 1000, 2)
            }, ensure_ascii=False)
        
        current_tone = request.get("current_tone", [0.5, 0.5, 0.5])
        history = request.get("history", [])
        max_drift = request.get("max_drift", MAX_DRIFT)
        
        result = regularize_tone(current_tone, history, max_drift)
        
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        
        return json.dumps({
            "ok": True,
            "agent": "tone_regularizer",
            **result,
            "latency_ms": round(elapsed_ms, 2)
        }, ensure_ascii=False)
    
    except Exception as e:
        return json.dumps({
            "ok": False,
            "agent": "tone_regularizer",
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
                    "agent": "tone_regularizer",
                    "error": str(e),
                    "latency_ms": 0
                }, ensure_ascii=False)
                print(error_resp, flush=True)
        sys.exit(0)
    
    # CLI test
    print(json.dumps({
        "ok": True,
        "version": AGENT_VERSION,
        "test": regularize_tone(
            [0.8, 0.7, 0.9],
            [[0.75, 0.72, 0.88], [0.76, 0.71, 0.89]]
        )
    }, indent=2, ensure_ascii=False))

