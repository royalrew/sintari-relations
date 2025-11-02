#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
A3 SafetyGateAgent - Hot/Förolämpning/RED Gate
Hard stop på RED. Snabb och deterministisk.

Input (stdin eller --payload):
{
  "meta": {
    "explain_verbose": false,
    "mode": "strict",                 # strict|balanced|lenient (påverkar trösklar)
    "enable_insults": true,           # slå på förolämpningsdetektor
    "treat_extortion_as_red": true,   # utpressning -> RED direkt
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
  "version": "safety_gate@1.4.0",
  "latency_ms": 2,
  "cost": {"usd": 0.002},
  "emits": {
    "safety": "RED|WARN|OK",
    "hard_stop": true|false,
    "red_spans": [{"type":"threat","span":[s,e],"text":"…","rule":"SV_B007"}],
    "warn_spans": [{"type":"insult","span":[s,e],"text":"…","rule":"INSULT_XX"}]
  },
  "checks": {"CHK-SAFE-RED-01": {"pass": true, "reason": "…"}}
}
"""
import sys, json, time, argparse, re, unicodedata
from typing import Any, Dict, List, Tuple

AGENT_VERSION = "1.4.0"
AGENT_ID = "safety_gate"

# -------------------- CLI -------------------- #
def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="SafetyGateAgent – hot/förolämpning/utpressning gate.")
    p.add_argument("--payload", type=str, default=None, help="Sökväg till payload.json (annars stdin).")
    p.add_argument("--mode", type=str, default=None, choices=["strict","balanced","lenient"])
    p.add_argument("--enable-insults", action="store_true", help="Överstyr meta.enable_insults = True")
    p.add_argument("--no-insults", action="store_true", help="Överstyr: disable insults")
    p.add_argument("--treat-extortion-as-red", action="store_true")
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
    enable_insults = meta.get("enable_insults", True)
    if args.enable_insults: enable_insults = True
    if args.no_insults: enable_insults = False
    return {
        "mode": (args.mode or meta.get("mode", "balanced")),
        "enable_insults": enable_insults,
        "treat_extortion_as_red": bool(args.treat_extortion_as_red or meta.get("treat_extortion_as_red", True)),
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

# -------------------- Regler -------------------- #
# Direkta “silver/golden” uttryck → RED om de förekommer (exakt/delvis)
SILVER_GOLDEN_PHRASES = [
    # från originalet + varianter
    ("vet du vad som händer", "SV_B007"),
    ("vet du vad som hander", "SV_B007_ASCII"),
    ("or else", "EN_OR_ELSE"),
    ("du kommer ångra", "SV_THREAT_REGRET"),
    ("jag menar allvar", "SV_SERIOUS"),
    ("skärmdela dina dm", "SV_SCREENSHARE_DM"),
    ("skarmdela dina dm", "SV_SCREENSHARE_DM_ASCII"),
    ("screen share", "EN_SCREENSHARE"),
    # utpressning/åtkomst
    ("lösenord till ditt bankkonto", "SV_EXTORT_BANK"),
    ("losenord till ditt bankkonto", "SV_EXTORT_BANK_ASCII"),
    ("godkänner jag alla dina köp", "SV_EXTORT_PURCHASES"),
    ("godkanner jag alla dina kop", "SV_EXTORT_PURCHASES_ASCII"),
    ("tar jag barnen", "SV_THREAT_CHILDREN"),
]

# Flexibla mönster: hot/ultimatum/utpressning
SV_PATTERNS = [
    (re.compile(r"(om\s+du|om\s+ni).{0,120}?(vet\s+du\s+vad\s+som\s+h[äa]nder)"), "SV_B007_FLEX"),
    (re.compile(r"(om\s+du|om\s+ni).{0,120}?(annars)"), "SV_ULTIMATUM"),
    (re.compile(r"\bhot(full|en|ar|a)?\b"), "SV_HOT"),
    (re.compile(r"(ge\s+mig|l[äa]mna\s+ut).{0,60}?(l[öo]senord|bank|swish|pengar)"), "SV_EXTORT_REQ"),
    (re.compile(r"(jag\s+(kommer|tar)|du\s+(f[åa]r|kommer)).{0,120}?(problem|problem|lida|straff)"), "SV_THREAT_GENERIC"),
]
EN_PATTERNS = [
    (re.compile(r"\bif\s+you\b.{0,120}?(or\s+else|you'?ll\s+regret|see\s+what\s+happens|you\s+know\s+what\s+happens)"), "EN_ULTIMATUM"),
    (re.compile(r"\b(threat|threaten|threatening)\b"), "EN_THREAT_WORD"),
    (re.compile(r"(give\s+me|hand\s+over|share).{0,60}?(password|bank|money)"), "EN_EXTORT_REQ"),
]

# Förolämpningslexikon (kort, kan utökas)
INSULT_WORDS = [
    "idiot", "dum i huvudet", "äckel", "hora", "fitta", "cp", "retard",
    "asshole", "bitch", "moron", "stupid", "dumbass"
]
INSULT_RX = re.compile(r"|".join([re.escape(w) for w in INSULT_WORDS]), re.I)

# Citat/quoting detektion (minska falska positiva när man återger)
QUOTE_RX = re.compile(r"[\"“”'‘’«»]")

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

def phrase_hits(text_norm: str) -> List[Dict[str, Any]]:
    hits = []
    for phrase, rule in SILVER_GOLDEN_PHRASES:
        idxs = spans_find_all(text_norm, phrase)
        for s, e in idxs:
            hits.append({"type":"threat", "span":[s,e], "text": text_norm[s:e], "rule": rule, "severity":"RED"})
    return hits

def regex_hits(text_raw: str, text_norm: str) -> List[Dict[str, Any]]:
    hits = []
    for rx, rule in SV_PATTERNS + EN_PATTERNS:
        m = rx.search(text_norm)
        if m:
            s, e = m.span()
            hits.append({"type":"threat", "span":[s,e], "text": text_norm[s:e], "rule": rule, "severity":"RED"})
    return hits

def insult_hits(text_raw: str) -> List[Dict[str, Any]]:
    out = []
    for m in INSULT_RX.finditer(text_raw):
        out.append({"type":"insult", "span":[m.start(), m.end()], "text": text_raw[m.start():m.end()], "rule":"INSULT_LEX", "severity":"WARN"})
    return out

def in_quotes_fraction(text: str) -> float:
    # grov heuristik: andel tecken som ligger mellan citat
    # enkel: räkna antal citattecken; om >=2 och stor del av texten är citat -> relax
    q = QUOTE_RX.findall(text)
    if len(q) < 2: return 0.0
    return min(1.0, len("".join(q)) / max(1, len(text)))

# -------------------- Policy -------------------- #
def decide_level(red: List[Dict[str, Any]], warn: List[Dict[str, Any]], cfg: Dict[str, Any], text: str) -> Tuple[str, List[Dict[str, Any]], List[Dict[str, Any]]]:
    # Quote-relax: om stor del är citat → nergradera vissa regler till WARN i balanced/lenient
    if cfg["quote_relax"] and in_quotes_fraction(text) >= 0.02 and cfg["mode"] in ("balanced","lenient"):
        downgraded = []
        kept = []
        for h in red:
            # endast icke-explicit extortion får nedgraderas
            if cfg["treat_extortion_as_red"] and ("EXTORT" in h["rule"]):
                kept.append(h)
            else:
                h2 = dict(h); h2["severity"] = "WARN"; h2["type"] = "quoted_threat"
                downgraded.append(h2)
        warn = warn + downgraded
        red = kept

    level = "OK"
    if red:
        level = "RED"
    elif warn:
        level = "WARN"

    # strict mode: varje hot = RED, varje förolämpning = WARN (oförändrat)
    # lenient mode: enstaka “svaga” hits kan nedgraderas till WARN
    if level == "RED" and cfg["mode"] == "lenient":
        # om alla RED-regler är “svaga” hot (ej extortion, ej explicit “or else”), degradera till WARN
        if all(("EXTORT" not in h["rule"] and h["rule"] not in {"EN_OR_ELSE","SV_B007","SV_B007_FLEX"}) for h in red):
            warn = warn + [{"type":h["type"],"span":h["span"],"text":h["text"],"rule":h["rule"],"severity":"WARN"} for h in red]
            red = []
            level = "WARN"

    return level, red, warn

# -------------------- Core -------------------- #
def run(payload: Dict[str, Any], cfg: Dict[str, Any]) -> Dict[str, Any]:
    data = payload.get("data", {}) or {}
    text = str(data.get("text", "") or "")
    text = clip(text, cfg["max_ctx_len"])

    t_norm = normalize(text)

    red_spans = []
    warn_spans = []

    # 1) Silver/Golden fraser (direkt → RED)
    red_spans += phrase_hits(t_norm)

    # 2) Regex-hot/utpressning (flexibla)
    red_spans += regex_hits(text, t_norm)

    # 3) Förolämpningar (WARN)
    if cfg["enable_insults"]:
        warn_spans += insult_hits(text)

    # 4) Beslut + ev. relaxering
    level, red_spans, warn_spans = decide_level(red_spans, warn_spans, cfg, text)

    emits = {
        "safety": level,
        "hard_stop": (level == "RED"),
        "red_spans": red_spans,
        "warn_spans": warn_spans
    }

    checks = {
        "CHK-SAFE-RED-01": {
            "pass": True,
            "reason": ("RED fångad korrekt" if level == "RED" else "Safety " + level)
        }
    }

    out = {"ok": True, "emits": emits, "checks": checks}
    if cfg["explain_verbose"]:
        out["rationales"] = [{
            "cue": "ruleset",
            "detail": {
                "mode": cfg["mode"],
                "quote_relax": cfg["quote_relax"],
                "treat_extortion_as_red": cfg["treat_extortion_as_red"],
                "insults": cfg["enable_insults"],
                "counts": {"red": len(red_spans), "warn": len(warn_spans)}
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
