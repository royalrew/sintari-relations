#!/usr/bin/env python3
"""
B2 NormalizeAgent – Rensa brus/metadata (generisk, sv+en)
Mål: Loss < 2% av innehåll (tecken)
- Bevarar stycken, punktlistor och citat
- Normaliserar Unicode, radslut, whitespace, citattecken, ellips, tankstreck
- Lätt brusreduktion (dubbla mellanslag, överflödiga blankrader, upprepade skiljetecken)
- Valfri ”medium”/”aggressive” städning via payload.meta.level (default: light)
  * medium: trimma uppenbara tidsstämplar/speakertaggar (”[00:12]”, ”Person: …”)
  * aggressive: tar även bort URL:er/kodblock/epostadresser – OBS: kan öka loss
- Returnerar statistik + enkel förändringslogg
"""
import sys, json, time, re, unicodedata
from typing import Dict, Any, Tuple, List

AGENT_VERSION = "1.4.0"
AGENT_ID = "normalize"

# --- Regexer ---
RE_LINE_ENDINGS = re.compile(r'\r\n?')                      # CRLF/CR -> LF
RE_WS_TAILHEAD = re.compile(r'[ \t]+\n')                    # trailing spaces at EOL
RE_MULTI_BLANK = re.compile(r'\n{3,}')                      # 3+ blankrader -> 2
RE_MULTI_SPACE = re.compile(r'[ \t]{2,}')                   # 2+ spaces -> 1
RE_ELLIPSIS = re.compile(r'\.{3,}')                         # ... eller fler -> …
RE_MULTI_COMMA = re.compile(r',{2,}')                       # ,, -> ,
RE_MULTI_PUNC = re.compile(r'([!?]){2,}')                   # !!?? -> !
RE_DASH = re.compile(r'[–—]+')                              # en/em dash → —
RE_BULLET = re.compile(r'^[ \t]*([•·◦➤►▪])\s*', re.M)       # bullets -> '- '
RE_LEADING_TABS = re.compile(r'^[ \t]+', re.M)

# Citattecken → ASCII/typografiska konsekventa
QUOTE_MAP = {
    '“':'"', '”':'"', '„':'"', '«':'"', '»':'"', '‟':'"', '❝':'"', '❞':'"',
    '‘':'\'', '’':'\'', '‚':'\'', '‹':'\'', '›':'\''
}

# Valfria (medium/aggressive) brusmönster
RE_TIMESTAMP = re.compile(r'(?m)^\s*\[?\d{1,2}:\d{2}(:\d{2})?\]?\s*')     # [00:12] eller 00:12
RE_SPEAKER = re.compile(r'(?m)^\s*([A-ZÅÄÖa-zåäö][\w\- ]{0,20}):\s+')      # "Anna:" i början av rad
RE_EMAIL = re.compile(r'\b[\w\.-]+@[\w\.-]+\.\w+\b', re.I)
RE_URL = re.compile(r'https?://\S+|www\.\S+', re.I)
RE_CODE_FENCE = re.compile(r'```.*?```', re.S)

def _apply(text: str, regex: re.Pattern, repl: str, ops: List[str], label: str) -> str:
    new = regex.sub(repl, text)
    if new != text:
        ops.append(label)
    return new

def _map_quotes(text: str, ops: List[str]) -> str:
    table = str.maketrans(QUOTE_MAP)
    new = text.translate(table)
    if new != text:
        ops.append("quotes_normalized")
    return new

def _normalize_unicode(text: str, ops: List[str]) -> str:
    new = unicodedata.normalize("NFC", text or "")
    if new != text:
        ops.append("unicode_nfc")
    return new

def normalize_text(text: str, level: str = "light") -> Tuple[str, Dict[str,Any]]:
    """Förlustsnål normalisering. level: light|medium|aggressive"""
    ops: List[str] = []
    if not text:
        return "", {"original_len": 0, "normalized_len": 0, "loss_ratio": 0.0, "ops": ops}

    original = text

    # 0) Unicode + radslut
    text = _normalize_unicode(text, ops)
    text = _apply(text, RE_LINE_ENDINGS, '\n', ops, "line_endings_lf")

    # 1) Skala bort tydligt icke-innehåll (valfritt)
    if level in ("aggressive",):
        text = _apply(text, RE_CODE_FENCE, "\n", ops, "strip_code_fences")
        text = _apply(text, RE_URL, "", ops, "strip_urls")
        text = _apply(text, RE_EMAIL, "", ops, "strip_emails")

    if level in ("medium", "aggressive"):
        # Ta bort uppenbara tidsstämplar och speakertaggar i BÖRJAN av rader
        text = _apply(text, RE_TIMESTAMP, "", ops, "strip_timestamps_bol")
        text = _apply(text, RE_SPEAKER, "", ops, "strip_speaker_bol")

    # 2) Trimma per-rad: ledande blanks, trailing blanks
    text = _apply(text, RE_WS_TAILHEAD, '\n', ops, "trim_trailing_spaces")
    text = _apply(text, RE_LEADING_TABS, lambda m: m.group(0).replace('\t', ' '), ops, "tabs_to_spaces")

    # 3) Citat, ellips, skiljetecken, tankstreck
    text = _map_quotes(text, ops)
    text = _apply(text, RE_ELLIPSIS, '…', ops, "ellipsis_compact")
    text = _apply(text, RE_MULTI_COMMA, ',', ops, "comma_compact")
    text = _apply(text, RE_MULTI_PUNC, lambda m: m.group(1), ops, "punct_compact")
    text = _apply(text, RE_DASH, '—', ops, "dash_unify")

    # 4) Punktlistor → '- ' (behåll struktur)
    text = _apply(text, RE_BULLET, '- ', ops, "bullets_to_dash")

    # 5) Whitespace: bevara stycken (max 2 blankrader), komprimera mellanslag
    text = _apply(text, RE_MULTI_BLANK, '\n\n', ops, "blanklines_collapse")
    # Komprimera endast horisontellt WS som inte bryter ord-semantik
    text = _apply(text, RE_MULTI_SPACE, ' ', ops, "spaces_collapse")

    # 6) Trim helhet
    text = text.strip()

    # Stats
    orig_len = len(original)
    norm_len = len(text)
    loss_ratio = (orig_len - norm_len) / orig_len if orig_len > 0 else 0.0

    stats = {
        "original_len": orig_len,
        "normalized_len": norm_len,
        "loss_ratio": round(max(0.0, loss_ratio), 4),
        "ops": ops,
        "level": level
    }
    return text, stats

def run(payload):
    data = (payload.get("data") or {})
    meta = (payload.get("meta") or {})
    text = data.get("text", "") or ""
    level = (meta.get("level") or "light").lower()
    if level not in ("light","medium","aggressive"):
        level = "light"

    clean_text, stats = normalize_text(text, level=level)
    
    # Non-destructive fallback: om normaliserad text är tom men original inte är tom, använd original
    if not clean_text.strip() and text.strip():
        clean_text = text.strip()
        stats["ops"].append("fallback_to_original")

    # Check: Loss < 2% (tillåter marginellt över vid medium/aggressive men flaggar)
    pass_threshold = 0.02
    hard_pass = stats["loss_ratio"] <= pass_threshold

    emits = {
        "clean_text": clean_text,
        "normalization_stats": stats
    }
    checks = {
        "CHK-NORM-01": {"pass": hard_pass, "score": round(1.0 - min(1.0, stats["loss_ratio"]), 4)}
    }

    return {"ok": True, "emits": emits, "checks": checks}

# --- Main ---
if __name__ == "__main__":
    t0 = time.time()
    payload = json.loads(sys.stdin.read() or "{}")
    try:
        res = run(payload)
        res["version"] = f"{AGENT_ID}@{AGENT_VERSION}"
        res["latency_ms"] = int((time.time() - t0) * 1000)
        res["cost"] = {"usd": 0.002}
        print(json.dumps(res, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)
