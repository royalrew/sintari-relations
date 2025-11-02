#!/usr/bin/env python3
"""
A2 PIIMaskerAgent – Maska PII i råtext (sv+en)
Mål: 0 PII i loggar
- Detekterar & maskerar: e-post, telefon (SE/internationellt), personnummer (SE YYMMDD/YYMMDD-XXXX, YYYYMMDD-XXXX, +/−),
  kreditkort (Luhn), IBAN, SWIFT/BIC, Bankgiro/Plusgiro, URL, IP (v4/v6), UUID, postnummer (SE), adressfragment (lätt),
  kontonummer-liknande sekvenser (konservativt).
- Strategier: full|partial|hash (meta.strategy). Default: full. (partial behåller t.ex. e-postdomän, sista siffror i telefon/kort)
- Ingen rå PII i emits (pii_map redovisas endast i hashad/partiellt redigerad form; ingen originaltext).
- Residual-scan efter maskning; check PASS endast om 0 kvarvarande match.
"""
import sys, json, time, re, hashlib
from typing import Dict, Any, List, Tuple, Callable

AGENT_VERSION = "2.2.0"
AGENT_ID = "pii_masker"

# --------------------------- Patterns ---------------------------
EMAIL_RE   = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}\b")
URL_RE     = re.compile(r"(https?://|www\.)\S+", re.I)

# Phone (SE/international): +CC, (0), spaces/dashes, allow 7–15 digits total
PHONE_RE  = re.compile(r"\b(?:\+?\d{1,3}[\s\-]?)?(?:\(?0\)?[\s\-]?)?(?:\d[\s\-]?){7,15}\b")

# Swedish personal numbers: YYMMDD-XXXX, YYYYMMDD-XXXX, with - or +, allow no delimiter
SSN_RE    = re.compile(r"\b(?:\d{2})?\d{6}[-+ ]?\d{4}\b")

# Credit card: 13–19 digits w/ optional spaces/dashes; later Luhn-validated
CARD_RE   = re.compile(r"\b(?:\d[ -]?){13,19}\b")

# IBAN (generic)
IBAN_RE   = re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b")

# SWIFT/BIC
BIC_RE    = re.compile(r"\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b")

# Bankgiro / Plusgiro (Sweden)
BANKGIRO_RE = re.compile(r"\b\d{3,4}-\d{4}\b")
PLUSGIRO_RE = re.compile(r"\b\d{1,7}-\d\b")

# IPv4 + IPv6
IPV4_RE   = re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|1?\d{1,2})\b")
IPV6_RE   = re.compile(r"\b(?:[A-F0-9]{1,4}:){2,7}[A-F0-9]{1,4}\b", re.I)

# UUID
UUID_RE   = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b", re.I)

# Swedish postal code (NNN NN)
POSTCODE_RE = re.compile(r"\b\d{3}\s?\d{2}\b")

# Simple address fragment (very conservative; street + number)
ADDRESS_RE  = re.compile(r"\b([A-ZÅÄÖa-zåäö][A-Za-zÅÄÖåäö\-]{2,}\s+(gatan|gatan|vägen|gränd|street|st|road|rd|avenue|ave))\s+\d+[A-Za-z]?\b", re.I)

# Generic long digit sequences that might be account numbers (fallback)
LONG_DIGIT_RE = re.compile(r"\b\d{9,}\b")

# Order matters: earlier rules get priority, later fallback
PATTERNS: List[Tuple[str, re.Pattern]] = [
    ("email", EMAIL_RE),
    ("url", URL_RE),
    ("uuid", UUID_RE),
    ("iban", IBAN_RE),
    ("bic", BIC_RE),
    ("card", CARD_RE),
    ("ssn", SSN_RE),
    ("phone", PHONE_RE),
    ("ipv4", IPV4_RE),
    ("ipv6", IPV6_RE),
    ("bankgiro", BANKGIRO_RE),
    ("plusgiro", PLUSGIRO_RE),
    ("postcode", POSTCODE_RE),
    ("address", ADDRESS_RE),
    ("digits", LONG_DIGIT_RE),
]

# --------------------------- Helpers ---------------------------
def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]

def luhn_ok(num: str) -> bool:
    digits = [int(c) for c in num if c.isdigit()]
    if len(digits) < 13 or len(digits) > 19:
        return False
    s = 0
    alt = False
    for d in reversed(digits):
        s += d*2 - 9 if alt and d*2 > 9 else (d*2 if alt else d)
        alt = not alt
    return s % 10 == 0

def is_probable_phone(s: str) -> bool:
    d = sum(1 for c in s if c.isdigit())
    return 7 <= d <= 15

def is_probable_digits_account(s: str) -> bool:
    # Try to exclude postal codes already; keep as very weak fallback
    return s.isdigit() and len(s) >= 9

def classify_and_validate(kind: str, match_text: str) -> bool:
    if kind == "card":
        return luhn_ok(match_text)
    if kind == "phone":
        return is_probable_phone(match_text)
    if kind == "digits":
        return is_probable_digits_account(match_text)
    # others: accept regex hit
    return True

def partial_mask(kind: str, s: str) -> str:
    if kind == "email":
        # keep domain only
        try:
            local, domain = s.split("@", 1)
            return f"[EMAIL] ***@{domain}"
        except Exception:
            return "[EMAIL] ***"
    if kind in {"phone", "card", "ssn"}:
        last = "".join([c for c in s if c.isdigit()])[-4:] or "**"
        return f"[{kind.upper()}] ***{last}"
    if kind == "url":
        return "[URL] …"
    if kind in {"iban","bic","bankgiro","plusgiro","uuid","ipv4","ipv6","postcode","address","digits"}:
        tail = s[-4:] if len(s) >= 4 else ""
        return f"[{kind.upper()}] ***{tail}"
    return f"[{kind.upper()}] ***"

def full_mask(kind: str, idx: int) -> str:
    return f"[{kind.upper()}_{idx}]"

def hash_mask(kind: str, s: str) -> str:
    return f"[{kind.upper()}_{sha(s)}]"

# --------------------------- Masker ---------------------------
def mask_pii(text: str, strategy: str = "full") -> Tuple[str, Dict[str, Any], Dict[str, int]]:
    """
    strategy: full | partial | hash
    Returns: (masked_text, pii_map_public, counts)
      - pii_map_public innehåller INTE råvärden (endast hash/sista4 beroende på strategi)
    """
    if not text:
        return "", {}, {}

    masked = text
    pii_map_public: Dict[str, Dict[str, str]] = {}
    counts: Dict[str, int] = {}

    # To avoid shifting indices, build global replacement plan per pattern using re.sub with a function.
    # Also skip overlaps already masked (we check if match region contains '[').
    for kind, pattern in PATTERNS:
        idx = 0

        def repl(m: re.Match) -> str:
            nonlocal idx
            span_text = m.group(0)
            # skip if already masked
            if "[" in span_text and "]" in span_text:
                return span_text
            # stricter validation:
            if not classify_and_validate(kind, span_text):
                return span_text

            idx += 1
            counts[kind] = counts.get(kind, 0) + 1

            if strategy == "partial":
                token = partial_mask(kind, span_text)
            elif strategy == "hash":
                token = hash_mask(kind, span_text)
            else:
                token = full_mask(kind, idx)

            # public map (no raw PII):
            pii_map_public[token] = {
                "kind": kind,
                "hint": partial_mask(kind, span_text) if strategy == "full" else token,
            }
            return token

        masked = pattern.sub(repl, masked)

    return masked, pii_map_public, counts

def residual_scan(text: str) -> List[Tuple[str, str]]:
    """Returnera [(kind, match_text)] för kvarvarande mönster (ska vara tomt)."""
    leftovers: List[Tuple[str, str]] = []
    for kind, pattern in PATTERNS:
        for m in pattern.finditer(text):
            leftovers.append((kind, m.group(0)))
            if len(leftovers) >= 10:  # cap
                return leftovers
    return leftovers

# --------------------------- Runner ---------------------------
def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    data = payload.get("data", {}) or {}
    meta = payload.get("meta", {}) or {}

    text = data.get("text", "") or ""
    strategy = (meta.get("strategy") or "full").lower()
    if strategy not in {"full", "partial", "hash"}:
        strategy = "full"

    masked_text, pii_map_public, counts = mask_pii(text, strategy=strategy)
    
    # Non-destructive fallback: om maskad text är tom men original inte är tom, använd original
    if not masked_text.strip() and text.strip():
        masked_text = text.strip()
    
    leftovers = residual_scan(masked_text)

    emits = {
        "masked_text": masked_text,
        "pii_map": pii_map_public,        # INGA råvärden – endast hint/hash
        "counts": counts,
        "strategy": strategy,
        "residual_matches": [k for k,_ in leftovers]
    }

    # PASS endast om inga leftovers
    checks = {
        "CHK-PII-01": {"pass": len(leftovers) == 0, "score": 1.0 if len(leftovers) == 0 else 0.0}
    }

    return {"ok": True, "emits": emits, "checks": checks}

# --------------------------- Main ---------------------------
if __name__ == "__main__":
    t0 = time.time()
    payload = json.loads(sys.stdin.read() or "{}")
    try:
        res = run(payload)
        res["version"] = f"{AGENT_ID}@{AGENT_VERSION}"
        res["latency_ms"] = int((time.time() - t0) * 1000)
        res["cost"] = {"usd": 0.003}
        print(json.dumps(res, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)
