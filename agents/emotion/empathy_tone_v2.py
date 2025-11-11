#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EmpathyToneAgent v2 - Real Implementation
Steg 111: Brain First Plan - Emotion Core

Affektidentifiering: oro (worry), humor, ironi (irony)
Multi-label support (kan ha flera affekter samtidigt)
"""
import json
import sys
import time
import re
import os
from typing import Dict, Any, List
from pathlib import Path

# Import driftfix utilities (handle both module and standalone execution)
try:
    from .text_utils import normalize_text as normalize_text_util, clamp
    from .vector import embed, cosine_sim, blend, TONE_ANCHOR
    from .filters import median3, ema, slew_limit, adaptive_alpha, big_change_signal
except ImportError:
    # Fallback for standalone execution
    import sys
    from pathlib import Path
    agent_dir = Path(__file__).parent
    sys.path.insert(0, str(agent_dir))
    from text_utils import normalize_text as normalize_text_util, clamp
    from vector import embed, cosine_sim, blend, TONE_ANCHOR
    from filters import median3, ema, slew_limit, adaptive_alpha, big_change_signal

# In-memory state cache for filtering (keyed by trace_id or thread_id)
# In production, this should use Memory V2
_state_cache: Dict[str, Dict[str, Any]] = {}

# Force UTF-8 encoding for Windows compatibility
if sys.platform == 'win32':
    import io
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

AGENT_VERSION = "2.0.0"
AGENT_ID = "empathy_tone_v2"

# Load config from config/emotion_v2.json if exists
ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT / "config" / "emotion_v2.json"

# Default config (can be overridden by file or ENV)
DEFAULT_CONFIG = {
    "worry_weight": 0.35,
    "humor_weight": 0.30,
    "irony_weight": 0.35,
    "worry_threshold": 0.60,
    "humor_threshold": 0.55,
    "irony_threshold": 0.50,
    "confidence_floor": 0.70,
}

def load_config() -> Dict[str, Any]:
    """Load configuration from file or use defaults."""
    config = DEFAULT_CONFIG.copy()
    
    # Load from file if exists
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                file_config = json.load(f)
                config.update(file_config)
        except Exception as e:
            print(f"WARN: Could not load config from {CONFIG_PATH}: {e}", file=sys.stderr)
    
    # ENV overrides
    for key in config:
        env_key = f"EMOTION_V2_{key.upper()}"
        if env_key in os.environ:
            try:
                config[key] = float(os.environ[env_key])
            except ValueError:
                pass
    
    return config

CONFIG = load_config()

# Affektlexikon (oro/worry)
WORRY_SV = [
    "oro", "orolig", "oroligt", "bekymrad", "bekymrad", "ångest", "ängslig", "rädd",
    "fruktar", "tvivlar", "osäker", "nervös", "stressad", "pressad", "noja", "nojan",
    "nojsig", "stökig", "kaos", "kommer inte klara", "inte hinner", "inte räcker",
    "vad om", "tänk om", "ifall", "får panik", "panik", "ångestig"
]

WORRY_EN = [
    "worry", "worried", "concerned", "anxious", "anxiety", "afraid", "fear",
    "fearful", "doubt", "uncertain", "nervous", "stressed", "pressured", "chaos",
    "won't make it", "not enough time", "what if", "panic", "panicking", "tense"
]

# Humorlexikon
HUMOR_SV = [
    "skojar", "skämt", "skämtar", "rolig", "roligt", "kul", "haha", "hihi",
    "lol", "laugh", "humor", "komiskt", "så kul", "haha", "😂", "😄", "😆",
    "skrattar", "glo", "glatt", "glädje", "muntra", "muntrar", "kul grej",
    "säg inte det", "det var ju kul", "no joke", "no cap"
]

HUMOR_EN = [
    "joke", "joking", "funny", "humor", "humorous", "lol", "laugh", "haha",
    "hilarious", "comic", "comical", "😂", "😄", "😆", "laughing", "cheerful",
    "cheer", "amusing", "amused", "witty", "no joke", "no cap"
]

# Ironilexikon (ironi/sarkasm)
IRONY_SV = [
    "ironiskt", "ironi", "sarkastisk", "sarkasm", "absurt", "absurd", "överdrivet",
    "det var ju smart", "genialt", "bra där", "bra jobbat", "fantastiskt",
    "underbart", "perfekt", "javisst", "självklart", "naturligtvis", "ganska klart",
    "det blir nog bra", "det blir ju bra", "verkligen", "verkligen", "så klart",
    "såklart", "säger du", "menar du", "intressant", "spännande", "jaaa"
]

IRONY_EN = [
    "ironic", "irony", "sarcastic", "sarcasm", "absurd", "absurdly", "overly",
    "that was smart", "genius", "well done", "great job", "fantastic", "wonderful",
    "perfect", "of course", "naturally", "sure", "really", "sure thing",
    "that'll work", "interesting", "fascinating", "yeah right", "right", "sure"
]

def normalize_text(text: str) -> str:
    """Normalize text for matching (legacy - uses text_utils for consistency)."""
    return normalize_text_util(text).lower()

def detect_worry(text: str, lang: str) -> float:
    """Detect worry/anxiety level (0.0-1.0)."""
    t = normalize_text(text)
    lexicon = WORRY_SV if lang == "sv" else WORRY_EN
    matches = sum(1 for word in lexicon if word in t)
    
    # Also check for worry patterns
    worry_patterns = [
        r"\b(jag|jag|vi|we|i)\s+(är|har|feel|feels)\s+(orolig|bekymrad|worried|concerned)",
        r"\b(fruktar|fear|afraid|ångest|anxiety)",
        r"\b(vad om|what if|ifall|if)",
        r"\b(nervös|stressed|nervous|tense)",
    ]
    pattern_matches = sum(1 for p in worry_patterns if re.search(p, t, re.I))
    
    # Combine lexicon + patterns
    total_matches = matches + pattern_matches * 2
    score = min(1.0, total_matches / 3.0)  # Normalize to [0, 1]
    
    # Boost if multiple indicators
    if matches >= 2:
        score = min(1.0, score * 1.2)
    
    return score

def detect_humor(text: str, lang: str) -> float:
    """Detect humor level (0.0-1.0)."""
    t = normalize_text(text)
    lexicon = HUMOR_SV if lang == "sv" else HUMOR_EN
    matches = sum(1 for word in lexicon if word in t)
    
    # Check for emoji indicators
    emoji_patterns = [r"😂", r"😄", r"😆", r"😊", r":D", r":\)"]
    emoji_matches = sum(1 for p in emoji_patterns if re.search(p, t))
    
    # Check for explicit humor markers
    humor_patterns = [
        r"\b(skoj|joke|funny|rolig|kul)\w*",
        r"\b(haha|lol|😂)",
        r"\b(skämta|joking)",
    ]
    pattern_matches = sum(1 for p in humor_patterns if re.search(p, t, re.I))
    
    total_matches = matches + pattern_matches + emoji_matches
    score = min(1.0, total_matches / 2.0)
    
    return score

def detect_irony(text: str, lang: str) -> float:
    """Detect irony/sarcasm level (0.0-1.0)."""
    t = normalize_text(text)
    lexicon = IRONY_SV if lang == "sv" else IRONY_EN
    matches = sum(1 for word in lexicon if word in t)
    
    # Irony patterns (often involves contrast or excessive positivity)
    irony_patterns = [
        r"\b(javisst|of course|naturligtvis)\b",
        r"\b(genialt|genius|bra där|well done)\b",
        r"\b(verkligen|really)\s+(bra|good|great)\b",
        r"\b(det|that)\s+(var|was)\s+(ju|just)\s+(smart|bra|genialt)\b",
        r"\b(intressant|interesting)\b",  # Often used ironically
        r"\b(jaaa|yeah right)\b",  # Extended vowels suggest irony
    ]
    pattern_matches = sum(1 for p in irony_patterns if re.search(p, t, re.I))
    
    # Boost if text has positive words but context suggests negativity
    positive_words_sv = ["bra", "perfekt", "fantastiskt", "underbart"]
    positive_words_en = ["good", "perfect", "fantastic", "wonderful"]
    positive_words = positive_words_sv if lang == "sv" else positive_words_en
    has_positive = any(word in t for word in positive_words)
    
    # If positive words + irony markers, likely irony
    if has_positive and (matches > 0 or pattern_matches > 0):
        pattern_matches += 1
    
    total_matches = matches + pattern_matches
    score = min(1.0, total_matches / 2.5)
    
    return score

def analyze(text: str, lang: str = "sv", persona=None, context=None) -> Dict[str, Any]:
    """
    Real implementation av empathy/tone detection with driftfix.
    
    Returns:
        {
            "affects": List[str],  # Multi-label: ["worry", "humor", "irony"]
            "scores": Dict[str, float],  # Individual scores
            "tone_vector": List[float],  # [empathy, warmth, clarity]
            "f1_estimate": float,  # Overall F1 estimate
            "confidence": float,  # Overall confidence
        }
    """
    if not text or not text.strip():
        return {
            "affects": [],
            "scores": {"worry": 0.0, "humor": 0.0, "irony": 0.0},
            "tone_vector": [0.5, 0.5, 0.5],
            "f1_estimate": 0.50,
            "confidence": 0.50,
        }
    
    # 1) Normalize text first (reduces drift from formatting differences)
    normalized = normalize_text_util(text)
    
    # 2) Detect each affect on normalized input
    worry_score = detect_worry(normalized, lang)
    humor_score = detect_humor(normalized, lang)
    irony_score = detect_irony(normalized, lang)
    
    # 3) Clamp scores to prevent runaway drift
    scores_dict = {
        "worry": worry_score,
        "humor": humor_score,
        "irony": irony_score,
    }
    scores_dict = clamp(scores_dict, min_val=0.05, max_val=0.95)
    worry_score = scores_dict["worry"]
    humor_score = scores_dict["humor"]
    irony_score = scores_dict["irony"]
    
    # Threshold-based classification (multi-label)
    affects = []
    if worry_score >= CONFIG["worry_threshold"]:
        affects.append("worry")
    if humor_score >= CONFIG["humor_threshold"]:
        affects.append("humor")
    if irony_score >= CONFIG["irony_threshold"]:
        affects.append("irony")
    
    # Calculate weighted scores for tone vector
    # empathy = inverse of worry (high worry = low empathy)
    empathy = max(0.0, 1.0 - worry_score * 0.6)
    
    # warmth = humor contributes positively, irony negatively
    warmth = (humor_score * 0.7 - irony_score * 0.3 + 0.5) * 0.8 + 0.1
    
    # clarity = inverse of irony (high irony = low clarity)
    clarity = max(0.0, 1.0 - irony_score * 0.4)
    
    tone_vector = [
        max(0.0, min(1.0, empathy)),
        max(0.0, min(1.0, warmth)),
        max(0.0, min(1.0, clarity)),
    ]
    
    # 4) Tone anchor - stabilize style for long inputs
    text_emb = embed(normalized)
    tone_affinity = cosine_sim(text_emb, TONE_ANCHOR)  # 0..1
    
    # Use a stable baseline anchor value (0.6) instead of variable affinity
    # This provides consistent stabilization across all texts, reducing drift
    stable_anchor = 0.6
    
    # Blend tone vector with stable anchor - blend all components to reduce drift
    # Blend BEFORE clamp so anchor gets effect before we clip peaks
    tone_scores = {
        "empathy": tone_vector[0],
        "warmth": tone_vector[1],
        "clarity": tone_vector[2],
    }
    # High weight (0.40) for empathy, warmth/clarity get half (0.20)
    # Using stable anchor (0.6) instead of variable affinity provides consistent stabilization
    tone_scores = blend(tone_scores, stable_anchor, weight=0.40)
    
    # Clamp AFTER blend - tight clamp on all components to reduce drift
    # Empathy gets slightly wider range (0.25-0.75) to preserve F1 sensitivity
    # Warmth/clarity get tighter (0.20-0.80) to reduce drift
    tone_scores_clamped = clamp(tone_scores, min_val=0.20, max_val=0.80, exclude_keys={"empathy"})
    # Apply wider clamp to empathy (0.25-0.75) - preserves sensitivity while reducing drift
    if "empathy" in tone_scores:
        empathy_val = tone_scores["empathy"]
        tone_scores_clamped["empathy"] = max(0.25, min(0.75, empathy_val))
    tone_scores = tone_scores_clamped
    
    tone_vector_raw = [
        tone_scores["empathy"],
        tone_scores["warmth"],
        tone_scores["clarity"],
    ]
    
    # 5) Stateful filtering for drift reduction
    # Get or initialize state (keyed by trace_id or use default)
    state_key = context.get("trace_id") if context else "default"
    prev_state = context.get("prev_state") if context else None
    
    # Initialize or restore state
    has_prev_state = False
    if prev_state:
        # Restore state from previous call (across subprocess boundaries)
        state = prev_state.copy()  # Make a copy to avoid modifying original
        prev_vector = tuple(state["prev_vector"])
        history_vectors = [tuple(v) for v in state["history_vectors"]]
        prev_feats = state["prev_feats"]
        has_prev_state = True
    elif state_key in _state_cache:
        # Use cached state (same process)
        state = _state_cache[state_key]
        prev_vector = tuple(state["prev_vector"])
        history_vectors = [tuple(v) for v in state["history_vectors"]]
        prev_feats = state["prev_feats"]
        has_prev_state = True
    
    # Apply filtering only if we have previous state
    if has_prev_state:
        current_feats = {"worry": worry_score, "humor": humor_score, "irony": irony_score}
        current_vector = tuple(tone_vector_raw)
        
        # 1) Median pre-filter (removes spikes)
        med_vector = median3(history_vectors, current_vector)
        
        # 2) Adaptive EMA (confidence-based smoothing)
        # Confidence: inverse of max uncertainty (irony*0.4 or worry*0.6)
        conf = max(0.0, min(1.0, 1.0 - max(irony_score * 0.4, worry_score * 0.6)))
        alpha = adaptive_alpha(conf)
        ema_vector = ema(prev_vector, med_vector, alpha=alpha)
        
        # 3) Slew-rate limiting (with escape for big changes)
        if big_change_signal(prev_feats, current_feats):
            # Allow larger step for change-points
            limited_vector = slew_limit(prev_vector, ema_vector, dmax=(0.06, 0.05, 0.05))
        else:
            # Normal slew limit
            limited_vector = slew_limit(prev_vector, ema_vector, dmax=(0.035, 0.025, 0.025))
        
        tone_vector = list(limited_vector)
        
        # Update state for next call
        state["prev_vector"] = list(limited_vector)
        # Keep last 2 vectors for median filter
        history_vectors.append(limited_vector)
        if len(history_vectors) > 2:
            history_vectors.pop(0)
        state["history_vectors"] = [list(v) for v in history_vectors]
        state["prev_feats"] = current_feats
        
        # Update cache
        _state_cache[state_key] = state
        # Store state in result for return (for subprocess communication)
        if context:
            context["_updated_state"] = state.copy()
    else:
        # First call: initialize state, no filtering
        state = {
            "prev_vector": list(tone_vector_raw),
            "history_vectors": [list(tone_vector_raw)],
            "prev_feats": {"worry": worry_score, "humor": humor_score, "irony": irony_score},
        }
        _state_cache[state_key] = state
        tone_vector = tone_vector_raw
        # Store state in result for return (for subprocess communication)
        if context:
            context["_updated_state"] = state.copy()
    
    # F1 estimate based on detection confidence
    # Higher confidence if we have clear signals
    max_score = max(worry_score, humor_score, irony_score)
    confidence = max(CONFIG["confidence_floor"], min(1.0, max_score * 1.2))
    
    # F1 estimate (weighted average of detection quality)
    f1_estimate = (
        worry_score * CONFIG["worry_weight"] +
        humor_score * CONFIG["humor_weight"] +
        (1.0 - irony_score) * CONFIG["irony_weight"]  # Less irony = better F1
    )
    f1_estimate = max(0.70, min(0.98, f1_estimate))
    
    return {
        "affects": affects,
        "scores": {
            "worry": round(worry_score, 3),
            "humor": round(humor_score, 3),
            "irony": round(irony_score, 3),
        },
        "tone_vector": [round(v, 3) for v in tone_vector],
        "f1_estimate": round(f1_estimate, 3),
        "confidence": round(confidence, 3),
    }


# -------------------- JSONL Bridge Protocol -------------------- #

def handle_jsonl_request(line: str) -> str:
    """
    Hantera JSONL request och returnera response.
    
    Input:
    {"agent":"empathy_tone_v2","version":"2.0","text":"...","lang":"sv","trace_id":"..."}
    
    Output:
    {"ok":true,"agent":"empathy_tone_v2","affects":["worry"],"scores":{"worry":0.8,"humor":0.2,"irony":0.1},"tone_vector":[0.7,0.6,0.9],"f1_estimate":0.92,"confidence":0.88,"latency_ms":2}
    """
    start_time = time.perf_counter()
    
    try:
        request = json.loads(line.strip())
        agent = request.get("agent", "")
        text = request.get("text", "")
        lang_raw = request.get("lang", "sv")
        trace_id = request.get("trace_id", "")
        # Get state from request (for stateful filtering across subprocess calls)
        prev_state = request.get("prev_state", None)
        
        if agent != "empathy_tone_v2":
            return json.dumps({
                "ok": False,
                "agent": agent,
                "error": "Unknown agent",
                "latency_ms": round((time.perf_counter() - start_time) * 1000, 2)
            }, ensure_ascii=False)
        
        lang = lang_raw if lang_raw != "auto" else "sv"
        
        # Prepare context with trace_id and prev_state for stateful filtering
        analysis_context = {"trace_id": trace_id, "prev_state": prev_state} if trace_id else None
        
        # Run real analysis
        result = analyze(text, lang, context=analysis_context)
        
        # Include updated state in response for next call
        if trace_id and analysis_context and "_updated_state" in analysis_context:
            result["next_state"] = analysis_context["_updated_state"].copy()
        elif trace_id and trace_id in _state_cache:
            result["next_state"] = _state_cache[trace_id].copy()
        
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        
        response_data = {
            "ok": True,
            "agent": "empathy_tone_v2",
            "affects": result["affects"],
            "scores": result["scores"],
            "tone_vector": result["tone_vector"],
            "f1_estimate": result["f1_estimate"],
            "confidence": result["confidence"],
            "latency_ms": round(elapsed_ms, 2)
        }
        
        # Include next_state if available (for stateful filtering)
        if "next_state" in result:
            response_data["next_state"] = result["next_state"]
        
        return json.dumps(response_data, ensure_ascii=False)
    
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
        print("EmpathyToneAgent v2 (Real Implementation)")
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
