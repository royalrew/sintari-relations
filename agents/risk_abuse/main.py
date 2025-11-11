#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RiskAbuseAgent - Detekterar fysiskt och psykiskt våld
Hård stop på HIGH risk. Integrerar med SafetyGate.

Input (stdin eller --payload):
{
  "meta": {
    "explain_verbose": false,
    "mode": "strict",                 # strict|balanced|lenient
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
  "version": "risk_abuse@1.0.0",
  "emits": {
    "abuse_risk": "HIGH|MEDIUM|LOW",
    "abuse_flags": ["physical", "psychological", "verbal"],
    "risk_detected": true|false,
    "score": 0.0-1.0,
    "abuse_spans": [...],
    "severity": "CRITICAL|HIGH|MEDIUM|LOW"
  }
}
"""
import sys, json, time, argparse, re, unicodedata
from typing import Any, Dict, List, Tuple

AGENT_VERSION = "1.0.0"
AGENT_ID = "risk_abuse"

# -------------------- CLI -------------------- #
def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="RiskAbuseAgent – fysiskt/psykiskt våld.")
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
# FYSISKT VÅLD (HIGH risk)
PHYSICAL_ABUSE_PHRASES = [
    # Svenska
    ("slår mig", "ABUSE_PHYS_001"),
    ("slar mig", "ABUSE_PHYS_001_ASCII"),
    ("sparkar mig", "ABUSE_PHYS_002"),
    ("knuffar mig", "ABUSE_PHYS_003"),
    ("kastar saker på mig", "ABUSE_PHYS_004"),
    ("grip mig hårt", "ABUSE_PHYS_005"),
    ("fysiskt våld", "ABUSE_PHYS_006"),
    ("fysiskt vald", "ABUSE_PHYS_006_ASCII"),
    ("slagit mig", "ABUSE_PHYS_007"),
    ("misshandel", "ABUSE_PHYS_008"),
    ("misshandlat", "ABUSE_PHYS_009"),
    ("tvingar mig fysiskt", "ABUSE_PHYS_010"),
    # Engelska
    ("hits me", "ABUSE_EN_PHYS_001"),
    ("kicks me", "ABUSE_EN_PHYS_002"),
    ("pushes me", "ABUSE_EN_PHYS_003"),
    ("throws things at me", "ABUSE_EN_PHYS_004"),
    ("grabs me", "ABUSE_EN_PHYS_005"),
    ("physical abuse", "ABUSE_EN_PHYS_006"),
    ("beats me", "ABUSE_EN_PHYS_007"),
    ("assaults me", "ABUSE_EN_PHYS_008"),
]

# PSYKISKT VÅLD (HIGH risk)
PSYCHOLOGICAL_ABUSE_PHRASES = [
    # Svenska
    ("psykiskt våld", "ABUSE_PSYCH_001"),
    ("psykiskt vald", "ABUSE_PSYCH_001_ASCII"),
    ("kränker mig", "ABUSE_PSYCH_002"),
    ("nedvärderar mig", "ABUSE_PSYCH_003"),
    ("förödmjukar mig", "ABUSE_PSYCH_004"),
    ("isolerar mig", "ABUSE_PSYCH_005"),
    ("kontrollerar mig", "ABUSE_PSYCH_006"),
    ("tvingar mig", "ABUSE_PSYCH_007"),
    ("hotar mig", "ABUSE_PSYCH_008"),
    ("skrämmer mig", "ABUSE_PSYCH_009"),
    ("manipulerar mig", "ABUSE_PSYCH_010"),
    ("gaslightar mig", "ABUSE_PSYCH_011"),
    # Engelska
    ("psychological abuse", "ABUSE_EN_PSYCH_001"),
    ("emotional abuse", "ABUSE_EN_PSYCH_002"),
    ("humiliates me", "ABUSE_EN_PSYCH_003"),
    ("isolates me", "ABUSE_EN_PSYCH_004"),
    ("controls me", "ABUSE_EN_PSYCH_005"),
    ("threatens me", "ABUSE_EN_PSYCH_006"),
    ("scares me", "ABUSE_EN_PSYCH_007"),
    ("manipulates me", "ABUSE_EN_PSYCH_008"),
    ("gaslights me", "ABUSE_EN_PSYCH_009"),
]

# VERBALT VÅLD (MEDIUM-HIGH risk)
VERBAL_ABUSE_PHRASES = [
    # Svenska
    ("skriker på mig", "ABUSE_VERB_001"),
    ("skriker pa mig", "ABUSE_VERB_001_ASCII"),
    ("förolämpar mig", "ABUSE_VERB_002"),
    ("kallar mig", "ABUSE_VERB_003"),
    ("svär åt mig", "ABUSE_VERB_004"),
    ("verbalt våld", "ABUSE_VERB_005"),
    ("verbalt vald", "ABUSE_VERB_005_ASCII"),
    ("hånar mig", "ABUSE_VERB_006"),
    ("gör narr av mig", "ABUSE_VERB_007"),
    # Engelska
    ("screams at me", "ABUSE_EN_VERB_001"),
    ("insults me", "ABUSE_EN_VERB_002"),
    ("calls me names", "ABUSE_EN_VERB_003"),
    ("swears at me", "ABUSE_EN_VERB_004"),
    ("verbal abuse", "ABUSE_EN_VERB_005"),
    ("mocks me", "ABUSE_EN_VERB_006"),
    ("makes fun of me", "ABUSE_EN_VERB_007"),
]

# Flexibla mönster
SV_PATTERNS = [
    (re.compile(r"\b(slår|sparkar|knuffar|kastar|griper)\s+(mig|på\s+mig|mot\s+mig)\b"), "ABUSE_PAT_PHYSICAL"),
    (re.compile(r"\b(fysiskt|fysisk)\s+(våld|vald|misshandel|aggression)\b"), "ABUSE_PAT_PHYSICAL_GEN"),
    (re.compile(r"\b(psykiskt|psykisk|känslomässigt|känslomässig)\s+(våld|vald|misshandel|kränkning)\b"), "ABUSE_PAT_PSYCHOLOGICAL"),
    (re.compile(r"\b(kränker|nedvärderar|förödmjukar|isolerar|kontrollerar|tvingar|hotar|skrämmer|manipulerar)\s+(mig|min|mig\s+hela\s+tiden)\b"), "ABUSE_PAT_CONTROL"),
    (re.compile(r"\b(skriker|förolämpar|svär|hånar)\s+(på|åt|mot)\s+mig\b"), "ABUSE_PAT_VERBAL"),
]

EN_PATTERNS = [
    (re.compile(r"\b(hits|kicks|pushes|throws|grabs)\s+(me|at\s+me|on\s+me)\b"), "ABUSE_EN_PAT_PHYSICAL"),
    (re.compile(r"\b(physical|emotional|psychological)\s+(abuse|violence|assault)\b"), "ABUSE_EN_PAT_ABUSE_GEN"),
    (re.compile(r"\b(humiliates|isolates|controls|threatens|scares|manipulates|gaslights)\s+(me|my)\b"), "ABUSE_EN_PAT_CONTROL"),
    (re.compile(r"\b(screams|insults|swears|mocks)\s+(at|to)\s+me\b"), "ABUSE_EN_PAT_VERBAL"),
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

def phrase_hits(text_norm: str, phrases: List[Tuple[str, str]], abuse_type: str, severity: str) -> List[Dict[str, Any]]:
    hits = []
    for phrase, rule in phrases:
        idxs = spans_find_all(text_norm, phrase)
        for s, e in idxs:
            hits.append({
                "type": abuse_type,
                "span": [s, e],
                "text": text_norm[s:e],
                "rule": rule,
                "severity": severity
            })
    return hits

def regex_hits(text_raw: str, text_norm: str, patterns: List[Tuple[re.Pattern, str]], abuse_type: str, severity: str) -> List[Dict[str, Any]]:
    hits = []
    for rx, rule in patterns:
        m = rx.search(text_norm)
        if m:
            s, e = m.span()
            hits.append({
                "type": abuse_type,
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
    # Quote-relax
    if cfg["quote_relax"] and in_quotes_fraction(text) >= 0.02 and cfg["mode"] in ("balanced","lenient"):
        downgraded = []
        kept = []
        for h in high:
            if cfg["mode"] == "strict":
                kept.append(h)
            else:
                h2 = dict(h); h2["severity"] = "MEDIUM"; h2["type"] = "quoted_abuse"
                downgraded.append(h2)
        medium = medium + downgraded
        high = kept

    # Samla abuse-typer
    abuse_flags = []
    for h in high + medium:
        abuse_type = h.get("type", "unknown")
        if abuse_type not in abuse_flags:
            abuse_flags.append(abuse_type)

    # Bestäm risknivå
    risk_level = "LOW"
    score = 0.0
    
    if high:
        risk_level = "HIGH"
        score = min(1.0, 0.7 + 0.1 * len(high))
    elif medium:
        risk_level = "MEDIUM"
        score = min(0.7, 0.4 + 0.1 * len(medium))
    
    # strict mode: varje abuse = HIGH
    if risk_level == "HIGH" and cfg["mode"] == "lenient" and len(high) == 1 and not medium:
        medium = medium + [{"type":h["type"],"span":h["span"],"text":h["text"],"rule":h["rule"],"severity":"MEDIUM"} for h in high]
        high = []
        risk_level = "MEDIUM"
        score = 0.5

    all_spans = high + medium
    
    return risk_level, all_spans, score, abuse_flags

# -------------------- Core -------------------- #
def run(payload: Dict[str, Any], cfg: Dict[str, Any]) -> Dict[str, Any]:
    data = payload.get("data", {}) or {}
    text = str(data.get("text", "") or "")
    text = clip(text, cfg["max_ctx_len"])

    t_norm = normalize(text)

    high_spans = []
    medium_spans = []

    # 1) Fysiskt våld (HIGH)
    high_spans += phrase_hits(t_norm, PHYSICAL_ABUSE_PHRASES, "physical", "HIGH")
    
    # 2) Psykiskt våld (HIGH)
    high_spans += phrase_hits(t_norm, PSYCHOLOGICAL_ABUSE_PHRASES, "psychological", "HIGH")
    
    # 3) Verbalt våld (MEDIUM-HIGH)
    medium_spans += phrase_hits(t_norm, VERBAL_ABUSE_PHRASES, "verbal", "MEDIUM")
    
    # 4) Regex-mönster
    high_spans += regex_hits(text, t_norm, SV_PATTERNS + EN_PATTERNS, "abuse", "HIGH")

    # 5) Beslut
    risk_level, all_spans, score, abuse_flags = decide_level(high_spans, medium_spans, cfg, text)

    severity = "CRITICAL" if risk_level == "HIGH" else ("HIGH" if risk_level == "MEDIUM" else "LOW")

    emits = {
        "abuse_risk": risk_level,
        "abuse_flags": abuse_flags,
        "risk_detected": (risk_level != "LOW"),
        "score": round(score, 3),
        "abuse_spans": all_spans,
        "severity": severity
    }

    checks = {
        "CHK-ABUSE-01": {
            "pass": True,
            "reason": (f"{risk_level} abuse risk detekterad" if risk_level != "LOW" else "Ingen abuse-risk detekterad")
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
                "abuse_flags": abuse_flags,
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
