#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Soft Correction Agent
Steg 115: Brain First Plan - Emotion Core

Upptäcker missförstånd → 1 kort förtydligande + fråga.
Policy: Korrigera mjukt vid missförstånd.
"""
import json
import sys
import time
import re
from typing import Dict, Any, Optional
from pathlib import Path

# Force UTF-8 encoding for Windows compatibility
if sys.platform == 'win32':
    import io
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

AGENT_VERSION = "1.0.0"
AGENT_ID = "soft_correction"

# Missförståndsindikatorer
MISUNDERSTANDING_SV = [
    "förstår inte", "missförstår", "tolkade fel", "menade inte så",
    "inte vad jag sa", "fel tolkning", "tog fel", "missuppfattade",
    "intressant tolkning", "det var inte det jag menade"
]

MISUNDERSTANDING_EN = [
    "don't understand", "misunderstood", "misinterpreted", "that's not what I meant",
    "not what I said", "wrong interpretation", "took it wrong", "misread",
    "interesting interpretation", "that's not what I meant"
]

# Korrigeringstemplates (sv)
CORRECTION_TEMPLATES_SV = [
    "Jag tror det kan ha blivit lite otydligt – menade egentligen: {clarification}. Låt mig fråga: {question}",
    "Ursäkta otydligheten. Vad jag menade var: {clarification}. {question}",
    "Jag var otydlig – låt mig förtydliga: {clarification}. {question}",
]

# Korrigeringstemplates (en)
CORRECTION_TEMPLATES_EN = [
    "I think I may have been unclear – what I actually meant was: {clarification}. Let me ask: {question}",
    "Sorry for the confusion. What I meant was: {clarification}. {question}",
    "I was unclear – let me clarify: {clarification}. {question}",
]

def detect_misunderstanding(text: str, lang: str) -> bool:
    """Detect if text indicates a misunderstanding."""
    t = text.lower()
    indicators = MISUNDERSTANDING_SV if lang == "sv" else MISUNDERSTANDING_EN
    return any(indicator in t for indicator in indicators)

def extract_clarification(text: str, lang: str) -> str:
    """Extract the clarification part from text."""
    # Look for patterns like "menade X" or "meant X"
    patterns_sv = [
        r"menade\s+(.*?)(?:\.|$|,)",
        r"menade\s+egentligen\s+(.*?)(?:\.|$|,)",
        r"vad\s+jag\s+menade\s+var\s+(.*?)(?:\.|$|,)",
    ]
    patterns_en = [
        r"meant\s+(.*?)(?:\.|$|,)",
        r"what\s+i\s+meant\s+was\s+(.*?)(?:\.|$|,)",
        r"actually\s+meant\s+(.*?)(?:\.|$|,)",
    ]
    
    patterns = patterns_sv if lang == "sv" else patterns_en
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            return match.group(1).strip()
    
    # Fallback: extract after ":" or "–"
    for sep in [":", "–", "-", "—"]:
        if sep in text:
            parts = text.split(sep, 1)
            if len(parts) > 1:
                return parts[1].strip()
    
    return text.strip()[:50]  # First 50 chars as fallback

def generate_question(lang: str) -> str:
    """Generate a follow-up question."""
    questions_sv = [
        "Stämmer det bättre?",
        "Blir det tydligare nu?",
        "Fungerar det så bättre?",
        "Hänger du med nu?",
    ]
    questions_en = [
        "Does that work better?",
        "Is that clearer now?",
        "Does that make more sense?",
        "Does that help?",
    ]
    
    import random
    questions = questions_sv if lang == "sv" else questions_en
    return random.choice(questions)

def analyze(
    text: str,
    lang: str = "sv",
    previous_response: Optional[str] = None,
    context: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    Analyze if soft correction is needed.
    
    Returns:
        {
            "needs_correction": bool,
            "correction": Optional[str],  # Generated correction text
            "confidence": float,
        }
    """
    if not text:
        return {
            "needs_correction": False,
            "correction": None,
            "confidence": 0.0,
        }
    
    # Check if misunderstanding is detected
    has_misunderstanding = detect_misunderstanding(text, lang)
    
    if not has_misunderstanding:
        return {
            "needs_correction": False,
            "correction": None,
            "confidence": 0.0,
        }
    
    # Extract clarification
    clarification = extract_clarification(text, lang)
    question = generate_question(lang)
    
    # Generate correction
    templates = CORRECTION_TEMPLATES_SV if lang == "sv" else CORRECTION_TEMPLATES_EN
    import random
    template = random.choice(templates)
    correction = template.format(
        clarification=clarification,
        question=question
    )
    
    return {
        "needs_correction": True,
        "correction": correction,
        "confidence": 0.85,  # High confidence if misunderstanding detected
    }


def handle_jsonl_request(line: str) -> str:
    """
    Hantera JSONL request.
    
    Input:
    {
        "agent": "soft_correction",
        "text": "Jag förstår inte vad du menar",
        "lang": "sv",
        "previous_response": "...",
        "trace_id": "..."
    }
    
    Output:
    {
        "ok": true,
        "agent": "soft_correction",
        "needs_correction": true,
        "correction": "...",
        "confidence": 0.85,
        "latency_ms": 2.1
    }
    """
    start_time = time.perf_counter()
    
    try:
        request = json.loads(line.strip())
        agent = request.get("agent", "")
        
        if agent != "soft_correction":
            return json.dumps({
                "ok": False,
                "agent": agent,
                "error": "Unknown agent",
                "latency_ms": round((time.perf_counter() - start_time) * 1000, 2)
            }, ensure_ascii=False)
        
        text = request.get("text", "")
        lang = request.get("lang", "sv")
        previous_response = request.get("previous_response")
        context = request.get("context")
        
        result = analyze(text, lang, previous_response, context)
        
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        
        return json.dumps({
            "ok": True,
            "agent": "soft_correction",
            **result,
            "latency_ms": round(elapsed_ms, 2)
        }, ensure_ascii=False)
    
    except Exception as e:
        return json.dumps({
            "ok": False,
            "agent": "soft_correction",
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
                    "agent": "soft_correction",
                    "error": str(e),
                    "latency_ms": 0
                }, ensure_ascii=False)
                print(error_resp, flush=True)
        sys.exit(0)
    
    # CLI test
    result = analyze("Jag förstår inte vad du menade", "sv")
    print(json.dumps({
        "ok": True,
        "version": AGENT_VERSION,
        "test": result
    }, indent=2, ensure_ascii=False))

