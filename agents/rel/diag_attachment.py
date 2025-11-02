import re

LABELS = ("trygg","orolig","undvikande","ambivalent")

KEYS = {
    "trygg": [
        r"\buppskattar\b", r"\bteam\b", r"\bvi\b", r"\bplanera\b", r"\bnyfiken\b",
        r"\bcheck[- ]?in\b", r"\btack\b", r"\bvalfrihet\b", r"\bfråga\b"
    ],
    "orolig": [
        r"\borolig\b", r"\bjag[aer] dig\b", r"\bghost\b", r"\bosedd\b",
        r"\bjag blir defensiv\b", r"\btryggt\b"
    ],
    "undvikande": [
        r"\bspace\b", r"\begen tid\b", r"\båterhämtn?ing\b", r"\bkort i tonen\b",
        r"\bbyte av kanal\b", r"\bIRL\b", r"\bta paus\b"
    ],
    "ambivalent": [
        r"\bpassivt aggressiv\b", r"\bspårade ur\b", r"\bsa saker jag inte menade\b"
    ],
}


def _score_label(text: str, label: str) -> int:
    return sum(1 for rx in KEYS[label] if re.search(rx, text or "", flags=re.I))


def classify(text: str, lang: str = "sv", persona=None, context=None) -> dict:
    text = text or ""
    scores = {lbl: _score_label(text, lbl) for lbl in LABELS}
    label = max(scores.items(), key=lambda x: (x[1], x[0]))[0]
    if all(v == 0 for v in scores.values()):
        label = "trygg"
    conf = 0.9 if scores[label] >= 2 else 0.8 if scores[label] == 1 else 0.7
    return {"label": label, "conf": conf, "scores": scores}


