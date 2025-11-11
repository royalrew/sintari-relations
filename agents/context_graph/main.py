#!/usr/bin/env python3
"""
ContextGraphAgent – extrahera aktörer, händelser, tid och relationer (förbättrad version).
Returnerar grafdelta: nodes, edges, timeline, confidences med mer avancerad analys.

Förbättringar:
- Mer sofistikerad grafbyggnad
- Relationer mellan aktörer
- Tidsmönster och sekvenser
- Förbättrad confidence-scoring
- Stöd för flera aktörer och komplexa relationer
"""
from __future__ import annotations
import re
import json
import sys
import time
from typing import List, Dict, Any, Tuple, Optional

AGENT_VERSION = "2.1.0"
AGENT_ID = "context_graph"

# -------------------------- Utils -------------------------- #
ACTOR_RE = re.compile(r"\b(jag|du|vi|han|hon|hen|p1|p2|person\s+1|person\s+2)\b", re.I)

# Utökade händelsemönster
EVENT_CUES = [
    ("check-in", r"\b(check[\s-]?in|kvälls[- ]?check|daglig\s+check|morgoncheck)\b"),
    ("paus", r"\b(paus|break|andrum|time[- ]?out|pausa|pausera)\b"),
    ("byt_kanal", r"\b(byt\s+kanal|switch\s+channel|irl|samtal|face[- ]?to[- ]?face)\b"),
    ("spegla", r"\b(spegl|reflekt|återge|återkoppl)\w*\b"),
    ("gräns", r"\b(gräns|boundary|regel|begränsning)\b"),
    ("timebox", r"\b(timebox|20\s+min|15\s+min|30\s+min|time[- ]?box|tidsbegränsning)\b"),
    ("konflikt", r"\b(konflikt|disput|gräl|argument|meningsskiljaktighet)\b"),
    ("försoning", r"\b(försoning|förlåtelse|ursäkt|make\s+up|reparation)\b"),
    ("stöd", r"\b(stöd|support|hjälp|assistans)\b"),
    ("känsla", r"\b(känsla|känslor|emotion|feelings?)\b"),
]

EVENT_RE = [(k, re.compile(p, re.I)) for k, p in EVENT_CUES]

# Relationstyper
RELATION_PATTERNS = [
    (r"\b(partners?|sambo|make|maka|fru|man)\b", "partner"),
    (r"\b(vän|vänner|friend|friends?)\b", "friend"),
    (r"\b(kollega|kollegor|colleague|colleagues?)\b", "colleague"),
    (r"\b(familj|släkt|family|relative)\b", "family"),
    (r"\b(barn|barnen|children|kids?)\b", "children"),
]

RELATION_RE = [(rel_type, re.compile(pattern, re.I)) for pattern, rel_type in RELATION_PATTERNS]

def _norm_actor(tok: str) -> str:
    """Normaliserar aktörsnamn."""
    t = tok.lower()
    mapping = {
        "p1": "P1", "p2": "P2",
        "person 1": "P1", "person 2": "P2",
        "jag": "P1", "du": "P2",
        "vi": "BÅDA",
        "han": "P2", "hon": "P2", "hen": "P2"
    }
    return mapping.get(t, t.upper())

def _extract_relations(text: str) -> List[Tuple[str, str]]:
    """Extraherar relationer från text."""
    relations = []
    for rel_type, pattern in RELATION_RE:
        matches = pattern.finditer(text.lower())
        for m in matches:
            relations.append((rel_type, m.group()))
    return relations

# -------------------------- Förbättrad analys -------------------------- #
def analyze(
    text: str,
    dialog: List[Dict[str, str]] | None = None,
    lang: str = "sv",
    persona=None,
    context=None
) -> Dict[str, Any]:
    """Förbättrad analys med mer avancerad grafbyggnad."""
    
    span_src = []
    content = " ".join(m.get("text", "") for m in dialog) if dialog else text
    
    # Aktörer med förbättrad detektering
    actors = list({_norm_actor(m.group()) for m in ACTOR_RE.finditer(content)})
    
    # Om dialog finns, lägg till P1/P2 om de saknas
    if dialog:
        if "P1" not in actors:
            actors.append("P1")
        if "P2" not in actors:
            actors.append("P2")
    
    # Händelser + spans med förbättrad detektering
    events, spans = [], []
    event_counts = {}
    
    for label, rx in EVENT_RE:
        matches = list(rx.finditer(content))
        if matches:
            events.append(label)
            event_counts[label] = len(matches)
            for m in matches:
                spans.append({
                    "label": label,
                    "start": m.start(),
                    "end": m.end(),
                    "text": content[m.start():m.end()],
                    "confidence": 0.8
                })
    
    # Extrahera relationer
    relations = _extract_relations(content)
    relation_types = list(set([r[0] for r in relations]))
    
    # Tidsindikation med förbättrad struktur
    timeline = []
    if dialog:
        for i, turn in enumerate(dialog, 1):
            speaker = turn.get("speaker", "?")
            turn_text = turn.get("text", "")
            ts = turn.get("ts", i)
            
            # Identifiera händelser i denna tur
            turn_events = []
            for label, rx in EVENT_RE:
                if rx.search(turn_text):
                    turn_events.append(label)
            
            timeline.append({
                "t": i,
                "speaker": speaker,
                "text": turn_text[:100],  # Trunkera för prestanda
                "events": turn_events,
                "ts": ts
            })
    else:
        # Om ingen dialog, skapa enkel timeline från text
        timeline.append({
            "t": 1,
            "speaker": "UNKNOWN",
            "text": content[:100],
            "events": [e for e in events],
            "ts": 0
        })
    
    # Bygg nodes med mer information
    nodes = []
    for a in sorted(set(actors)):
        nodes.append({
            "id": a,
            "type": "actor",
            "mentions": len([m for m in ACTOR_RE.finditer(content) if _norm_actor(m.group()) == a])
        })
    
    for e in sorted(set(events)):
        nodes.append({
            "id": f"evt:{e}",
            "type": "event",
            "count": event_counts.get(e, 1),
            "mentions": event_counts.get(e, 1)
        })
    
    # Lägg till relation-nodes
    for rel_type in relation_types:
        nodes.append({
            "id": f"rel:{rel_type}",
            "type": "relation",
            "mentions": len([r for r in relations if r[0] == rel_type])
        })
    
    # Bygg edges med mer information
    edges = []
    
    if dialog:
        # Koppla talare till event-mentions i samma tur
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
                edges.append({
                    "from": speaker,
                    "to": f"evt:{sp['label']}",
                    "type": "mentions",
                    "confidence": sp.get("confidence", 0.8),
                    "turn": idx
                })
        
        # Koppla aktörer till relationer
        for rel_type, rel_text in relations:
            # Hitta vilken tur relationen nämns i
            rel_pos = joined.lower().find(rel_text.lower())
            if rel_pos >= 0:
                idx = next((i for i, (_, a, b) in enumerate(positions, 1) if a <= rel_pos <= b), None)
                if idx:
                    speaker = dialog[idx - 1].get("speaker", "?")
                    edges.append({
                        "from": speaker,
                        "to": f"rel:{rel_type}",
                        "type": "has_relation",
                        "confidence": 0.7,
                        "turn": idx
                    })
    
    # Koppla aktörer till varandra baserat på pronomen
    if "P1" in actors and "P2" in actors:
        # Om båda aktörer finns, skapa relation-edge
        edges.append({
            "from": "P1",
            "to": "P2",
            "type": "interacts_with",
            "confidence": 0.6
        })
    
    # Förbättrad confidence-beräkning
    base_conf = 0.6
    conf_boost = 0.0
    
    # Öka confidence baserat på antal spans
    if len(spans) > 0:
        conf_boost += min(0.2, len(spans) * 0.02)
    
    # Öka confidence om dialog är strukturerad
    if dialog and len(dialog) > 1:
        conf_boost += 0.1
    
    # Öka confidence om relationer hittades
    if relations:
        conf_boost += 0.1
    
    confidence = min(1.0, base_conf + conf_boost)
    
    return {
        "graph_delta": {
            "nodes": nodes,
            "edges": edges,
            "timeline": timeline
        },
        "graph_events": list(sorted(set(events))),
        "graph_relations": relation_types,
        "graph_confidence": round(confidence, 2),
        "graph_spans": spans,
        "event_counts": event_counts,
        "relation_counts": {rel_type: len([r for r in relations if r[0] == rel_type]) for rel_type in relation_types}
    }

# -------------------------- Runner -------------------------- #
def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    data = payload.get("data", {})
    meta = payload.get("meta", {})
    text = data.get("description", "") or data.get("text", "")
    dialog = payload.get("dialog") or data.get("dialog")
    lang = meta.get("language", "sv") or "sv"
    
    result = analyze(text=text, dialog=dialog, lang=lang)
    
    return {
        "ok": True,
        "version": f"{AGENT_ID}@{AGENT_VERSION}",
        "emits": result,
        "checks": {
            "CHK-GRAPH-01": {
                "pass": len(result["graph_delta"]["nodes"]) > 0,
                "reason": f"{len(result['graph_delta']['nodes'])} nodes skapade"
            }
        }
    }

# -------------------------- Main -------------------------- #
if __name__ == "__main__":
    t0 = time.time()
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        result = run(payload)
        result["latency_ms"] = int((time.time() - t0) * 1000)
        result["cost"] = {"usd": 0.003}
        print(json.dumps(result, ensure_ascii=False), flush=True)
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"{AGENT_ID} error: {e}"}))
        sys.exit(1)
