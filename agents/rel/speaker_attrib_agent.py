from typing import List, Dict


def label(dialog: List[Dict]) -> dict:
    """Validerar/normaliserar talaretiketter till P1/P2 och bygger labeled_dialog."""
    labeled: List[Dict] = []
    norm = {"p1": "P1", "P1": "P1", "1": "P1", "p2": "P2", "P2": "P2", "2": "P2"}
    for m in dialog or []:
        spk = m.get("speaker", "P1")
        spk = norm.get(str(spk), spk if spk in ("P1", "P2") else "P1")
        labeled.append({"speaker": spk, "text": m.get("text", "")})
    speakers = {m["speaker"] for m in labeled}
    return {"labeled_dialog": labeled, "two_speakers": (speakers == {"P1", "P2"})}


