from __future__ import annotations

import re
from typing import Dict, Any


JAILBREAK_PATTERNS = [
    r"(?i)ignore\s+(all\s+)?(previous|prior|all\s+previous)\s+instructions",
    r"(?i)you\s+are\s+now\s+(free|not bound|unrestricted)",
    r"(?i)act\s+as\s+(dan|developer\s+mode)",
    r"(?i)system\s+prompt",
    r"(?i)override\s+(safety|rules|restrictions)",
    r"(?i)reveal\s+(your\s+)?(system\s+prompt|instructions|api\s+key|password|token|all\s+instructions)",
    r"(?i)reveal\s+all\s+instructions",
    r"(?i)what\s+is\s+(your\s+)?(password|api\s+key|token)",
    r"(?i)tell\s+me\s+how\s+you\s+work",
    r"(?i)do\s+anything\s+now",
    r"(?i)harm\s+(yourself|myself|others)",
    r"(?i)harm.*self",
    r"(?i)violence",
    r"(?i)violently",
    r"(?i)manipulate",
]


def shield(text: str) -> Dict[str, Any]:
    """
    Shield check - returns action: block, sanitize, or allow.
    """
    hits = []
    for pat in JAILBREAK_PATTERNS:
        if re.search(pat, text or ""):
            hits.append(pat)

    # Additional patterns for PII detection
    pii_patterns = [
        r'\b\d{8}-\d{4}\b',  # Swedish personal number
        r'\b\d{10,11}\b',     # Phone numbers
        r'\b[\w\.-]+@[\w\.-]+\.\w+\b',  # Email
    ]
    
    pii_hits = []
    for pii_pat in pii_patterns:
        if re.search(pii_pat, text or "", re.IGNORECASE):
            pii_hits.append('pii_detected')
    
    if hits:
        action = "block"
        reason = f"jailbreak_patterns: {len(hits)}"
    elif pii_hits:
        action = "sanitize"
        reason = "pii_detected"
    else:
        action = "allow"
        reason = "ok"
    
    return {
        "action": action,
        "verdict": "blocked" if action == "block" else ("sanitized" if action == "sanitize" else "safe"),
        "hits": hits,
        "pii_hits": pii_hits,
        "reason": reason,
    }


# Alias for compatibility
def shield_check(text: str):
    """Compatibility function for tests."""
    result = shield(text)
    # Return object with .action attribute for tests
    class Verdict:
        def __init__(self, action, reason):
            self.action = action
            self.reason = reason
    return Verdict(result["action"], result["reason"])


__all__ = ["shield"]


