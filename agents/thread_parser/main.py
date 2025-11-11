#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ThreadParserAgent - Robust dialog-parsing för flerpartssamtal
Parsar olika dialogformat och skapar strukturerade threads med tidsstämplar.

Input (stdin eller --payload):
{
  "meta": {
    "explain_verbose": false,
    "format": "auto|structured|plain",  # auto-detekterar format
    "timezone": "UTC"
  },
  "data": {
    "description": "…",                 # Raw text eller strukturerad dialog
    "text": "…"                         # Alternativ input
  }
}

Output:
{
  "ok": true,
  "version": "thread_parser@1.0.0",
  "emits": {
    "thread": [
      {"speaker": "P1|P2|UNKNOWN", "text": "…", "ts": 0, "turn": 1}
    ],
    "thread_ok": true,
    "format_detected": "structured|plain|mixed",
    "turn_count": 2
  }
}
"""
import sys, json, time, argparse, re
from typing import Any, Dict, List, Optional
from datetime import datetime

AGENT_VERSION = "1.0.0"
AGENT_ID = "thread_parser"

# -------------------- CLI -------------------- #
def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="ThreadParserAgent – robust dialog-parsing.")
    p.add_argument("--payload", type=str, default=None)
    p.add_argument("--format", type=str, default=None, choices=["auto","structured","plain"])
    p.add_argument("--explain-verbose", action="store_true")
    return p.parse_args(argv)

def nb_stdin(default: Dict[str, Any]) -> Dict[str, Any]:
    try:
        if sys.stdin and not sys.stdin.isatty():
            raw = sys.stdin.read()
            if raw.strip():
                return json.loads(raw)
    except Exception:
        pass
    return default

def load_payload(args: argparse.Namespace) -> Dict[str, Any]:
    default_payload = {"meta": {}, "data": {}}
    if args.payload:
        with open(args.payload, "r", encoding="utf-8") as f:
            return json.load(f)
    return nb_stdin(default_payload)

# -------------------- Format-detektering -------------------- #
def detect_format(text: str) -> str:
    """Detekterar dialogformat."""
    
    # Kolla om det redan är JSON-struktur
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list) and len(parsed) > 0:
            if isinstance(parsed[0], dict) and "speaker" in parsed[0]:
                return "structured"
    except:
        pass
    
    # Kolla efter dialogmarkörer
    lines = text.split("\n")
    marker_count = 0
    
    for line in lines[:10]:  # Kolla första 10 raderna
        if re.match(r"^(P1|P2|Person\s+1|Person\s+2|Jag|Du):\s*", line, re.I):
            marker_count += 1
        elif re.match(r"^\[(P1|P2|Person\s+1|Person\s+2)\]:\s*", line, re.I):
            marker_count += 1
        elif re.match(r"^<(P1|P2|Person\s+1|Person\s+2)>\s*", line, re.I):
            marker_count += 1
    
    if marker_count >= 2:
        return "structured"
    
    return "plain"

# -------------------- Parsing-funktioner -------------------- #
def parse_structured(text: str) -> List[Dict[str, Any]]:
    """Parsar strukturerad dialog med markörer."""
    thread = []
    lines = text.split("\n")
    current_speaker = "UNKNOWN"
    current_text = []
    turn = 1
    
    for line in lines:
        line = line.strip()
        if not line:
            if current_text:
                thread.append({
                    "speaker": current_speaker,
                    "text": " ".join(current_text),
                    "ts": turn - 1,
                    "turn": turn
                })
                current_text = []
                turn += 1
            continue
        
        # Kolla efter speaker-markör
        speaker_match = None
        
        # Format: "P1: text" eller "Person 1: text"
        m = re.match(r"^(P1|P2|Person\s+1|Person\s+2|Jag|Du):\s*(.*)$", line, re.I)
        if m:
            speaker_tag = m.group(1).upper()
            text_part = m.group(2)
            
            if "P1" in speaker_tag or "PERSON 1" in speaker_tag or "JAG" in speaker_tag:
                speaker_match = ("P1", text_part)
            elif "P2" in speaker_tag or "PERSON 2" in speaker_tag or "DU" in speaker_tag:
                speaker_match = ("P2", text_part)
        
        # Format: "[P1] text"
        if not speaker_match:
            m = re.match(r"^\[(P1|P2|Person\s+1|Person\s+2)\]:\s*(.*)$", line, re.I)
            if m:
                speaker_tag = m.group(1).upper()
                text_part = m.group(2)
                if "P1" in speaker_tag or "PERSON 1" in speaker_tag:
                    speaker_match = ("P1", text_part)
                elif "P2" in speaker_tag or "PERSON 2" in speaker_tag:
                    speaker_match = ("P2", text_part)
        
        # Format: "<P1> text"
        if not speaker_match:
            m = re.match(r"^<(P1|P2|Person\s+1|Person\s+2)>\s*(.*)$", line, re.I)
            if m:
                speaker_tag = m.group(1).upper()
                text_part = m.group(2)
                if "P1" in speaker_tag or "PERSON 1" in speaker_tag:
                    speaker_match = ("P1", text_part)
                elif "P2" in speaker_tag or "PERSON 2" in speaker_tag:
                    speaker_match = ("P2", text_part)
        
        if speaker_match:
            # Spara föregående tur om den finns
            if current_text:
                thread.append({
                    "speaker": current_speaker,
                    "text": " ".join(current_text),
                    "ts": turn - 1,
                    "turn": turn
                })
                turn += 1
            
            # Starta ny tur
            current_speaker = speaker_match[0]
            current_text = [speaker_match[1]] if speaker_match[1] else []
        else:
            # Fortsättning av föregående tur
            current_text.append(line)
    
    # Spara sista turen
    if current_text:
        thread.append({
            "speaker": current_speaker,
            "text": " ".join(current_text),
            "ts": turn - 1,
            "turn": turn
        })
    
    return thread

def parse_plain(text: str) -> List[Dict[str, Any]]:
    """Parsar plain text genom att dela på meningar och alternera talare."""
    thread = []
    
    # Dela på meningar (punkt, utropstecken, frågetecken)
    sentences = re.split(r'(?<=[.!?])\s+', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    
    if not sentences:
        # Om inga meningar hittades, behandla hela texten som en tur
        return [{
            "speaker": "UNKNOWN",
            "text": text,
            "ts": 0,
            "turn": 1
        }]
    
    # Alternera mellan P1 och P2
    speakers = ["P1", "P2"]
    current_speaker_idx = 0
    
    # Gruppera meningar i turer (2-3 meningar per tur)
    turn_size = 2
    for i in range(0, len(sentences), turn_size):
        turn_sentences = sentences[i:i+turn_size]
        speaker = speakers[current_speaker_idx % len(speakers)]
        
        thread.append({
            "speaker": speaker,
            "text": " ".join(turn_sentences),
            "ts": i // turn_size,
            "turn": (i // turn_size) + 1
        })
        
        current_speaker_idx += 1
    
    return thread

def parse_json_structure(data: Any) -> List[Dict[str, Any]]:
    """Parsar JSON-strukturerad dialog."""
    thread = []
    
    if isinstance(data, list):
        for i, item in enumerate(data):
            if isinstance(item, dict):
                thread.append({
                    "speaker": item.get("speaker", "UNKNOWN"),
                    "text": item.get("text", ""),
                    "ts": item.get("ts", i),
                    "turn": item.get("turn", i + 1)
                })
    
    return thread

# -------------------- Core -------------------- #
def run(payload: Dict[str, Any], meta: Dict[str, Any]) -> Dict[str, Any]:
    data = payload.get("data", {}) or {}
    
    # Hämta input
    description = data.get("description", "") or data.get("text", "")
    dialog = data.get("dialog", [])
    
    # Bestäm format
    format_type = meta.get("format", "auto")
    if format_type == "auto":
        format_type = detect_format(description)
    
    thread = []
    format_detected = format_type
    
    # Om dialog redan är strukturerad JSON
    if dialog and isinstance(dialog, list):
        thread = parse_json_structure(dialog)
        format_detected = "structured"
    elif format_type == "structured":
        thread = parse_structured(description)
    else:
        thread = parse_plain(description)
    
    # Validera thread
    thread_ok = len(thread) > 0 and all("speaker" in t and "text" in t for t in thread)
    
    emits = {
        "thread": thread,
        "thread_ok": thread_ok,
        "format_detected": format_detected,
        "turn_count": len(thread)
    }
    
    checks = {
        "CHK-THREAD-01": {
            "pass": thread_ok,
            "reason": f"{len(thread)} turer parsade" if thread_ok else "Parsing misslyckades"
        }
    }
    
    return {"ok": True, "emits": emits, "checks": checks}

# -------------------- Main -------------------- #
def main() -> None:
    t0 = time.time()
    try:
        args = parse_args(sys.argv[1:])
        payload = load_payload(args)
        meta = payload.get("meta", {}) or {}
        
        # Överstyr från CLI
        if args.format:
            meta["format"] = args.format
        
        res = run(payload, meta)
        res["version"] = f"{AGENT_ID}@{AGENT_VERSION}"
        res["latency_ms"] = int((time.time() - t0) * 1000)
        res["cost"] = {"usd": 0.001}
        
        if args.explain_verbose or meta.get("explain_verbose", False):
            res["rationales"] = [{
                "cue": "thread_parsing",
                "detail": {
                    "format_detected": res["emits"]["format_detected"],
                    "turn_count": res["emits"]["turn_count"],
                    "thread_ok": res["emits"]["thread_ok"]
                }
            }]
        
        sys.stdout.write(json.dumps(res, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        sys.stderr.write(f"{AGENT_ID} error: {e}\n")
        sys.stdout.write(json.dumps({"ok": False, "error": str(e)}))
        sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    main()
