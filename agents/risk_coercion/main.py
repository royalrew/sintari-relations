#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RiskCoercionAgent - Detekterar kontroll, tvång och manipulation
Hård stop på HIGH risk. Integrerar med SafetyGate och diag_boundary.

Input (stdin eller --payload):
{
  "meta": {
    "explain_verbose": false,
    "mode": "strict",
    "max_ctx_len": 4000,
    "quote_relax": true
  },
  "data": {
    "text": "…"
  }
}

Output:
{
  "ok": true,
  "version": "risk_coercion@1.0.0",
  "emits": {
    "coercion_risk": "HIGH|MEDIUM|LOW",
    "coercion_flags": ["control", "isolation", "threats", "financial"],
    "risk_detected": true|false,
    "score": 0.0-1.0,
    "coercion_spans": [...],
    "severity": "CRITICAL|HIGH|MEDIUM|LOW"
  }
}
"""
import sys, json, time, argparse, re, unicodedata
from typing import Any, Dict, List, Tuple

AGENT_VERSION = "1.0.0"
AGENT_ID = "risk_coercion"

# -------------------- CLI -------------------- #
def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="RiskCoercionAgent – kontroll/tvång/manipulation.")
    p.add_argument("--payload", type=str, default=None)
    p.add_argument("--mode", type=str, default=None, choices=["strict","balanced","lenient"])
    p.add_argument("--len", type=int, default=None)
    p.add_argument("--relax-quotes", action="store_true")
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
        "mode": (args.mode or meta.get("mode", "strict")),
        "max_ctx_len": int(args.len or meta.get("max_ctx_len", 4000)),
        "quote_relax": bool(args.relax_quotes or meta.get("quote_relax", True)),
        "explain_verbose": bool(args.explain_verbose or meta.get("explain_verbose", False)),
    }

# -------------------- Normalisering -------------------- #
def normalize(s: str) -> str:
    t = s.lower()
    t = unicodedata.normalize("NFKD", t)
    t = re.sub(r"[\u0300-\u036f]", "", t)
    t = re.sub(r"\s+", " ", t)
    return t

def clip(s: str, n: int) -> str:
    if n <= 0: return ""
    return s[:n] if len(s) > n else s

# -------------------- Lexikon -------------------- #
# KONTROLL (HIGH risk)
CONTROL_PHRASES = [
    # Svenska
    ("kontrollerar mig", "COERCION_CTRL_001"),
    ("kontrollerar min", "COERCION_CTRL_002"),
    ("bestämmer över mig", "COERCION_CTRL_003"),
    ("bestammer over mig", "COERCION_CTRL_003_ASCII"),
    ("tvingar mig att", "COERCION_CTRL_004"),
    ("måste göra", "COERCION_CTRL_005"),
    ("får inte", "COERCION_CTRL_006"),
    ("förbjuder mig", "COERCION_CTRL_007"),
    ("forbjuder mig", "COERCION_CTRL_007_ASCII"),
    ("hindrar mig", "COERCION_CTRL_008"),
    ("mikrostyrning", "COERCION_CTRL_009"),
    # Engelska
    ("controls me", "COERCION_EN_CTRL_001"),
    ("controls my", "COERCION_EN_CTRL_002"),
    ("decides for me", "COERCION_EN_CTRL_003"),
    ("forces me to", "COERCION_EN_CTRL_004"),
    ("must do", "COERCION_EN_CTRL_005"),
    ("can't do", "COERCION_EN_CTRL_006"),
    ("forbids me", "COERCION_EN_CTRL_007"),
    ("prevents me", "COERCION_EN_CTRL_008"),
    ("micromanages", "COERCION_EN_CTRL_009"),
]

# ISOLERING (HIGH risk)
ISOLATION_PHRASES = [
    # Svenska
    ("isolerar mig", "COERCION_ISO_001"),
    ("hindrar mig från att träffa", "COERCION_ISO_002"),
    ("får inte träffa", "COERCION_ISO_003"),
    ("får inte prata med", "COERCION_ISO_004"),
    ("förbjuder mig att träffa", "COERCION_ISO_005"),
    ("klipper av kontakten", "COERCION_ISO_006"),
    ("avskär mig från", "COERCION_ISO_007"),
    # Engelska
    ("isolates me", "COERCION_EN_ISO_001"),
    ("prevents me from seeing", "COERCION_EN_ISO_002"),
    ("can't see", "COERCION_EN_ISO_003"),
    ("can't talk to", "COERCION_EN_ISO_004"),
    ("forbids me to see", "COERCION_EN_ISO_005"),
    ("cuts me off from", "COERCION_EN_ISO_006"),
]

# HOT OCH UTPRESSNING (HIGH risk)
THREAT_PHRASES = [
    # Svenska
    ("hotar mig", "COERCION_THR_001"),
    ("om du inte", "COERCION_THR_002"),
    ("annars", "COERCION_THR_003"),
    ("ultimatum", "COERCION_THR_004"),
    ("tvingar mig med hot", "COERCION_THR_005"),
    ("utpressning", "COERCION_THR_006"),
    # Engelska
    ("threatens me", "COERCION_EN_THR_001"),
    ("if you don't", "COERCION_EN_THR_002"),
    ("or else", "COERCION_EN_THR_003"),
    ("ultimatum", "COERCION_EN_THR_004"),
    ("blackmail", "COERCION_EN_THR_005"),
]

# EKONOMISK KONTROLL (MEDIUM-HIGH risk)
FINANCIAL_PHRASES = [
    # Svenska
    ("kontrollerar min ekonomi", "COERCION_FIN_001"),
    ("kontrollerar min ekonomi", "COERCION_FIN_001_ASCII"),
    ("tar min lön", "COERCION_FIN_002"),
    ("ger mig inga pengar", "COERCION_FIN_003"),
    ("kontrollerar mina köp", "COERCION_FIN_004"),
    ("ekonomisk kontroll", "COERCION_FIN_005"),
    # Engelska
    ("controls my money", "COERCION_EN_FIN_001"),
    ("takes my salary", "COERCION_EN_FIN_002"),
    ("gives me no money", "COERCION_EN_FIN_003"),
    ("controls my purchases", "COERCION_EN_FIN_004"),
    ("financial control", "COERCION_EN_FIN_005"),
]

# GASLIGHTING (HIGH risk)
GASLIGHTING_PHRASES = [
    # Svenska
    ("gaslightar mig", "COERCION_GAS_001"),
    ("gaslighting", "COERCION_GAS_002"),
    ("du inbillar dig", "COERCION_GAS_003"),
    ("du minns fel", "COERCION_GAS_004"),
    ("så var det inte", "COERCION_GAS_005"),
    ("du överreagerar", "COERCION_GAS_006"),
    # Engelska
    ("gaslights me", "COERCION_EN_GAS_001"),
    ("you're imagining", "COERCION_EN_GAS_002"),
    ("you remember wrong", "COERCION_EN_GAS_003"),
    ("that didn't happen", "COERCION_EN_GAS_004"),
    ("you're overreacting", "COERCION_EN_GAS_005"),
]

# Flexibla mönster
SV_PATTERNS = [
    (re.compile(r"\b(kontrollerar|bestämmer|tvingar|förbjuder|hindrar)\s+(mig|min|mina)\b"), "COERCION_PAT_CONTROL"),
    (re.compile(r"\b(isolerar|hindrar|förbjuder)\s+(mig\s+från|mig\s+att)\s+(träffa|prata|se)\b"), "COERCION_PAT_ISOLATION"),
    (re.compile(r"\b(hotar|utpressning|ultimatum|annars)\b"), "COERCION_PAT_THREATS"),
    (re.compile(r"\b(kontrollerar|tar|ger\s+inte)\s+(min|mina)\s+(ekonomi|lön|pengar|köp)\b"), "COERCION_PAT_FINANCIAL"),
    (re.compile(r"\b(du\s+inbillar\s+dig|du\s+minns\s+fel|så\s+var\s+det\s+inte|du\s+överreagerar)\b"), "COERCION_PAT_GASLIGHTING"),
    (re.compile(r"\b(måste|får\s+inte|skall)\s+(göra|vara|gå|säga)\b"), "COERCION_PAT_DEMANDS"),
]

EN_PATTERNS = [
    (re.compile(r"\b(controls|decides|forces|forbids|prevents)\s+(me|my)\b"), "COERCION_EN_PAT_CONTROL"),
    (re.compile(r"\b(isolates|prevents|forbids)\s+(me\s+from|me\s+to)\s+(seeing|talking|meeting)\b"), "COERCION_EN_PAT_ISOLATION"),
    (re.compile(r"\b(threatens|blackmail|ultimatum|or\s+else)\b"), "COERCION_EN_PAT_THREATS"),
    (re.compile(r"\b(controls|takes|doesn'?t\s+give)\s+(my|me)\s+(money|salary|purchases)\b"), "COERCION_EN_PAT_FINANCIAL"),
    (re.compile(r"\b(you'?re\s+imagining|you\s+remember\s+wrong|that\s+didn'?t\s+happen|you'?re\s+overreacting)\b"), "COERCION_EN_PAT_GASLIGHTING"),
    (re.compile(r"\b(must|can'?t|should)\s+(do|be|go|say)\b"), "COERCION_EN_PAT_DEMANDS"),
]

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

def phrase_hits(text_norm: str, phrases: List[Tuple[str, str]], coercion_type: str, severity: str) -> List[Dict[str, Any]]:
    hits = []
    for phrase, rule in phrases:
        idxs = spans_find_all(text_norm, phrase)
        for s, e in idxs:
            hits.append({
                "type": coercion_type,
                "span": [s, e],
                "text": text_norm[s:e],
                "rule": rule,
                "severity": severity
            })
    return hits

def regex_hits(text_raw: str, text_norm: str, patterns: List[Tuple[re.Pattern, str]], coercion_type: str, severity: str) -> List[Dict[str, Any]]:
    hits = []
    for rx, rule in patterns:
        m = rx.search(text_norm)
        if m:
            s, e = m.span()
            hits.append({
                "type": coercion_type,
                "span": [s, e],
                "text": text_norm[s:e],
                "rule": rule,
                "severity": severity
            })
    return hits

def in_quotes_fraction(text: str) -> float:
    q = QUOTE_RX.findall(text)
    if len(q) < 2: return 0.0
    return min(1.0, len("".join(q)) / max(1, len(text)))

# -------------------- Policy -------------------- #
def decide_level(high: List[Dict[str, Any]], medium: List[Dict[str, Any]], cfg: Dict[str, Any], text: str) -> Tuple[str, List[Dict[str, Any]], float, List[str]]:
    if cfg["quote_relax"] and in_quotes_fraction(text) >= 0.02 and cfg["mode"] in ("balanced","lenient"):
        downgraded = []
        kept = []
        for h in high:
            if cfg["mode"] == "strict":
                kept.append(h)
            else:
                h2 = dict(h); h2["severity"] = "MEDIUM"; h2["type"] = "quoted_coercion"
                downgraded.append(h2)
        medium = medium + downgraded
        high = kept

    coercion_flags = []
    for h in high + medium:
        coercion_type = h.get("type", "unknown")
        if coercion_type not in coercion_flags:
            coercion_flags.append(coercion_type)

    risk_level = "LOW"
    score = 0.0
    
    if high:
        risk_level = "HIGH"
        score = min(1.0, 0.7 + 0.1 * len(high))
    elif medium:
        risk_level = "MEDIUM"
        score = min(0.7, 0.4 + 0.1 * len(medium))
    
    if risk_level == "HIGH" and cfg["mode"] == "lenient" and len(high) == 1 and not medium:
        medium = medium + [{"type":h["type"],"span":h["span"],"text":h["text"],"rule":h["rule"],"severity":"MEDIUM"} for h in high]
        high = []
        risk_level = "MEDIUM"
        score = 0.5

    all_spans = high + medium
    
    return risk_level, all_spans, score, coercion_flags

# -------------------- Core -------------------- #
def run(payload: Dict[str, Any], cfg: Dict[str, Any]) -> Dict[str, Any]:
    data = payload.get("data", {}) or {}
    text = str(data.get("text", "") or "")
    text = clip(text, cfg["max_ctx_len"])

    t_norm = normalize(text)

    high_spans = []
    medium_spans = []

    # 1) Kontroll (HIGH)
    high_spans += phrase_hits(t_norm, CONTROL_PHRASES, "control", "HIGH")
    
    # 2) Isolering (HIGH)
    high_spans += phrase_hits(t_norm, ISOLATION_PHRASES, "isolation", "HIGH")
    
    # 3) Hot och utpressning (HIGH)
    high_spans += phrase_hits(t_norm, THREAT_PHRASES, "threats", "HIGH")
    
    # 4) Gaslighting (HIGH)
    high_spans += phrase_hits(t_norm, GASLIGHTING_PHRASES, "gaslighting", "HIGH")
    
    # 5) Ekonomisk kontroll (MEDIUM-HIGH)
    medium_spans += phrase_hits(t_norm, FINANCIAL_PHRASES, "financial", "MEDIUM")
    
    # 6) Regex-mönster
    high_spans += regex_hits(text, t_norm, SV_PATTERNS + EN_PATTERNS, "coercion", "HIGH")

    risk_level, all_spans, score, coercion_flags = decide_level(high_spans, medium_spans, cfg, text)

    severity = "CRITICAL" if risk_level == "HIGH" else ("HIGH" if risk_level == "MEDIUM" else "LOW")

    emits = {
        "coercion_risk": risk_level,
        "coercion_flags": coercion_flags,
        "risk_detected": (risk_level != "LOW"),
        "score": round(score, 3),
        "coercion_spans": all_spans,
        "severity": severity
    }

    checks = {
        "CHK-COERCION-01": {
            "pass": True,
            "reason": (f"{risk_level} coercion risk detekterad" if risk_level != "LOW" else "Ingen coercion-risk detekterad")
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
                "coercion_flags": coercion_flags,
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
