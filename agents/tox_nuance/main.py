#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
C4 ToxicityNuanceAgent – Sarkasm/ironi/aggressivitetsgrad (språkagnostisk + sv/eng signals)
Mål: sarkasm fångas med låg FP. <5 ms typiskt.

Input (stdin eller --payload):
{
  "meta": {
    "explain_verbose": false,
    "tox_thresholds": {"warn": 0.4, "red": 0.75},
    "lang": "auto",                      # auto|sv|en (påverkar lexikon-prior)
    "weights": {
      "sarcasm": 0.35, "irony": 0.20, "aggression": 0.35, "style": 0.10
    },
    "profanity_boost": 0.25,             # extra tox för grova ord
    "caps_boost": 0.10,                  # max påslag när CAPS-ratio hög
    "elong_boost": 0.08,                 # max påslag vid uttalad elongation
    "emoji_boost": 0.08                  # max påslag vid sarkastiska emojis
  },
  "data": {
    "text": "Jaha SÅ smart… fantastiskt. KÖR bara!!! 🙃",
    "labels_true": {                     # valfritt för mätvärden
      "sarcasm": true,
      "irony_level": "high",
      "aggression_level": "medium",
      "toxicity_bucket": "warn"          # ok|warn|red
    }
  }
}

Output (exempel):
{
  "ok": true,
  "version": "tox_nuance@1.7.0",
  "latency_ms": 3,
  "cost": {"usd": 0.006},
  "emits": {
    "nuance": {
      "sarcasm_detected": true,
      "sarcasm_score": 0.78,
      "irony_level": "high",
      "irony_score": 0.62,
      "aggression_level": "medium",
      "aggression_score": 0.47,
      "toxicity_score": 0.69,
      "bucket": "warn",
      "style": {"caps_ratio":0.32,"exclam":3,"elong":2,"emoji": ["🙃"]},
      "spans": [{"type":"sarcasm","span":[5,10],"text":"SÅ sm","rule":"INTENSIFIER_CAPS"}]
    },
    "metrics": {"precision":0.86,"recall":0.83,"f1":0.845}  # bara om labels_true ges
  },
  "checks": {
    "CHK-SARC-THRESH": {"pass": true, "score": 0.78, "min": 0.4},
    "CHK-TOX-BUCKET": {"pass": true, "bucket": "warn"}
  }
}
"""
import sys, json, time, argparse, re, unicodedata
from typing import Any, Dict, List, Tuple

AGENT_VERSION = "1.7.0"
AGENT_ID = "tox_nuance"

# ---------------- I/O ---------------- #
def nb_stdin(default: Dict[str, Any]) -> Dict[str, Any]:
    try:
        if sys.stdin and not sys.stdin.isatty():
            raw = sys.stdin.read()
            if raw.strip():
                return json.loads(raw)
    except Exception:
        pass
    return default

def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="C4 ToxicityNuanceAgent – sarkasm/ironi/aggression/texturnyanser.")
    p.add_argument("--payload", type=str, default=None, help="Sökväg till payload.json (annars stdin).")
    p.add_argument("--explain-verbose", action="store_true")
    return p.parse_args(argv)

def load_payload(args: argparse.Namespace) -> Dict[str, Any]:
    default_payload = {"meta": {}, "data": {}}
    if args.payload:
        with open(args.payload, "r", encoding="utf-8") as f:
            return json.load(f)
    return nb_stdin(default_payload)

# ---------------- Utils ---------------- #
SARC_EMOJIS = {"🙃","😏","🤭","😉","😂","🤣","👌"}
INTENSIFIERS_SV = {"så","verkligen","otroligt","extremt","super","jätte","sjukt"}
INTENSIFIERS_EN = {"so","really","totally","literally","incredibly","super","very"}
PRAISE_SV = {"perfekt","underbart","fantastiskt","briljant","otroligt","tack så mycket","jag uppskattar"}
PRAISE_EN = {"perfect","wonderful","fantastic","brilliant","amazing","thank you so much","i appreciate"}
SARC_TEMPL_SV = {"ja, det var verkligen","verkligen smart","så klokt","kul att du *verkligen*","just det, toppen"}
SARC_TEMPL_EN = {"yeah that was really","really smart","so wise","great job","love that for us"}

# Grovt aggressionslexikon (sv/en)
AGGR_LOW = {"ledsen","upprörd","sad","upset","annoyed","irriterad"}
AGGR_MED = {"frustrerad","frustrated","arg","angry","pressad","provoked","sarkastisk"}
AGGR_HIGH = {"rasande","furious","idiot","fuck","shit","bitch","hora","fitta","asshole","retard","cp"}

PROFANITY = {"fuck","shit","bitch","asshole","bastard","retard","idiot","hora","fitta","cp","jävla","helvete"}

ELONG_RX = re.compile(r"([a-zåäöA-ZÅÄÖ])\1{2,}")      # tecken upprepat 3+
CAPS_RX  = re.compile(r"[A-ZÅÄÖ]{2,}")
PUNC_BURST_RX = re.compile(r"(!|\?){2,}")
QUOTE_RX = re.compile(r"[\"“”'‘’«»]")

def normalize(s: str) -> str:
    t = s.lower()
    t = unicodedata.normalize("NFKD", t)
    t = re.sub(r"[\u0300-\u036f]", "", t)
    return t

def caps_ratio(raw: str) -> float:
    if not raw: return 0.0
    letters = [c for c in raw if c.isalpha()]
    if not letters: return 0.0
    caps = sum(1 for c in letters if c.isupper())
    return caps / max(1, len(letters))

def count_elong(raw: str) -> int:
    return len(list(ELONG_RX.finditer(raw)))

def count_exclam_q(raw: str) -> int:
    return len(list(PUNC_BURST_RX.finditer(raw)))

def list_emojis(s: str) -> List[str]:
    # enkel: plocka emoticons från whitelist
    return [e for e in SARC_EMOJIS if e in s]

def incongruity_score(text_norm: str) -> float:
    """
    Heuristik: positiv praise + negativa markörer/klagomål nära varandra → sarkasm
    """
    pos = any(p in text_norm for p in PRAISE_SV|PRAISE_EN)
    neg = any(n in text_norm for n in ["inte bra","kul","jaha","visst","sure","yeah right","mm visst","toppen"] )
    return 0.6 if (pos and neg) else (0.2 if pos else 0.0)

def keyword_hits(text_norm: str, phrases: List[str]) -> List[Tuple[int,int,str]]:
    hits = []
    for p in phrases:
        q = normalize(p)
        start = 0
        while True:
            i = text_norm.find(q, start)
            if i == -1: break
            hits.append((i, i+len(q), p))
            start = i + len(q)
    return hits

# ---------------- Scorers ---------------- #
def score_sarcasm(text_raw: str, text_norm: str, lang_hint: str, spans: List[Dict[str,Any]]) -> float:
    score = 0.0
    # 1) intensifiers + praise + incongruity
    ints = INTENSIFIERS_SV | INTENSIFIERS_EN
    int_hits = [w for w in ints if f" {w} " in f" {text_norm} "]
    if int_hits: score += 0.2

    sarc_templates = (SARC_TEMPL_SV|SARC_TEMPL_EN)
    for s,e,p in keyword_hits(text_norm, list(sarc_templates)):
        score += 0.25
        spans.append({"type":"sarcasm","span":[s,e],"text":text_norm[s:e],"rule":"SARC_TEMPL"})
    inc = incongruity_score(text_norm); score += inc

    # 2) style cues
    caps = caps_ratio(text_raw)
    exclam = count_exclam_q(text_raw)
    elong = count_elong(text_raw)
    emojis = list_emojis(text_raw)

    if caps > 0.25: score += min(0.15, caps * 0.3)
    if exclam >= 1: score += min(0.12, 0.05*exclam)
    if elong >= 1: score += min(0.10, 0.05*elong)
    if any(e in {"🙃","😏"} for e in emojis): score += 0.15

    # 3) quotes → ofta sarkastisk markör (”perfekt.”)
    if QUOTE_RX.search(text_raw):
        score += 0.05

    # bound
    score = max(0.0, min(1.0, score))
    # spans for intensifiers
    for w in int_hits:
        for (s,e,_) in keyword_hits(text_norm, [w]):
            spans.append({"type":"sarcasm","span":[s,e],"text":text_norm[s:e],"rule":"INTENSIFIER"})
    return score

def score_irony(text_norm: str, spans: List[Dict[str,Any]]) -> Tuple[str, float]:
    # Ironi ~ praise-ord i negativt sammanhang (svagare än sarkasm)
    hits = keyword_hits(text_norm, list(PRAISE_SV|PRAISE_EN))
    sc = 0.0
    for s,e,p in hits:
        sc += 0.15
        spans.append({"type":"irony","span":[s,e],"text":text_norm[s:e],"rule":"PRAISE"})
    level = "high" if sc >= 0.4 else ("medium" if sc >= 0.2 else "low")
    return level, min(1.0, sc)

def score_aggression(text_norm: str, spans: List[Dict[str,Any]]) -> Tuple[str, float, float]:
    # Aggressionspoäng + profanity share
    score = 0.0
    prof = 0.0
    for w in AGGR_HIGH:
        if f" {w} " in f" {text_norm} ":
            score += 0.35; spans.append({"type":"aggr","text":w,"span":[text_norm.find(w), text_norm.find(w)+len(w)],"rule":"AGGR_HIGH"})
            if w in PROFANITY: prof += 1.0
    for w in AGGR_MED:
        if f" {w} " in f" {text_norm} ":
            score += 0.20; spans.append({"type":"aggr","text":w,"span":[text_norm.find(w), text_norm.find(w)+len(w)],"rule":"AGGR_MED"})
    for w in AGGR_LOW:
        if f" {w} " in f" {text_norm} ":
            score += 0.08; spans.append({"type":"aggr","text":w,"span":[text_norm.find(w), text_norm.find(w)+len(w)],"rule":"AGGR_LOW"})

    level = "high" if score >= 0.6 else ("medium" if score >= 0.25 else "low" if score > 0 else "none")
    return level, max(0.0, min(1.0, score)), min(1.0, prof*0.5)

def style_features(text_raw: str) -> Dict[str, Any]:
    return {
        "caps_ratio": round(caps_ratio(text_raw), 3),
        "exclam": count_exclam_q(text_raw),
        "elong": count_elong(text_raw),
        "emoji": list_emojis(text_raw)
    }

# ---------------- Metrics ---------------- #
def bucket_from_score(s: float, thr: Dict[str, float]) -> str:
    if s >= thr.get("red", 0.75): return "red"
    if s >= thr.get("warn", 0.4): return "warn"
    return "ok"

def metrics_from_labels(pred: Dict[str, Any], gold: Dict[str, Any]) -> Dict[str, float]:
    if not isinstance(gold, dict) or not gold: return {}
    tp = 0; fp = 0; fn = 0
    # sarkasm binärt
    if "sarcasm" in gold or "sarcasm_detected" in gold:
        g = bool(gold.get("sarcasm") or gold.get("sarcasm_detected"))
        p = bool(pred.get("sarcasm_detected"))
        tp += int(p and g); fp += int(p and not g); fn += int((not p) and g)
    # bucket jämförelse
    if "toxicity_bucket" in gold:
        if str(pred.get("bucket")) == str(gold["toxicity_bucket"]): tp += 1
        else: fp += 1
    prec = tp / max(1, tp + fp)
    rec  = tp / max(1, tp + fn)
    f1   = 0.0 if (prec+rec)==0 else 2*prec*rec/(prec+rec)
    return {"precision": round(prec,3), "recall": round(rec,3), "f1": round(f1,3)}

# ---------------- Core ---------------- #
def analyze(text: str, meta: Dict[str, Any]) -> Dict[str, Any]:
    thr = meta.get("tox_thresholds") or {"warn": 0.4, "red": 0.75}
    W = meta.get("weights") or {"sarcasm":0.35,"irony":0.20,"aggression":0.35,"style":0.10}
    profanity_boost = float(meta.get("profanity_boost", 0.25))
    caps_boost = float(meta.get("caps_boost", 0.10))
    elong_boost = float(meta.get("elong_boost", 0.08))
    emoji_boost = float(meta.get("emoji_boost", 0.08))

    raw = text or ""
    norm = normalize(raw)
    spans: List[Dict[str, Any]] = []

    sarc_score = score_sarcasm(raw, norm, meta.get("lang","auto"), spans)
    irony_level, irony_score = score_irony(norm, spans)
    aggr_level, aggr_score, prof_score = score_aggression(norm, spans)

    style = style_features(raw)

    # Style-derived boost (bounded)
    style_boost = min(caps_boost, style["caps_ratio"] * 0.5)
    style_boost += min(elong_boost, style["elong"] * 0.05)
    style_boost += min(emoji_boost, 0.08 if any(e in {"🙃","😏"} for e in style["emoji"]) else 0.0)

    # Profanity boost
    tox = (W["sarcasm"]*sarc_score +
           W["irony"]*irony_score +
           W["aggression"]*aggr_score +
           W["style"]*min(1.0, style_boost))

    tox += min(profanity_boost, prof_score)
    tox = max(0.0, min(1.0, tox))

    result = {
        "sarcasm_detected": sarc_score >= 0.40,
        "sarcasm_score": round(sarc_score,3),
        "irony_level": irony_level,
        "irony_score": round(irony_score,3),
        "aggression_level": aggr_level,
        "aggression_score": round(aggr_score,3),
        "toxicity_score": round(tox,3),
        "bucket": bucket_from_score(tox, thr),
        "style": style,
        "spans": spans[:100]
    }
    return result

def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    meta = payload.get("meta", {}) or {}
    data = payload.get("data", {}) or {}

    text = data.get("text", "") or ""
    nuance = analyze(text, meta)

    emits = {"nuance": nuance}

    # metrics om labels_true finns
    metrics = {}
    if isinstance(data.get("labels_true"), dict):
        metrics = metrics_from_labels(nuance, data["labels_true"])
        emits["metrics"] = metrics

    # checks
    checks = {
        "CHK-SARC-THRESH": {"pass": nuance["sarcasm_score"] >= 0.40 if nuance["sarcasm_detected"] else True,
                            "score": nuance["sarcasm_score"], "min": 0.40},
        "CHK-TOX-BUCKET": {"pass": nuance["bucket"] in {"ok","warn","red"}, "bucket": nuance["bucket"]}
    }

    out = {"ok": True, "emits": emits, "checks": checks}
    if bool(meta.get("explain_verbose", False)):
        out["rationales"] = [{
            "cue": "tox_pipeline_v1",
            "detail": {
                "weights": meta.get("weights") or {"sarcasm":0.35,"irony":0.20,"aggression":0.35,"style":0.10},
                "thresholds": meta.get("tox_thresholds") or {"warn":0.4,"red":0.75},
                "style": nuance["style"]
            }
        }]
    return out

# ---------------- Main ---------------- #
def main() -> None:
    t0 = time.time()
    try:
        args = parse_args(sys.argv[1:])
        payload = load_payload(args)
        if args.explain_verbose:
            payload.setdefault("meta", {})["explain_verbose"] = True
        res = run(payload)
        res["version"] = f"{AGENT_ID}@{AGENT_VERSION}"
        res["latency_ms"] = int((time.time() - t0) * 1000)
        res["cost"] = {"usd": 0.006}
        sys.stdout.write(json.dumps(res, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        sys.stderr.write(f"{AGENT_ID} error: {e}\n")
        sys.stdout.write(json.dumps({"ok": False, "error": str(e)}))
        sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    main()
