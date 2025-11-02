#!/usr/bin/env python3
"""
Session Memory – minnesbank mellan körningar.
"""
import json
import pathlib
import time
import hashlib

STORE_DIR = pathlib.Path("runtime/session_memory")
STORE_DIR.mkdir(parents=True, exist_ok=True)
STORE = STORE_DIR / "relations.jsonl"


def key_of(dialog_or_text: str) -> str:
    h = hashlib.sha256(dialog_or_text.encode("utf-8")).hexdigest()[:16]
    return h


def save(session_id: str, summary: dict):
    if not STORE.exists():
        STORE.write_text("", encoding="utf-8")
    with STORE.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"ts": int(time.time()), "sid": session_id, "summary": summary}) + "\n")


def last_n(session_id: str, n: int = 5):
    if not STORE.exists():
        return []
    rows = []
    for line in STORE.read_text(encoding="utf-8").splitlines():
        try:
            obj = json.loads(line)
            if obj.get("sid") == session_id:
                rows.append(obj)
        except Exception:
            pass
    return rows[-n:]


def get_session_history(conversation_id: str, n: int = 5) -> list:
    """Get last n history entries for a conversation."""
    return last_n(conversation_id, n)

