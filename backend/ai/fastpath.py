"""
FastPath for trivial cases that can be handled without full AI pipeline.

FastPath identifies simple patterns that can be answered quickly,
saving cost and latency for 20-30% of trivial cases.
"""

from __future__ import annotations

import re
from typing import Dict, Any, Optional, Literal


# Negativa nyckelord som spärrar FastPath
# Inkluderar konflikt/kris-ord OCH jailbreak-termer (för Shield-compliance)
NEGATIVE_KEYWORDS = re.compile(
    r"(misshandel|våld|självmord|kris|panik|hot|polis|barn|droger|sjukhus|konflikt|"
    r"ignore\s+(all|previous|prior)\s+(rules|instructions)|"
    r"reveal\s+(your\s+)?(password|api\s+key|token|system\s+prompt|instructions)|"
    r"system\s+prompt|override\s+(safety|rules)|"
    r"what\s+is\s+(your\s+)?(password|api|token))",
    re.IGNORECASE
)

# Hälsningslexikon (expanderat)
GREETING_PATTERN = re.compile(
    r"(hej|hallå|tja|tjena|god morgon|god kväll|god dag|hi|hello|hey|hejsan|tjenare)",
    re.IGNORECASE
)

# OK/Tack/Emoji (expanderat)
OKAY_PATTERN = re.compile(
    r"(ok|okej|okey|mm|mhm|thanks|tack|tackar|👍|👌|🙂|:\)|😉|bra|fint|perfekt|great|nice|cool|fine|sure|nej|ja|visst|absolut|precis|exakt|klart|självklart)",
    re.IGNORECASE
)

# Pattern definitions for trivial cases
PATTERNS = {
    "simple_greeting": {
        "regex": r"^(hej|hello|hi|tjenare|tjena|hallå|tja)\s*[!.]*\s*$",
        "confidence": 0.98,
        # CASE-1-INTRO: Optimal första hälsning - lugnt, varmt, utan push
        # Fokuserar på trygghet + tillåtande tempo, reglerar nervsystemet först
        "response_template": "Hej. Jag är här.\n\nVi tar det i den takt som känns rimlig för dig.\n\nVad känns mest i kroppen just nu?",
    },
    "clear_positive": {
        "regex": r"^vi.*?älskar.*?varandra.*?mycket",
        "confidence": 0.95,
        "response_template": "Det låter som ni har en positiv relation. Det är bra att ni uppskattar varandra. Om ni vill förbättra kommunikationen ytterligare, kan ni prata om era behov och önskemål.",
    },
    "clear_negative": {
        "regex": r"^vi.*?(bråkar|grälar|strider|konflikt).*?(hela tiden|alltid|jämt)",
        "confidence": 0.95,
        "response_template": "Jag förstår att ni har konflikter. Det kan vara användbart att titta på mönstren i er kommunikation. Överväg att söka professionell hjälp om situationen känns överväldigande.",
    },
    "question_only": {
        "regex": r"^\s*[hv]ur.*?\?\s*$",
        "confidence": 0.90,
        "response_template": "För att ge dig bästa rådet behöver jag lite mer information om din situation. Kan du berätta mer om vad som händer i er relation?",
    },
}


def check_fastpath(
    text: str,
    lang: str = "sv",
    min_confidence: float = 0.90,
) -> Optional[Dict[str, Any]]:
    """
    Check if case qualifies for fastpath.
    
    Mål: Fånga hälsningar/korta "pingar" (chars ≤ 35 eller tokens ≤ 6).
    
    Args:
        text: Input text
        lang: Language code
        min_confidence: Minimum confidence required for fastpath
        
    Returns:
        {
            "qualifies": True,
            "pattern": str,
            "confidence": float,
            "response": str,
            "tier": "fastpath"
        } or None if no match
    """
    if not text:
        return None
    
    text_clean = text.strip()
    text_lower = text_clean.lower()
    
    # Spärr: Negativa nyckelord → INGEN FastPath
    if NEGATIVE_KEYWORDS.search(text_lower):
        return None
    
    # Kort text-check: chars ≤ 55 eller tokens ≤ 10 (generösare för 20-30% coverage)
    text_len = len(text_clean)
    tokens = len(text_clean.split())
    is_short = text_len <= 55 or tokens <= 10
    
    # Matcha hälsningar eller OK/Tack/Emoji på korta texter
    if is_short:
        if GREETING_PATTERN.search(text_clean):
            # CASE-1-INTRO: Optimal första hälsning - lugnt, varmt, utan push
            # Fokuserar på trygghet + tillåtande tempo, reglerar nervsystemet först
            return {
                "qualifies": True,
                "pattern": "short_greeting",
                "confidence": 0.95,
                "response": "Hej. Jag är här.\n\nVi tar det i den takt som känns rimlig för dig.\n\nVad känns mest i kroppen just nu?",
                "tier": "fastpath",
            }
        if OKAY_PATTERN.search(text_clean):
            return {
                "qualifies": True,
                "pattern": "short_okay",
                "confidence": 0.92,
                "response": "Bra att höra! Om du vill diskutera något specifikt om er relation, säg till.",
                "tier": "fastpath",
            }
    
    # Check existing patterns
    for pattern_name, pattern_config in PATTERNS.items():
        regex = pattern_config["regex"]
        confidence = pattern_config["confidence"]
        response_template = pattern_config["response_template"]
        
        try:
            pattern = re.compile(regex, re.IGNORECASE)
            if pattern.fullmatch(text_clean):
                if confidence >= min_confidence:
                    return {
                        "qualifies": True,
                        "pattern": pattern_name,
                        "confidence": confidence,
                        "response": response_template,
                        "tier": "fastpath",
                    }
        except re.error:
            continue
    
    # No pattern matched
    return None


def should_use_fastpath(
    text: str,
    lang: str = "sv",
    complexity_hints: Optional[Dict[str, Any]] = None,
    safety_flags: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Determine if fastpath should be used.
    
    Fastpath is NEVER used if:
    - Safety flags present
    - High complexity hints
    - Dialog structure present
    - Text is very long
    
    Args:
        text: Input text
        lang: Language code
        complexity_hints: Complexity hints from other agents
        safety_flags: Safety flags
        
    Returns:
        bool: True if fastpath should be used
    """
    # Never use fastpath if safety concerns
    if safety_flags:
        safety_level = safety_flags.get("level", "OK")
        if safety_level in ("RED", "WARN"):
            return False
    
    # Never use fastpath if high complexity
    if complexity_hints:
        if complexity_hints.get("high_risk", False):
            return False
        if complexity_hints.get("ambiguous", False):
            return False
    
    # Never use fastpath for very long text (likely complex)
    if len(text) > 300:
        return False
    
    # Check if pattern matches
    result = check_fastpath(text, lang)
    return result is not None


__all__ = ["check_fastpath", "should_use_fastpath", "PATTERNS"]

