import re

TRIG = [r"\bpassivt aggressiv\b", r"\bspårade ur\b", r"\bdefensiv\b", r"\bifrågasatt\b"]
REPAIR = ["Jag-budskap", "Spegla med egna ord", "Paus 20 min", "Öppen fråga"]


def analyze(text: str, **_):
    t = text or ""
    tr = [rx for rx in TRIG if re.search(rx, t, re.I)]
    cues = REPAIR[:3] if tr else []
    return {"triggers": tr, "repair_cues": cues, "summary": "konflikt" if tr else "neutral"}


