#!/usr/bin/env python3
"""Load emotion lexicon JSON with sane defaults + caching."""
import json
import functools
from pathlib import Path

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "lexicons" / "emotion_lexicon.json"

@functools.lru_cache(maxsize=4)
def load_lexicon(path: str | Path | None = None):
    """
    Load emotion lexicon from JSON file with caching.
    
    Args:
        path: Optional path to lexicon file. If None, uses default location.
    
    Returns:
        dict: Lexicon structure with RED, PLUS, PHRASES, etc.
    """
    if path is None:
        p = DEFAULT_PATH
    else:
        p = Path(path)
    
    if not p.exists():
        return {
            "RED": {"sv": [], "en": []},
            "RED_PHRASES": {"sv": [], "en": []},
            "ABUSE": {"sv": [], "en": []},
            "ABUSE_PHRASES": {"sv": [], "en": []},
            "PLUS": {"sv": [], "en": []},
            "PLUS_PHRASES": {"sv": [], "en": []},
            "NEUTRAL": {"sv": [], "en": []},
            "NEGATIONS": {"sv": [], "en": []},
            "MODIFIERS": {"boost": [], "dampen": []},
            "EMOJI": {"red": [], "plus": []},
            "WEIGHTS": {
                "unigram": {"red": 0.3, "plus": 0.25},
                "phrase": {"red": 0.6, "plus": 0.4},
                "emoji": {"red": 0.5, "plus": 0.25}
            }
        }
    
    return json.loads(p.read_text(encoding="utf-8"))

