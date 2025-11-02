import re


def analyze(text: str, **_):
    has = bool(re.search(r"\b(gräns|egen tid|space|regel)\b", text or "", re.I))
    sugg = ["Sätt gräns mjukt", "Formulera regeln tydligt", "Bekräfta frivillighet"] if has else []
    return {"has_boundary": has, "suggestions": sugg}


