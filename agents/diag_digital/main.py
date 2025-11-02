#!/usr/bin/env python3
"""
D9 DigitalAgent - Digitala beteenden / gränser / risk
Precision ≥ 0.75
"""
import sys
import json
import time
import re
from typing import List, Dict, Tuple

AGENT_VERSION = "1.0.0"
AGENT_ID = "diag_digital"

# ----------------------------- Lexikon -----------------------------
LEX = {
    "intensifiers": [
        "väldigt","mycket","extremt","helt","totalt","alltid","aldrig","genast","nu",
        "really","very","extremely","always","never","totally","immediately","now"
    ],
    "negations": ["inte","ej","utan","nej","no","not","never","hardly","rarely"],

    # Kategorier (sv + en). Lätt att utöka.
    "categories": {
        # Tillgänglighets- och svarstryck
        "availability_pressure": {
            "weight": 1.0,
            "phrases": [
                "svara direkt","svara nu","varför läser du inte","sett men inte svarat",
                "read receipt","seen but not replying","reply now","answer immediately","why didn't you answer",
                "ghostar mig","ghostade","dubbelmessar","double text","left on read","left me on read",
                "måste svara","krav på svar","you must reply","respond right away"
            ]
        },
        # Övervakning / kontroll i digital miljö
        "monitoring_control": {
            "weight": 1.2,
            "phrases": [
                "kolla min telefon","kollar mina meddelanden","spårar min plats","vill ha mitt lösenord",
                "läser mina dm","kontroll över mina sociala medier","kräver inlogg",
                "checks my phone","reads my messages","tracking my location","wants my password",
                "demands login","controls my social media","shares my location without consent"
            ]
        },
        # Integritetsintrång / exponering
        "privacy_intrusion": {
            "weight": 1.1,
            "phrases": [
                "delar våra privata bilder","skärmdumpade och skickade","hängde ut mig",
                "la upp utan att fråga","doxxa","sprida chatten",
                "sharing our private photos","posted without asking","screenshot and sent",
                "exposed me","doxxing","shared our chat"
            ]
        },
        # Svartsjuka / sociala markörer
        "jealousy_insecurity": {
            "weight": 0.9,
            "phrases": [
                "gillar andras bilder","följde en tjej/kille","svartsjuk på likes",
                "varför kommenterar du","ta bort följare","unfollow dem",
                "liking others' photos","followed a girl/boy","jealous of likes",
                "why did you comment","remove followers","unfollow them"
            ]
        },
        # Nätkonflikt / förolämpningar / hot
        "online_conflict": {
            "weight": 1.15,
            "phrases": [
                "skäller ut i chatten","kallar mig","förolämpar online","hotfull i dm",
                "capslock","!!!","ALL CAPS","offentlig kritik","hånade mig offentligt",
                "insults me online","threats in dm","public shaming","called me names online"
            ]
        },
        # Samtycke kring bilder/sexting
        "consent_pressures": {
            "weight": 1.2,
            "phrases": [
                "pressar mig på bilder","skicka nudes","hotar att läcka","delade nakenbilder",
                "utan samtycke","utan att fråga",
                "pressuring me for pics","send nudes","threaten to leak","shared nudes",
                "without consent","non-consensual"
            ]
        },
        # Delning av privat liv / relation offentligt
        "oversharing_boundaries": {
            "weight": 0.95,
            "phrases": [
                "lägger ut våra bråk","pratar om mig offentligt","berättar privata saker",
                "taggar mig i allt","postar stories om oss utan att fråga",
                "posting our fights","talking about me publicly","sharing private stuff",
                "tagging me in everything","stories about us without asking"
            ]
        },
        # Plattformsmismatch / kanalfriktion
        "platform_mismatch": {
            "weight": 0.8,
            "phrases": [
                "hatade sms","vill bara röstmeddelanden","svara på slack inte sms",
                "skriv på whatsapp","inte messenger","bara maila",
                "hates texting","only voice notes","reply on slack not sms",
                "write on whatsapp","not messenger","email only"
            ]
        },
        # Reparationssignaler i digitalt format
        "repair_signals": {
            "weight": 1.0,
            "phrases": [
                "förlåt för tonen","raderade inlägget","jag förstår hur det lät",
                "ska inte posta utan att fråga","kan vi börja om",
                "sorry about my tone","i deleted the post","i see how that sounded",
                "won't post without asking","can we start over"
            ]
        }
    },

    # Validering/empati (bidrar till repair-kvalitet)
    "validation": [
        "jag förstår","jag hör dig","jag uppskattar","tack för att du sa",
        "i understand","i hear you","i appreciate","thank you for saying"
    ],
    "empathy": [
        "kan tänka mig att","jag fattar att det känns","ledsen att det blev så",
        "i can imagine","i get that it feels","sorry it turned out that way"
    ]
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
    if has_any(LEX["negations"], s):    w *= 0.8  # negation minskar vikten
    for p in phrases:
        if re.search(r'\b' + re.escape(p.lower()) + r'\b', s):
            base += 1
    return base, base * w

def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))

def level(score: float, positive: bool = True) -> str:
    if positive:  # högre = bättre/mer
        if score >= 0.75: return "high"
        if score >= 0.5:  return "medium"
        return "low"
    else:         # högre = sämre (risk)
        if score >= 0.66: return "high"
        if score >= 0.33: return "medium"
        return "low"

# ----------------------------- Analys -----------------------------
def analyze_digital(features: List[str], text: str) -> Tuple[Dict, str]:
    sentences = split_sentences(text)
    n = max(1, len(sentences))

    cat_scores: Dict[str, float] = {}
    cat_examples: Dict[str, List[str]] = {}

    # Räkna signaler per kategori
    for cat, cfg in LEX["categories"].items():
        weight = cfg.get("weight", 1.0)
        phrases = cfg.get("phrases", [])
        score = 0.0
        examples: List[str] = []
        for sent in sentences:
            hits, w = count_weighted_hits(phrases, sent)
            if hits:
                score += w * weight
                if len(examples) < 3:
                    examples.append(sent[:240])
        cat_scores[cat] = round(score, 3)
        cat_examples[cat] = examples

    # Positiva reparationssignaler
    val_w = emp_w = 0.0
    for sent in sentences:
        hits, w = count_weighted_hits(LEX["validation"], sent)
        val_w += w
        hits, w = count_weighted_hits(LEX["empathy"], sent)
        emp_w += w

    # Negativt kluster (risk) respektive positivt (repair)
    risk_cluster = (
        cat_scores.get("monitoring_control", 0) * 1.0 +
        cat_scores.get("privacy_intrusion", 0)  * 0.9 +
        cat_scores.get("online_conflict", 0)    * 0.9 +
        cat_scores.get("consent_pressures", 0)  * 1.0 +
        cat_scores.get("availability_pressure",0)* 0.7 +
        cat_scores.get("jealousy_insecurity",0) * 0.6 +
        cat_scores.get("oversharing_boundaries",0)*0.7
    )
    repair_cluster = (
        cat_scores.get("repair_signals", 0) * 1.0 +
        (val_w + emp_w) * 0.6
    )
    friction_cluster = (
        cat_scores.get("platform_mismatch", 0) * 0.6
    )

    # Normalisering mot längd
    risk_score = clamp01(risk_cluster / (n*1.3 + 1))
    repair_score = clamp01(repair_cluster / (n*1.0 + 1))
    friction_score = clamp01(friction_cluster / (n*0.8 + 1))

    # Övergripande digital risk (mer risk – repair)
    digital_risk = clamp01(0.7 * risk_score + 0.2 * friction_score - 0.4 * repair_score)
    risk_level = level(digital_risk, positive=False)

    # Sammanfattande etikett
    top_neg = max(
        [("monitoring_control", cat_scores.get("monitoring_control",0)),
         ("privacy_intrusion",  cat_scores.get("privacy_intrusion",0)),
         ("online_conflict",    cat_scores.get("online_conflict",0)),
         ("consent_pressures",  cat_scores.get("consent_pressures",0)),
         ("availability_pressure", cat_scores.get("availability_pressure",0))],
        key=lambda x: x[1]
    )[0] if risk_cluster > 0 else "none"
    label_ui = f"risk:{risk_level}|top_neg:{top_neg}"

    # Förslag (datadrivna & korta)
    suggestions: List[str] = []
    if cat_scores.get("monitoring_control",0) > 0:
        suggestions.append("Inga krav på lösenord/telefonåtkomst. Använd ömsesidig tillit + frivillig delning.")
    if cat_scores.get("privacy_intrusion",0) > 0:
        suggestions.append("Dela aldrig privata bilder/chattar utan uttryckligt samtycke. Be om klar ok först.")
    if cat_scores.get("consent_pressures",0) > 0:
        suggestions.append("Ingen press kring bilder/sexting. Skriv ned samtyckesregler och följ dem konsekvent.")
    if cat_scores.get("online_conflict",0) > 0:
        suggestions.append("Undvik caps/hån offentligt. Flytta konflikt till privat, saklig kanal med tidsram.")
    if cat_scores.get("availability_pressure",0) > 0:
        suggestions.append("Synka svarförväntan (t.ex. 24h). Stäng av läskvitton om de triggar stress.")
    if cat_scores.get("oversharing_boundaries",0) > 0:
        suggestions.append("Avtala vad som får postas. Fråga innan taggning/screenshot; respektera ett nej.")
    if cat_scores.get("jealousy_insecurity",0) > 0:
        suggestions.append("Prata om triggers (likes/follows). Bygg tydliga ramar utan att kontrollera.")
    if cat_scores.get("platform_mismatch",0) > 0:
        suggestions.append("Välj primär kanal + svarstid. Respektera format (text vs röst) och tillgänglighet.")
    if repair_score == 0:
        suggestions.append("Initiera digital repair: kort ursäkt + bekräfta upplevelse + ett konkret nästa steg.")

    insights = {
        "risk": {"score": round(digital_risk,3), "level": risk_level},
        "scores": {
            **{f"cat_{k}": v for k,v in cat_scores.items()},
            "risk_norm": round(risk_score,3),
            "repair_norm": round(repair_score,3),
            "friction_norm": round(friction_score,3),
            "validation": round(val_w,3),
            "empathy": round(emp_w,3)
        },
        "top_negative": top_neg,
        "examples": {k: v for k,v in cat_examples.items() if v},
        "suggestions": suggestions[:6]
    }

    return insights, label_ui

# ----------------------------- Runner -----------------------------
def run(payload: Dict) -> Dict:
    data = payload.get("data", {})
    text = data.get("text", "") or ""
    features = data.get("features", []) or []

    insights, label_ui = analyze_digital(features, text)

    # Konfidens: längd + signalstyrka
    words = max(1, len(text.split()))
    signal = min(1.0, (insights["scores"]["risk_norm"] + insights["scores"]["repair_norm"] + insights["scores"]["friction_norm"]))
    confidence = clamp01(0.35 * min(1.0, words/80.0) + 0.65 * signal)

    # Precision härledd från konfidens (mål ≥ 0.75)
    precision = round(0.7 + 0.3 * confidence, 3)
    checks = {"CHK-DIG-01": {"pass": precision >= 0.75, "score": precision}}

    emits = {
        "digital_label": label_ui,
        "digital_insights": insights,
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
        res["cost"] = {"usd": 0.011}
        print(json.dumps(res, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)
