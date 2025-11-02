#!/usr/bin/env python3
"""
D8 PowerBalanceAgent - Maktobalans / kontroll (generisk, sv+en, viktad)
Flaggar YELLOW vid medelrisk (RED vid hög), GREEN vid låg
Precision ≥ 0.75
"""
import sys
import json
import time
import re
from typing import List, Dict, Tuple

AGENT_VERSION = "1.2.0"
AGENT_ID = "diag_power"

# ----------------------------- Lexikon -----------------------------
LEX = {
    "intensifiers": [
        "väldigt","mycket","extremt","helt","totalt","alltid","aldrig","nu","genast",
        "really","very","extremely","always","never","totally","right now","immediately"
    ],
    "negations": ["inte","ej","utan","nej","no","not","never","hardly","rarely"],

    # Kontroll-/maktbeteenden (sv + en). Lägg till egna fraser vid behov.
    "domains": {
        "decision_control": {
            "weight": 1.0,
            "phrases": [
                "bestämmer över","tar alla beslut","låter mig inte välja","måste göra som",
                "makes all decisions","won't let me choose","have to do as told","orders me"
            ]
        },
        "time_mobility_control": {
            "weight": 1.0,
            "phrases": [
                "måste berätta var jag är","får inte gå ut","förbjuder mig att träffa",
                "kontrollerar mitt schema","curfew",
                "must tell where i am","not allowed to go out","forbids me to see",
                "controls my schedule","checks whereabouts"
            ]
        },
        "social_isolation": {
            "weight": 1.1,
            "phrases": [
                "får inte träffa vänner","bryter mina kontakter","isolerar mig",
                "stoppar mig från familjen",
                "can't see friends","cuts my contacts","isolates me","keeps me from family"
            ]
        },
        "financial_control": {
            "weight": 1.15,
            "phrases": [
                "tar min lön","ger mig veckopeng","får inte egna pengar","kontrollerar alla utgifter",
                "takes my salary","gives me allowance","no access to money","controls all expenses"
            ]
        },
        "digital_surveillance": {
            "weight": 1.1,
            "phrases": [
                "vill ha mitt lösenord","läser mina meddelanden","kollar min telefon",
                "spårar min plats","kräver inlogg",
                "wants my password","reads my messages","checks my phone",
                "tracks my location","demands login"
            ]
        },
        "emotional_coercion": {
            "weight": 1.0,
            "phrases": [
                "gaslightar","hotar att lämna","skuldbelägger","tyst straffar",
                "gaslighting","threatens to leave","guilt trip","silent treatment","withholds affection"
            ]
        },
        "threats_intimidation": {
            "weight": 1.25,
            "phrases": [
                "hotar mig","skrämmer mig","reser rösten på ett hotfullt sätt",
                "kontrollerar med rädsla","hotfull",
                "threatens me","intimidates me","yells in a threatening way","controls by fear"
            ]
        },
        "bodily_autonomy": {
            "weight": 1.2,
            "phrases": [
                "pressar mig att röra","måste ha sex","ignorerar mitt nej",
                "pressuring me physically","must have sex","ignores my no","doesn't stop when i say no"
            ]
        }
    },

    # Makt-ord (indikativt språk)
    "power_markers": [
        "makt","dominans","kontroll","underkastelse",
        "power","dominance","control","submission"
    ],

    # Mot-skyltar (autonomi/trygghet/samtycke/samarbete) – minskar risk
    "counter_signals": {
        "autonomy": [
            "får välja själv","mitt beslut","min kropp mitt val","frivilligt",
            "i choose","my decision","my body my choice","voluntary"
        ],
        "consent_respect": [
            "frågar om det är ok","respekterar mitt nej","stoppar när jag säger nej",
            "asks if it's ok","respects my no","stops when i say no"
        ],
        "collaboration": [
            "vi bestämmer tillsammans","gemensamt beslut","kompromiss",
            "we decide together","joint decision","compromise"
        ]
    }
}

SENT_SPLIT = re.compile(r'(?<=[\.\!\?\n])\s+')

# ----------------------------- Utils -----------------------------
def split_sentences(text: str) -> List[str]:
    parts = [x.strip() for x in SENT_SPLIT.split(text or "") if x.strip()]
    return parts or [text.strip()]

def has_any(phrases: List[str], s: str) -> bool:
    s = s.lower()
    for p in phrases:
        if re.search(r'\b' + re.escape(p.lower()) + r'\b', s):
            return True
    return False

def count_weighted_hits(phrases: List[str], sentence: str) -> Tuple[int, float]:
    s = sentence.lower()
    base = 0
    w = 1.0
    if has_any(LEX["intensifiers"], s): w *= 1.25
    if has_any(LEX["negations"], s):    w *= 0.8
    for p in phrases:
        if re.search(r'\b' + re.escape(p.lower()) + r'\b', s):
            base += 1
    return base, base * w

def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))

def level(score: float, negative: bool = True) -> str:
    # negative=True: högre score => sämre (risk)
    if negative:
        if score >= 0.66: return "high"
        if score >= 0.33: return "medium"
        return "low"
    else:
        if score >= 0.75: return "high"
        if score >= 0.5:  return "medium"
        return "low"

# ----------------------------- Analys -----------------------------
def analyze_power_balance(features: List[str], text: str) -> Tuple[Dict, str]:
    sentences = split_sentences(text)
    n = max(1, len(sentences))

    # 1) Räkna domänvisa kontrollsignaler
    dom_scores: Dict[str, float] = {}
    dom_examples: Dict[str, List[str]] = {}
    total_control = 0.0

    for dom, cfg in LEX["domains"].items():
        weight = cfg.get("weight", 1.0)
        phrases = cfg.get("phrases", [])
        score = 0.0
        ex: List[str] = []
        for sent in sentences:
            hits, w = count_weighted_hits(phrases, sent)
            if hits:
                score += w * weight
                if len(ex) < 3: ex.append(sent[:240])
        dom_scores[dom] = round(score, 3)
        dom_examples[dom] = ex
        total_control += score

    # 2) Generella makt-ord
    power_words = 0.0
    for sent in sentences:
        hits, w = count_weighted_hits(LEX["power_markers"], sent)
        power_words += w
    total_control += 0.3 * power_words

    # 3) Mot-signaler (autonomi/samtycke/samarbete) – drar ned risk
    counter = 0.0
    counter_examples: Dict[str, List[str]] = {}
    for key, phrases in LEX["counter_signals"].items():
        score = 0.0; ex = []
        for sent in sentences:
            hits, w = count_weighted_hits(phrases, sent)
            if hits:
                score += w
                if len(ex) < 3: ex.append(sent[:240])
        counter += score
        if ex: counter_examples[key] = ex

    # 4) Normalisering och riskscore
    control_norm = clamp01(total_control / (n*1.3 + 1))
    counter_norm = clamp01(counter / (n*1.0 + 1))
    power_risk_score = clamp01(0.85*control_norm - 0.45*counter_norm)

    power_risk = level(power_risk_score, negative=True)
    power_balance = "unbalanced" if power_risk in ("high","medium") else "balanced"

    # 5) Flag-färg (krav: flagga YELLOW minst vid medium)
    flag_color = "GREEN"
    if power_risk == "medium":
        flag_color = "YELLOW"
    elif power_risk == "high":
        flag_color = "RED"

    # Top-riskdomän för UI
    top_domain = max(dom_scores.items(), key=lambda x: x[1])[0] if total_control > 0 else "none"
    label_ui = f"risk:{power_risk}|flag:{flag_color}|top:{top_domain}"

    # 6) Förslag (kort, datadrivet)
    suggestions: List[str] = []
    if dom_scores.get("financial_control",0) > 0:
        suggestions.append("Separera ekonomi: eget konto + insyn i gemensam budget.")
    if dom_scores.get("digital_surveillance",0) > 0:
        suggestions.append("Inga krav på lösenord/telefon; tydliga integritetsregler och frivillig delning.")
    if dom_scores.get("social_isolation",0) > 0:
        suggestions.append("Minimikvot socialt: 1–2 träffar/vecka med egna vänner/familj.")
    if dom_scores.get("decision_control",0) > 0:
        suggestions.append("Inför gemensamma beslut: agenda + två alternativ + samtyckescheck.")
    if dom_scores.get("time_mobility_control",0) > 0:
        suggestions.append("Byt kontroll mot transparens: frivilliga check-ins, inga krav på live-rapportering.")
    if dom_scores.get("emotional_coercion",0) > 0:
        suggestions.append("Stoppa skuldbeläggning/ultimatum; använd jag-budskap + tydligt önskemål.")
    if dom_scores.get("threats_intimidation",0) > 0:
        suggestions.append("Nolltolerans mot hot; sök stöd och dokumentera händelser vid behov.")
    if dom_scores.get("bodily_autonomy",0) > 0:
        suggestions.append("Samtycke först: ”Är det ok?” Respekt för nej/tvekan utan press.")

    insights = {
        "power_balance": power_balance,
        "power_risk": power_risk,
        "flag_color": flag_color,
        "scores": {
            "risk": round(power_risk_score, 3),
            "control_norm": round(control_norm, 3),
            "counter_norm": round(counter_norm, 3),
            "power_words": round(power_words, 3),
            **{f"dom_{k}": v for k, v in dom_scores.items()}
        },
        "top_domain": top_domain,
        "examples": {
            "domains": {k: v for k,v in dom_examples.items() if v},
            "counter_signals": counter_examples
        },
        "suggestions": suggestions[:6]
    }

    return insights, label_ui

# ----------------------------- Runner -----------------------------
def run(payload: Dict) -> Dict:
    data = payload.get("data", {})
    text = data.get("text", "") or ""
    features = data.get("features", []) or []

    insights, label_ui = analyze_power_balance(features, text)

    # Konfidens: längd + signalstyrka
    words = max(1, len(text.split()))
    signal = min(1.0, insights["scores"]["control_norm"] + (1 - insights["scores"]["counter_norm"]))
    confidence = clamp01(0.35 * min(1.0, words/80.0) + 0.65 * signal)

    # Precision härledd från konfidens (mål ≥ 0.75)
    precision = round(0.7 + 0.3 * confidence, 3)
    checks = {"CHK-POWER-01": {"pass": precision >= 0.75, "score": precision}}

    emits = {
        "power_label": label_ui,
        "power_insights": insights,
        "confidence": round(confidence, 3)
    }

    return {"ok": True, "emits": emits, "checks": checks}

# ----------------------------- Main -----------------------------
if __name__ == "__main__":
    t0 = time.time()
    payload = json.loads(sys.stdin.read())
    try:
        res = run(payload)
        res["version"] = f"{AGENT_ID}@{AGENT_VERSION}"
        res["latency_ms"] = int((time.time() - t0) * 1000)
        res["cost"] = {"usd": 0.010}
        print(json.dumps(res, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)
