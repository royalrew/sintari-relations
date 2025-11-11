"""
Language utilities for SV/EN parity and translation.
"""
from .language_bridge import (
    detect_language,
    translate,
    to_canonical_en,
    from_canonical,
)

__all__ = [
    "detect_language",
    "translate",
    "to_canonical_en",
    "from_canonical",
]

