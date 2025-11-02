from typing import List, Dict

try:
    from agents.rel.session_memory import key_of, save as sm_save, last_n as sm_last_n
    SESSION_MEMORY_AVAILABLE = True
except ImportError:
    SESSION_MEMORY_AVAILABLE = False


def _summ(texts: List[str]) -> str:
    if not texts:
        return ""
    first = texts[0][:60]
    last = texts[-1][:60]
    return f"{first} … {last}"


def analyze(dialog: List[Dict], lang: str = "sv", persona=None, context=None, conversation_id=None) -> dict:
    """Bygger enkel samtalsminnes-state över 3–6 turer."""
    turns = dialog or []
    speakers = [m.get("speaker", "") for m in turns]
    texts = [m.get("text", "") for m in turns]
    joined = " ".join(texts)

    has_checkin = any("check" in (t or "").lower() for t in texts)
    wants_pause = any("paus" in (t or "").lower() or "time" in (t or "").lower() for t in texts)
    switch_channel = any(("IRL" in (t or "")) or ("call" in (t or "").lower()) or ("byt kanal" in (t or "").lower()) for t in texts)
    boundary_lang = any(x in joined.lower() for x in ["regel", "gräns", "signal", "check-signal"])
    empathy_flow = any(x in joined.lower() for x in ["spegla", "missförstådd"]) or "missförstod" in joined.lower()

    memory = {
        "speakers": speakers,
        "last_speaker": speakers[-1] if speakers else None,
        "proposal": {
            "checkin": has_checkin,
            "pause": wants_pause,
            "switch_channel": switch_channel,
            "boundary": boundary_lang,
            "empathy": empathy_flow,
        },
        "summary": _summ(texts),
    }

    total = 5
    hit = sum([has_checkin, wants_pause, switch_channel, boundary_lang, empathy_flow])
    mem_score = round(hit / total, 2)
    
    result = {"state": memory, "signals": memory["proposal"], "memory_score": mem_score}
    
    # Session memory if available
    if SESSION_MEMORY_AVAILABLE and dialog:
        sid = conversation_id or key_of(joined)
        history = sm_last_n(sid, 5)
        summary = {"signals": memory["proposal"], "score": mem_score}
        sm_save(sid, summary)
        result["session_id"] = sid
        result["session_history"] = history
    
    return result


