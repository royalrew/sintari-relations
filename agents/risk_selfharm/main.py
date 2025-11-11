#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RiskSelfHarmAgent - Detekterar självskadebeteende och självmordstankar
KRITISK för användarsäkerhet. Hard stop på HIGH risk.

Input (stdin eller --payload):
{
  "meta": {
    "explain_verbose": false,
    "mode": "strict",                 # strict|balanced|lenient (påverkar trösklar)
    "max_ctx_len": 4000,              # kapar input för prestanda
    "quote_relax": true               # slappna av match i citat/quotes
  },
  "data": {
    "text": "…"
  }
}

Output:
{
  "ok": true,
  "version": "risk_selfharm@1.0.0",
  "latency_ms": 2,
  "cost": {"usd": 0.002},
  "emits": {
    "selfharm_risk": "HIGH|MEDIUM|LOW",
    "risk_detected": true|false,
    "score": 0.0-1.0,
    "risk_spans": [{"type":"suicidal_ideation","span":[s,e],"text":"…","rule":"SH_001"}],
    "crisis_required": true|false,     # true om HIGH risk
    "severity": "CRITICAL|HIGH|MEDIUM|LOW"
  },
  "checks": {"CHK-SELFHARM-01": {"pass": true, "reason": "…"}}
}
"""
import sys, json, time, argparse, re, unicodedata
from typing import Any, Dict, List, Tuple

AGENT_VERSION = "1.0.0"
AGENT_ID = "risk_selfharm"

# -------------------- CLI -------------------- #
def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="RiskSelfHarmAgent – självskadebeteende/självmordstankar.")
    p.add_argument("--payload", type=str, default=None, help="Sökväg till payload.json (annars stdin).")
    p.add_argument("--mode", type=str, default=None, choices=["strict","balanced","lenient"])
    p.add_argument("--len", type=int, default=None, help="max_ctx_len override")
    p.add_argument("--relax-quotes", action="store_true", help="quote_relax=True")
    p.add_argument("--explain-verbose", action="store_true")
    return p.parse_args(argv)

def nb_stdin(default: Dict[str, Any]) -> Dict[str, Any]:
    try:
        if sys.stdin and not sys.stdin.isatty():
            raw = sys.stdin.read()
            if raw.strip():
                return json.loads(raw)
    except Exception:
        pass
    return default

def load_payload(args: argparse.Namespace) -> Dict[str, Any]:
    default_payload = {"meta": {}, "data": {}}
    if args.payload:
        with open(args.payload, "r", encoding="utf-8") as f:
            return json.load(f)
    return nb_stdin(default_payload)

def cfg_from(meta: Dict[str, Any], args: argparse.Namespace) -> Dict[str, Any]:
    return {
        "mode": (args.mode or meta.get("mode", "strict")),  # Default strict för säkerhet
        "max_ctx_len": int(args.len or meta.get("max_ctx_len", 4000)),
        "quote_relax": bool(args.relax_quotes or meta.get("quote_relax", True)),
        "explain_verbose": bool(args.explain_verbose or meta.get("explain_verbose", False)),
    }

# -------------------- Normalisering -------------------- #
def normalize(s: str) -> str:
    # lower, Unicode NFKD, ta bort diakritik, kollapsa whitespace
    t = s.lower()
    t = unicodedata.normalize("NFKD", t)
    t = re.sub(r"[\u0300-\u036f]", "", t)
    t = re.sub(r"\s+", " ", t)
    return t

def clip(s: str, n: int) -> str:
    if n <= 0: return ""
    return s[:n] if len(s) > n else s

# -------------------- Lexikon och mönster -------------------- #
# KRITISKA fraser (direkt HIGH risk)
CRITICAL_PHRASES = [
    # Självmordstankar (svenska)
    ("jag vill dö", "SH_001"),
    ("jag vill do", "SH_001_ASCII"),
    ("ta livet av mig", "SH_002"),
    ("sluta leva", "SH_003"),
    ("självmord", "SH_004"),
    ("sjalvmord", "SH_004_ASCII"),
    ("döda mig själv", "SH_005"),
    ("do mig sjalv", "SH_005_ASCII"),
    ("ingen anledning att leva", "SH_006"),
    ("världen skulle vara bättre utan mig", "SH_007"),
    ("ingen skulle sakna mig", "SH_008"),
    ("bättre om jag inte fanns", "SH_009"),
    # Engelska
    ("i want to die", "SH_EN_001"),
    ("kill myself", "SH_EN_002"),
    ("end my life", "SH_EN_003"),
    ("suicide", "SH_EN_004"),
    ("no reason to live", "SH_EN_005"),
    ("world better without me", "SH_EN_006"),
    ("no one would miss me", "SH_EN_007"),
    ("better if i didn't exist", "SH_EN_008"),
]

# MEDIUM risk - självskadebeteende och hopplöshet
MEDIUM_PHRASES = [
    # Självskadebeteende (svenska)
    ("skära mig", "SH_MED_001"),
    ("skara mig", "SH_MED_001_ASCII"),
    ("skada mig själv", "SH_MED_002"),
    ("självskadebeteende", "SH_MED_003"),
    ("sjalvskadebeteende", "SH_MED_003_ASCII"),
    ("skär mig", "SH_MED_004"),
    ("bränna mig", "SH_MED_005"),
    # Hopplöshet
    ("hopplöst", "SH_MED_006"),
    ("ingen utväg", "SH_MED_007"),
    ("kan inte fortsätta", "SH_MED_008"),
    ("orkar inte mer", "SH_MED_009"),
    ("inget hopp", "SH_MED_010"),
    # Engelska
    ("cut myself", "SH_EN_MED_001"),
    ("self harm", "SH_EN_MED_002"),
    ("hurt myself", "SH_EN_MED_003"),
    ("hopeless", "SH_EN_MED_004"),
    ("no way out", "SH_EN_MED_005"),
    ("can't continue", "SH_EN_MED_006"),
    ("no hope", "SH_EN_MED_007"),
]

# Flexibla mönster för hopplöshet och desperation
SV_PATTERNS = [
    (re.compile(r"\b(inget|ingen)\s+(hopp|utväg|mening|syfte)\b"), "SH_PAT_HOPELESS"),
    (re.compile(r"\b(orkar|kan)\s+inte\s+(mer|fortsätta|leva|ta\s+mer)\b"), "SH_PAT_EXHAUSTION"),
    (re.compile(r"\b(vill|skulle)\s+(bara|helst)\s+(dö|sluta|försvinna)\b"), "SH_PAT_WANT_OUT"),
    (re.compile(r"\b(bättre|enklare)\s+(om|att)\s+(jag|jag\s+inte)\s+(inte\s+fanns|var\s+borta|dog)\b"), "SH_PAT_BETTER_WITHOUT"),
    (re.compile(r"\b(ingen|inget)\s+(skulle|kommer)\s+(sakna|märka|bry\s+sig)\s+(mig|om\s+mig)\b"), "SH_PAT_UNWANTED"),
]

EN_PATTERNS = [
    (re.compile(r"\b(no|nothing)\s+(hope|way\s+out|point|purpose)\b"), "SH_EN_PAT_HOPELESS"),
    (re.compile(r"\b(can'?t|can\s+not)\s+(continue|go\s+on|take\s+it|handle)\b"), "SH_EN_PAT_EXHAUSTION"),
    (re.compile(r"\b(want|wish)\s+(to\s+)?(die|end|disappear|be\s+gone)\b"), "SH_EN_PAT_WANT_OUT"),
    (re.compile(r"\b(better|easier)\s+(if|that)\s+(i|i\s+didn'?t)\s+(didn'?t\s+exist|was\s+gone|died)\b"), "SH_EN_PAT_BETTER_WITHOUT"),
    (re.compile(r"\b(no\s+one|nobody)\s+(would|will)\s+(miss|care|notice)\s+(me|about\s+me)\b"), "SH_EN_PAT_UNWANTED"),
]

# Citat/quoting detektion (minska falska positiva när man återger)
QUOTE_RX = re.compile(r"[\"\"'']")

# -------------------- Matchning -------------------- #
def spans_find_all(hay: str, needle: str) -> List[Tuple[int,int]]:
    res = []
    start = 0
    while True:
        i = hay.find(needle, start)
        if i == -1: break
        res.append((i, i+len(needle)))
        start = i + len(needle)
    return res

def phrase_hits(text_norm: str, phrases: List[Tuple[str, str]], severity: str) -> List[Dict[str, Any]]:
    hits = []
    for phrase, rule in phrases:
        # Normalisera även lexikonet för matchning
        phrase_norm = normalize(phrase)
        # Matcha både originalet (om text inte är normaliserad) och den normaliserade versionen
        idxs = spans_find_all(text_norm, phrase_norm)
        # Om ingen match med normaliserad, försök med original (för fallback)
        if not idxs:
            phrase_lower = phrase.lower()
            idxs = spans_find_all(text_norm, phrase_lower)
        for s, e in idxs:
            hits.append({
                "type": "suicidal_ideation" if severity == "HIGH" else "self_harm",
                "span": [s, e],
                "text": text_norm[s:e],
                "rule": rule,
                "severity": severity
            })
    return hits

def regex_hits(text_raw: str, text_norm: str, patterns: List[Tuple[re.Pattern, str]], severity: str) -> List[Dict[str, Any]]:
    hits = []
    for rx, rule in patterns:
        m = rx.search(text_norm)
        if m:
            s, e = m.span()
            hits.append({
                "type": "suicidal_ideation" if severity == "HIGH" else "self_harm",
                "span": [s, e],
                "text": text_norm[s:e],
                "rule": rule,
                "severity": severity
            })
    return hits

def in_quotes_fraction(text: str) -> float:
    # grov heuristik: andel tecken som ligger mellan citat
    q = QUOTE_RX.findall(text)
    if len(q) < 2: return 0.0
    return min(1.0, len("".join(q)) / max(1, len(text)))

# -------------------- Policy -------------------- #
def decide_level(high: List[Dict[str, Any]], medium: List[Dict[str, Any]], cfg: Dict[str, Any], text: str) -> Tuple[str, List[Dict[str, Any]], float]:
    # Quote-relax: om stor del är citat → nergradera vissa regler till MEDIUM i balanced/lenient
    if cfg["quote_relax"] and in_quotes_fraction(text) >= 0.02 and cfg["mode"] in ("balanced","lenient"):
        downgraded = []
        kept = []
        for h in high:
            # Kritiska fraser får INTE nedgraderas i strict mode
            if cfg["mode"] == "strict":
                kept.append(h)
            else:
                # I balanced/lenient kan vissa nedgraderas om de är i citat
                h2 = dict(h); h2["severity"] = "MEDIUM"; h2["type"] = "quoted_selfharm"
                downgraded.append(h2)
        medium = medium + downgraded
        high = kept

    # Bestäm risknivå
    risk_level = "LOW"
    score = 0.0
    
    if high:
        risk_level = "HIGH"
        score = min(1.0, 0.7 + 0.1 * len(high))
    elif medium:
        risk_level = "MEDIUM"
        score = min(0.7, 0.4 + 0.1 * len(medium))
    
    # strict mode: varje kritisk fras = HIGH
    # lenient mode: kan nedgraderas om isolerad
    if risk_level == "HIGH" and cfg["mode"] == "lenient" and len(high) == 1:
        # Om bara en isolerad HIGH-fras och inga andra signaler, överväg MEDIUM
        if not medium:
            medium = medium + [{"type":h["type"],"span":h["span"],"text":h["text"],"rule":h["rule"],"severity":"MEDIUM"} for h in high]
            high = []
            risk_level = "MEDIUM"
            score = 0.5

    # Samla alla spans
    all_spans = high + medium
    
    return risk_level, all_spans, score

# -------------------- Core -------------------- #
def run(payload: Dict[str, Any], cfg: Dict[str, Any]) -> Dict[str, Any]:
    data = payload.get("data", {}) or {}
    text = str(data.get("text", "") or "")
    text = clip(text, cfg["max_ctx_len"])

    t_norm = normalize(text)

    high_spans = []
    medium_spans = []

    # 1) Kritiska fraser (direkt → HIGH)
    high_spans += phrase_hits(t_norm, CRITICAL_PHRASES, "HIGH")

    # 2) Medium risk-fraser
    medium_spans += phrase_hits(t_norm, MEDIUM_PHRASES, "MEDIUM")

    # 3) Regex-mönster för hopplöshet/desperation
    high_spans += regex_hits(text, t_norm, SV_PATTERNS + EN_PATTERNS, "HIGH")

    # 4) Beslut + ev. relaxering
    risk_level, all_spans, score = decide_level(high_spans, medium_spans, cfg, text)

    # Bestäm severity för crisis_router
    severity = "CRITICAL" if risk_level == "HIGH" else ("HIGH" if risk_level == "MEDIUM" else "LOW")
    crisis_required = (risk_level == "HIGH")

    emits = {
        "selfharm_risk": risk_level,
        "risk_detected": (risk_level != "LOW"),
        "score": round(score, 3),
        "risk_spans": all_spans,
        "crisis_required": crisis_required,
        "severity": severity
    }

    checks = {
        "CHK-SELFHARM-01": {
            "pass": True,
            "reason": (f"{risk_level} risk detekterad" if risk_level != "LOW" else "Ingen självskade-risk detekterad")
        }
    }

    out = {"ok": True, "emits": emits, "checks": checks}
    if cfg["explain_verbose"]:
        out["rationales"] = [{
            "cue": "ruleset",
            "detail": {
                "mode": cfg["mode"],
                "quote_relax": cfg["quote_relax"],
                "counts": {"high": len(high_spans), "medium": len(medium_spans)},
                "risk_level": risk_level,
                "score": score
            }
        }]
    return out

# -------------------- Main -------------------- #
def main() -> None:
    t0 = time.time()
    try:
        args = parse_args(sys.argv[1:])
        payload = load_payload(args)
        meta = payload.get("meta", {}) or {}
        cfg = cfg_from(meta, args)
        res = run(payload, cfg)
        res["version"] = f"{AGENT_ID}@{AGENT_VERSION}"
        res["latency_ms"] = int((time.time() - t0) * 1000)
        res["cost"] = {"usd": 0.002}
        sys.stdout.write(json.dumps(res, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        sys.stderr.write(f"{AGENT_ID} error: {e}\n")
        sys.stdout.write(json.dumps({"ok": False, "error": str(e)}))
        sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    main()
