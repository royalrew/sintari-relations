#!/usr/bin/env python3
"""
ContextGraphAgent – extrahera aktörer, händelser, tid och relationer (låg-beroende, regex+heuristik).
Returnerar grafdelta: nodes, edges, timeline, confidences.
"""
from __future__ import annotations
import re
import json
import sys
from typing import List, Dict, Any, Tuple

ACTOR_RE = re.compile(r"\b(jag|du|vi|han|hon|p1|p2)\b", re.I)
EVENT_CUES = [
    ("check-in", r"\b(check[\s-]?in|kvälls[- ]?check|daglig check)\b"),
    ("paus", r"\b(paus|break|andrum|time[- ]?out)\b"),
    ("byt_kanal", r"\b(byt kanal|switch channel|irl|samtal)\b"),
    ("spegla", r"\b(spegl|reflekt|återge)\w*\b"),
    ("gräns", r"\b(gräns|boundary|regel)\b"),
    ("timebox", r"\b(timebox|20 min|15 min|30 min|time[- ]?box)\b"),
]
EVENT_RE = [(k, re.compile(p, re.I)) for k, p in EVENT_CUES]


def _norm_actor(tok: str) -> str:
    t = tok.lower()
    return {"p1": "P1", "p2": "P2", "jag": "P1", "du": "P2", "vi": "BÅDA", "han": "P2", "hon": "P2"}.get(t, t.upper())


def analyze(text: str, dialog: List[Dict[str, str]] | None = None, lang: str = "sv", persona=None, context=None) -> Dict[str, Any]:
    span_src = []
    content = " ".join(m.get("text", "") for m in dialog) if dialog else text
    # Aktörer
    actors = list({_norm_actor(m.group()) for m in ACTOR_RE.finditer(content)})
    if dialog and "P1" not in actors:
        actors.append("P1")
    if dialog and "P2" not in actors:
        actors.append("P2")

    # Händelser + spans
    events, spans = [], []
    for label, rx in EVENT_RE:
        for m in rx.finditer(content):
            events.append(label)
            spans.append({"label": label, "start": m.start(), "end": m.end(), "text": content[m.start():m.end()]})

    # Tidsindikation (simpel)
    timeline = []
    if dialog:
        for i, turn in enumerate(dialog, 1):
            timeline.append({"t": i, "speaker": turn.get("speaker", "?"), "text": turn.get("text", "")})

    nodes = [{"id": a, "type": "actor"} for a in sorted(set(actors))]
    for e in sorted(set(events)):
        nodes.append({"id": f"evt:{e}", "type": "event"})

    edges = []
    if dialog:
        # koppla talare till event-mentions i samma tur (approx)
        joined = ""
        pos = 0
        positions = []
        for i, turn in enumerate(dialog, 1):
            s = turn.get("text", "")
            positions.append((i, pos, pos + len(s)))
            pos += len(s) + 1
            joined += s + " "
        for sp in spans:
            idx = next((i for i, (_, a, b) in enumerate(positions, 1) if a <= sp["start"] <= b), None)
            if idx:
                speaker = dialog[idx - 1].get("speaker", "?")
                edges.append({"from": speaker, "to": f"evt:{sp['label']}", "type": "mentions"})

    conf = min(1.0, 0.6 + 0.05 * len(spans))  # enkel confidence
    return {
        "graph_delta": {
            "nodes": nodes,
            "edges": edges,
            "timeline": timeline
        },
        "graph_events": list(sorted(set(events))),
        "graph_confidence": round(conf, 2),
        "graph_spans": spans
    }


def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    data = payload.get("data", {})
    text = data.get("description", "") or data.get("shared_text", "")
    dialog = payload.get("dialog") or data.get("dialog")
    
    result = analyze(text=text, dialog=dialog)
    return {
        "ok": True,
        "emits": result
    }


if __name__ == "__main__":
    payload = json.loads(sys.stdin.read())
    result = run(payload)
    print(json.dumps(result, ensure_ascii=False))
