"""
Persona Agent
PR4: Persona Agent (rule-based v1)

Heuristic-based persona detection from input text.
Outputs persona_hints for Tone Regularizer.
"""
import json
import sys
import time
import re
from typing import Dict, Any, Optional
from pathlib import Path

# Add parent directory to path for imports
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from schemas.persona_profile import PersonaProfile

AGENT_VERSION = "1.0.0"
AGENT_ID = "persona_agent"


def detect_persona(text: str, lang: str = "auto", session_meta: Optional[Dict[str, Any]] = None) -> PersonaProfile:
    """
    Detect persona from text using heuristics.
    
    Args:
        text: Input text
        lang: Language (auto-detect if "auto")
        session_meta: Optional session metadata
    
    Returns:
        PersonaProfile with detected characteristics
    """
    # Detect language if not provided
    if lang == "auto":
        has_swe = bool(re.search(r'[åäöÅÄÖ]', text))
        lang = "sv" if has_swe else "en"
    
    text_lower = text.lower()
    
    # Formality heuristics
    formal_indicators = [
        "herr", "fru", "ni", "er", "mig", "dem",
        "mr", "mrs", "madam", "sir", "please", "kindly"
    ]
    informal_indicators = [
        "tja", "hej", "du", "dig", "henne", "honom",
        "hey", "yo", "dude", "sure", "yeah"
    ]
    
    formality = 0.3  # default casual
    
    if any(indicator in text_lower for indicator in formal_indicators):
        formality = 0.7
    elif any(indicator in text_lower for indicator in informal_indicators):
        formality = 0.2
    
    # Warmth heuristics (emojis, exclamation marks)
    emoji_count = len(re.findall(r'[😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨😐😑😶🫥😮‍💨😮😯😲😴🤤😪😵😀😁😂🤣😃😄😅😆😇]', text))
    exclamation_count = text.count('!')
    
    warmth = 0.8  # default warm
    if emoji_count > 0 or exclamation_count > 2:
        warmth = min(0.9, warmth + (emoji_count * 0.1))
    elif exclamation_count == 0 and emoji_count == 0:
        warmth = 0.6
    
    # Directness heuristics (punctuation patterns)
    question_count = text.count('?')
    ellipsis_count = text.count('...')
    
    directness = 0.8  # default direct
    if ellipsis_count > 0 or (question_count > 2):
        directness = 0.5  # indirect/hesitant
    
    # Humor heuristics (laughing words, emojis)
    humor_indicators = [
        "haha", "hehe", "lol", "rofl", "😂", "🤣",
        "skoj", "rolig", "kul", "funny", "laugh"
    ]
    
    humor = 0.2  # default serious
    if any(indicator in text_lower for indicator in humor_indicators):
        humor = 0.6
    
    # Confidence based on indicators found
    indicators_found = sum([
        any(ind in text_lower for ind in formal_indicators + informal_indicators),
        emoji_count > 0 or exclamation_count > 1,
        question_count > 0 or ellipsis_count > 0,
        any(ind in text_lower for ind in humor_indicators)
    ])
    
    confidence = min(1.0, 0.5 + (indicators_found * 0.1))
    
    return PersonaProfile(
        lang=lang,
        formality=round(formality, 2),
        warmth=round(warmth, 2),
        directness=round(directness, 2),
        humor=round(humor, 2),
        confidence=round(confidence, 2)
    )


def analyze(text: str, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Analyze text and return persona profile.
    
    Args:
        text: Input text
        meta: Optional metadata
    
    Returns:
        Analysis result with persona_hints
    """
    if not text:
        return {
            "ok": False,
            "error": "Empty text",
            "persona_hints": None
        }
    
    lang = "auto"
    if meta and "language" in meta:
        lang = meta["language"]
    
    session_meta = meta.get("session_meta") if meta else None
    
    # Detect persona
    profile = detect_persona(text, lang=lang, session_meta=session_meta)
    
    return {
        "ok": True,
        "persona_hints": profile.model_dump_hints(),
        "confidence": profile.confidence,
        "emits": {
            "persona_profile": profile.model_dump(),
            "persona_hints": profile.model_dump_hints()
        }
    }


# -------------------- JSONL Bridge Protocol -------------------- #

def handle_jsonl_request(line: str) -> str:
    """
    Handle JSONL request.
    
    Input:
    {
        "agent": "persona_agent",
        "text": "...",
        "meta": {"language": "sv"},
        "trace_id": "..."
    }
    """
    start_time = time.perf_counter()
    
    try:
        request = json.loads(line.strip())
        agent = request.get("agent", "")
        
        if agent != "persona_agent":
            return json.dumps({
                "ok": False,
                "agent": agent,
                "error": "Unknown agent",
                "latency_ms": round((time.perf_counter() - start_time) * 1000, 2)
            }, ensure_ascii=False)
        
        text = request.get("text", "")
        meta = request.get("meta", {})
        
        result = analyze(text, meta)
        
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        result["latency_ms"] = round(elapsed_ms, 2)
        
        return json.dumps(result, ensure_ascii=False)
    
    except Exception as e:
        return json.dumps({
            "ok": False,
            "agent": "persona_agent",
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
                    "agent": "persona_agent",
                    "error": str(e),
                    "latency_ms": 0
                }, ensure_ascii=False)
                print(error_resp, flush=True)
        sys.exit(0)
    
    # CLI test
    print(f"PersonaAgent {AGENT_VERSION}")
    print("Enter text (or 'quit' to exit):")
    
    while True:
        try:
            line = input("> ").strip()
            if line.lower() in ("quit", "exit", "q"):
                break
            
            if not line:
                continue
            
            result = analyze(line)
            if result["ok"]:
                print(f"Persona: {json.dumps(result['persona_hints'], indent=2, ensure_ascii=False)}")
            else:
                print(f"Error: {result.get('error')}")
        
        except (KeyboardInterrupt, EOFError):
            break
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)

