import re
from typing import List, Dict

CUES = [
    (r"\bjag uppskattar\b", "beröm"),
    (r"\bjag blev ledsen\b|\bjag kände\b", "känsla"),
    (r"\bkan vi\b|\bskulle vi\b|\bvill du\b", "öppen_fråga"),
    (r"\bförlåt\b|\bjag tar ansvar\b", "reparation"),
    (r"\bska vi ta paus\b|\btime[- ]?out\b", "regler"),
    (r"\begen tid\b|\bspace\b", "gräns"),
]


def _spans(text: str) -> List[Dict]:
    spans = []
    t = text or ""
    for rx, label in CUES:
        for m in re.finditer(rx, t, flags=re.I):
            spans.append({"text": t[m.start():m.end()], "start": m.start(), "end": m.end(), "label": label})
    return spans


def link(text: str, insights=None, lang: str = "sv", persona=None, context=None) -> dict:
    spans = _spans(text)
    coverage = min(1.0, (len(spans) / max(1, len((text or "").split()))) * 6.0)
    uniq_labels = sorted({s["label"] for s in spans})
    return {"spans": spans, "coverage": round(coverage, 2), "labels": uniq_labels}


