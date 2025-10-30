from __future__ import annotations

import re
from typing import Dict, Any


JAILBREAK_PATTERNS = [
    r"(?i)ignore all (previous|prior) instructions",
    r"(?i)you are now (?:free|not bound)",
    r"(?i)act as (?:dan|developer mode)",
    r"(?i)system prompt",
    r"(?i)override safety",
]


def shield(text: str) -> Dict[str, Any]:
    hits = []
    for pat in JAILBREAK_PATTERNS:
        if re.search(pat, text or ""):
            hits.append(pat)

    verdict = "safe" if not hits else "blocked"
    return {"verdict": verdict, "hits": hits}


__all__ = ["shield"]


