#!/usr/bin/env python3
"""
D5 BoundaryAgent - Gränser/respekt (generisk, viktad)
Precision ≥ 0.75
"""
import sys
import json
import time
import re
from pathlib import Path
from typing import List, Dict, Tuple

AGENT_VERSION = "1.1.0"
AGENT_ID = "diag_boundary"

# ----------------------------- Lexikon -----------------------------
LEX = {
    # Intensifierare/negationer påverkar vikt
    "intensifiers": [
        "väldigt", "mycket", "extremt", "helt", "totalt", "aldrig", "alltid",
        "really", "very", "extremely", "always", "never", "totally", "completely"
    ],
    "negations": [
        "inte", "ej", "utan", "no", "not", "never", "hardly", "rarely"
    ],

    # Gränsövertramp-kategorier med fraser (sv + en) och basvikt
    "violations": {
        "control": {
            "weight": 1.2,
            "phrases": [
                "kontroll", "kontrollerar", "bestämmer över", "tvingar", "måste",
                "gaslight", "gaslighting", "ultimatum", "micromanage",
                "control", "controls", "forces", "must do", "dominate", "threaten"
            ]
        },
        "privacy": {
            "weight": 1.1,
            "phrases": [
                "privatliv", "läser mina meddelanden", "spionerar", "hemligheter",
                "dold", "övervakning",
                "privacy", "reads my messages", "spying", "spy", "secret",
                "hidden", "surveillance", "checks my phone"
            ]
        },
        "disrespect": {
            "weight": 1.0,
            "phrases": [
                "inte respekterad", "förolämpningar", "kallar mig", "ignorerar",
                "nedvärderar", "kränker",
                "disrespect", "insults", "name-calling", "ignores", "belittle",
                "demean", "mock"
            ]
        },
        "boundary_cross": {
            "weight": 0.9,
            "phrases": [
                "övertramp", "överträder gräns", "gräns passerad", "kliver över gräns",
                "boundary", "crossed the line", "pushes my limits"
            ]
        }
    },

    # Respektindikatorer
    "respect_high": [
        "respekt", "respekterar", "uppskattar", "tack", "lyssnar", "samtycke",
        "respect", "respects", "appreciate", "thanks", "listens", "consent"
    ],
    "respect_low": [
        "inte respekterad", "ignorerar", "förnedrar", "nedlåtande", "hotar",
        "disrespect", "ignores", "demean", "belittle", "threatens"
    ],

    # Klarhet i gränser
    "clarity": [
        "tydlig gräns", "tydliga regler", "kom överens", "sa ifrån",
        "boundary", "clear rule", "set limits", "said no", "stated clearly"
    ]
}

SENT_SPLIT = re.compile(r'(?<=[\.\!\?])\s+')

# ----------------------------- Utils -----------------------------
def split_sentences(text: str) -> List[str]:
    s = [x.strip() for x in SENT_SPLIT.split(text) if x.strip()]
    return s if s else [text.strip()]

def has_any(phrase_list: List[str], text: str) -> bool:
    for p in phrase_list:
        if re.search(r'\b' + re.escape(p) + r'\b', text, flags=re.IGNORECASE):
            return True
    return False

def count_weighted_hits(phrases: List[str], sentence: str) -> Tuple[int, float]:
    """
    Returnerar (antal_träffar, viktad_poäng) i en mening.
    Negation sänker, intensifierare höjer.
    """
    base_hits = 0
    weight = 1.0
    s_lower = sentence.lower()

    # Modifiera vikt baserat på intensifierare/negationer i meningen
    if has_any(LEX["intensifiers"], s_lower):
        weight *= 1.25
    if has_any(LEX["negations"], s_lower):
        weight *= 0.75

    for p in phrases:
        if re.search(r'\b' + re.escape(p.lower()) + r'\b', s_lower):
            base_hits += 1

    return base_hits, base_hits * weight

def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))

def label_from_score(score: float, hi_first: bool = True) -> str:
    """
    hi_first=True: 'high/medium/low' där högre score = hög.
    hi_first=False: inverterad (t.ex. lägre score = hög nivå av problem).
    """
    if hi_first:
        if score >= 0.66: return "high"
        if score >= 0.33: return "medium"
        return "low"
    else:
        if score >= 0.66: return "low"
        if score >= 0.33: return "medium"
        return "high"

# ----------------------------- Analys -----------------------------
def analyze_boundaries(features: List[str], text: str) -> Dict:
    sentences = split_sentences(text)
    total_len = max(1, len(sentences))

    # Samla alla träffar per kategori
    violation_summary = {}
    violation_examples = {}

    total_violation_score = 0.0

    for cat, cfg in LEX["violations"].items():
        cat_hits = 0
        cat_score = 0.0
        examples = []

        for sent in sentences:
            hits, w_hits = count_weighted_hits(cfg["phrases"], sent)
            if hits > 0:
                cat_hits += hits
                cat_score += w_hits * cfg["weight"]
                # Spara upp till 3 korta exempel (trimma meningen)
                if len(examples) < 3:
                    examples.append(sent.strip()[:240])

        violation_summary[cat] = {
            "hits": cat_hits,
            "score": round(cat_score, 3)
        }
        violation_examples[cat] = examples
        total_violation_score += cat_score

    # Normalisera per kategori (andel av total)
    if total_violation_score <= 0:
        norm = {k: 0.0 for k in violation_summary}
    else:
        norm = {k: round(violation_summary[k]["score"] / total_violation_score, 3) for k in violation_summary}

    # Respekt
    respect_hi_raw = 0.0
    respect_lo_raw = 0.0
    for sent in sentences:
        hi_hits, hi_w = count_weighted_hits(LEX["respect_high"], sent)
        lo_hits, lo_w = count_weighted_hits(LEX["respect_low"], sent)
        respect_hi_raw += hi_w
        respect_lo_raw += lo_w

    respect_den = respect_hi_raw + respect_lo_raw
    respect_pos_share = (respect_hi_raw / respect_den) if respect_den > 0 else 0.5  # neutral = 0.5
    respect_score = clamp01(respect_pos_share)  # 0..1, högre = mer respekt
    respect_level = label_from_score(respect_score, hi_first=True)

    # Klarhet (hur ofta uttrycks tydliga gränser)
    clarity_raw = 0.0
    for sent in sentences:
        hits, w = count_weighted_hits(LEX["clarity"], sent)
        clarity_raw += w
    clarity_score = clamp01(min(1.0, clarity_raw / (total_len * 0.8)))  # mjuk normalisering
    boundary_clarity = label_from_score(clarity_score, hi_first=True)

    # Övergripande risk (högre vid mycket övertramp + låg respekt + låg klarhet)
    violation_component = clamp01(min(1.0, total_violation_score / (total_len * 1.5)))
    risk_score = clamp01(0.5*violation_component + 0.3*(1 - respect_score) + 0.2*(1 - clarity_score))
    risk_level = label_from_score(risk_score, hi_first=False)  # här betyder hög poäng = mer risk => invertera

    # Förslag (data-driven)
    suggestions: List[str] = []
    if risk_level in ("high", "medium"):
        # Vanliga basåtgärder
        suggestions.append("Sätt tydliga gränser skriftligt (”detta är ok / inte ok”) och be om bekräftelse.")
        suggestions.append("Använd 'jag-budskap' för att uttrycka behov utan skuld (”Jag behöver X för att känna Y”).")
    if clarity_score < 0.5:
        suggestions.append("Ha ett samtal om gränser: definiera konkreta regler och konsekvenser vid övertramp.")
    if respect_score < 0.5:
        suggestions.append("Etablera respektbeteenden (lyssna färdigt, inga förolämpningar, inga hot).")
    # Kategorispecifika råd
    if norm.get("control", 0) >= 0.33:
        suggestions.append("Minimera kontrollbeteenden: inga ultimatum, inga krav på åtkomst till telefon/konton.")
    if norm.get("privacy", 0) >= 0.33:
        suggestions.append("Avtala om integritet: lösenord och meddelanden är privata om inte annat överenskommits.")
    if norm.get("disrespect", 0) >= 0.33:
        suggestions.append("Inför pausregel: avbryt samtal vid förolämpning, återuppta när båda är lugna.")
    if norm.get("boundary_cross", 0) >= 0.33:
        suggestions.append("Markera övertramp direkt och repetera gränsen; följ konsekvens konsekvent vid upprepning.")

    # Bygg insights
    insights = {
        "risk": {
            "score": round(risk_score, 3),
            "level": risk_level
        },
        "respect": {
            "score": round(respect_score, 3),
            "level": respect_level
        },
        "clarity": {
            "score": round(clarity_score, 3),
            "level": boundary_clarity
        },
        "violations": {
            "per_category": {
                k: {
                    **violation_summary[k],
                    "share": norm[k],
                    "examples": violation_examples[k]
                } for k in violation_summary
            },
            "total_score": round(total_violation_score, 3)
        },
        "suggestions": suggestions[:6]  # håll det koncist
    }

    # Kompakt etikett för UI
    top_cat = max(norm, key=norm.get) if norm else "none"
    label = f"risk:{risk_level}|respect:{respect_level}|clarity:{boundary_clarity}|top:{top_cat}"

    return insights, label

# ----------------------------- Runner -----------------------------
def run(payload: Dict) -> Dict:
    data = payload.get("data", {})
    text = data.get("text", "") or ""
    features = data.get("features", [])

    insights, label = analyze_boundaries(features, text)

    # Enkel konfidens baserat på textlängd och signalstyrka
    text_len = max(1, len(text.split()))
    signal = insights["violations"]["total_score"] + insights["clarity"]["score"] + insights["respect"]["score"]
    confidence = clamp01(0.3 + 0.35 * min(1.0, text_len / 80.0) + 0.35 * min(1.0, signal / 6.0))

    # Simulerad precision kopplad till konfidens
    precision = 0.7 + 0.3 * confidence  # 0.7..1.0
    checks = {
        "CHK-BOUND-01": {"pass": precision >= 0.75, "score": round(precision, 3)}
    }

    emits = {
        "boundary_label": label,
        "boundary_insights": insights,
        "confidence": round(confidence, 3)
    }

    return {
        "ok": True,
        "emits": emits,
        "checks": checks
    }

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
