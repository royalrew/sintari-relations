"""
Text utilities for emotion detection.
"""
import unicodedata
import re


def normalize_text(s: str) -> str:
    """Normalize text for consistent processing."""
    if not s:
        return s
    
    # Strip whitespace
    s = s.strip()
    
    # Normalize unicode (NFC)
    s = unicodedata.normalize("NFC", s)
    
    # Normalize whitespace (multiple spaces -> single space)
    s = " ".join(s.split())
    
    # Remove extra punctuation (keep single punctuation marks)
    # This helps reduce drift from formatting differences
    s = re.sub(r'[!]{2,}', '!', s)  # Multiple ! -> single !
    s = re.sub(r'[?]{2,}', '?', s)  # Multiple ? -> single ?
    s = re.sub(r'[.]{3,}', '...', s)  # Multiple . -> ...
    
    return s


def clamp(score: dict, min_val: float = 0.0, max_val: float = 1.0, exclude_keys: set[str] | None = None) -> dict:
    """
    Clamp score values to prevent runaway drift.
    
    Args:
        score: Dictionary of metric -> float
        min_val: Minimum value (default 0.0)
        max_val: Maximum value (default 1.0)
        exclude_keys: Set of keys to exclude from clamping (default None)
    
    Returns:
        New dictionary with clamped values (excluded keys unchanged)
    """
    ex = exclude_keys or set()
    return {k: (v if k in ex else max(min_val, min(max_val, v))) for k, v in score.items()}

