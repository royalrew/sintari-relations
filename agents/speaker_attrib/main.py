#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SpeakerAttributionAgent - Smart talare-attribution för flerpartssamtal
Identifierar vem som säger vad baserat på pronomen, kontext och dialogstruktur.

Input (stdin eller --payload):
{
  "meta": {
    "explain_verbose": false,
    "speakers": ["P1", "P2"],          # Förväntade talare
    "default_speaker": "P1"             # Fallback om ingen matchning
  },
  "data": {
    "description": "…",                 # Hela texten
    "dialog": [                         # Alternativt: strukturerad dialog
      {"speaker": "?", "text": "…"},
      ...
    ]
  }
}

Output:
{
  "ok": true,
  "version": "speaker_attrib@1.0.0",
  "emits": {
    "labeled_thread": [
      {"speaker": "P1|P2|UNKNOWN", "text": "…", "ts": 0, "confidence": 0.0-1.0}
    ],
    "speaker_confidence": 0.0-1.0,
    "speaker_distribution": {"P1": 0.5, "P2": 0.5}
  }
}
"""
import sys, json, time, argparse, re
from typing import Any, Dict, List, Tuple

AGENT_VERSION = "1.0.0"
AGENT_ID = "speaker_attrib"

# -------------------- CLI -------------------- #
def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="SpeakerAttributionAgent – smart talare-attribution.")
    p.add_argument("--payload", type=str, default=None)
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

# -------------------- Pronomen-mappning -------------------- #
# Svenska pronomen → talare
SV_PRONOUNS = {
    "P1": ["jag", "min", "mina", "mig", "mitt", "mig själv"],
    "P2": ["du", "din", "dina", "dig", "ditt", "dig själv"],
    "BOTH": ["vi", "vår", "våra", "oss", "vårt", "oss själva"]
}

# Engelska pronomen → talare
EN_PRONOUNS = {
    "P1": ["i", "my", "me", "myself", "mine"],
    "P2": ["you", "your", "yours", "yourself"],
    "BOTH": ["we", "our", "us", "ourselves"]
}

# Tredje person → P2 (om kontext)
THIRD_PERSON = {
    "sv": ["han", "hon", "hen", "hennes", "hans", "deras"],
    "en": ["he", "she", "they", "him", "her", "them", "his", "hers", "their"]
}

# -------------------- Mönster för dialogstruktur -------------------- #
# Identifierar dialog-separatorer
DIALOG_MARKERS = [
    re.compile(r"^(P1|P2|Person\s+1|Person\s+2|Jag|Du):\s*", re.I),
    re.compile(r"^\[(P1|P2|Person\s+1|Person\s+2)\]:\s*", re.I),
    re.compile(r"^<(P1|P2|Person\s+1|Person\s+2)>\s*", re.I),
]

# Identifierar citat
QUOTE_MARKERS = [
    re.compile(r"^[""''].*[""'']$"),  # Hela raden är citat
    re.compile(r"[""''].*[""'']"),   # Citat i texten
]

# -------------------- Analys -------------------- #
def detect_language(text: str) -> str:
    """Enkel språkdetektering baserat på vanliga ord."""
    sv_words = ["jag", "du", "är", "och", "det", "att", "på"]
    en_words = ["i", "you", "the", "and", "is", "to", "of"]
    
    sv_count = sum(1 for w in sv_words if w in text.lower())
    en_count = sum(1 for w in en_words if w in text.lower())
    
    return "sv" if sv_count > en_count else "en"

def extract_pronouns(text: str, language: str) -> Dict[str, int]:
    """Extraherar pronomen och räknar förekomster."""
    pronouns = SV_PRONOUNS if language == "sv" else EN_PRONOUNS
    counts = {"P1": 0, "P2": 0, "BOTH": 0}
    
    text_lower = text.lower()
    for speaker, pronoun_list in pronouns.items():
        for pronoun in pronoun_list:
            # Använd word boundary för exakt matchning
            pattern = r"\b" + re.escape(pronoun) + r"\b"
            matches = len(re.findall(pattern, text_lower))
            counts[speaker] += matches
    
    return counts

def attribute_speaker_from_text(text: str, language: str, default_speaker: str = "P1") -> Tuple[str, float]:
    """Attribuerar talare baserat på pronomen i texten."""
    
    # Kolla om det finns explicit markör
    for marker in DIALOG_MARKERS:
        m = marker.match(text)
        if m:
            speaker_tag = m.group(1).upper()
            if "P1" in speaker_tag or "PERSON 1" in speaker_tag or "JAG" in speaker_tag:
                return "P1", 0.95
            elif "P2" in speaker_tag or "PERSON 2" in speaker_tag or "DU" in speaker_tag:
                return "P2", 0.95
    
    # Analysera pronomen
    pronoun_counts = extract_pronouns(text, language)
    
    total = sum(pronoun_counts.values())
    if total == 0:
        return default_speaker, 0.3  # Låg confidence om inga pronomen
    
    # Beräkna sannolikhet
    p1_score = pronoun_counts["P1"] + pronoun_counts["BOTH"] * 0.5
    p2_score = pronoun_counts["P2"] + pronoun_counts["BOTH"] * 0.5
    
    if p1_score > p2_score:
        confidence = min(0.9, 0.5 + 0.1 * (p1_score - p2_score))
        return "P1", confidence
    elif p2_score > p1_score:
        confidence = min(0.9, 0.5 + 0.1 * (p2_score - p1_score))
        return "P2", confidence
    else:
        # Oavgjort - använd default
        return default_speaker, 0.4

def split_into_turns(text: str) -> List[str]:
    """Delar text i turer baserat på radbrytningar och dialogmarkörer."""
    # Först, kolla om det redan är strukturerat
    lines = text.split("\n")
    turns = []
    current_turn = []
    
    for line in lines:
        line = line.strip()
        if not line:
            if current_turn:
                turns.append(" ".join(current_turn))
                current_turn = []
            continue
        
        # Kolla om det är en ny tur (dialogmarkör)
        is_new_turn = False
        for marker in DIALOG_MARKERS:
            if marker.match(line):
                is_new_turn = True
                break
        
        if is_new_turn:
            if current_turn:
                turns.append(" ".join(current_turn))
            current_turn = [line]
        else:
            current_turn.append(line)
    
    if current_turn:
        turns.append(" ".join(current_turn))
    
    # Om inga turer hittades, behandla hela texten som en tur
    if not turns:
        turns = [text]
    
    return turns

# -------------------- Core -------------------- #
def run(payload: Dict[str, Any], meta: Dict[str, Any]) -> Dict[str, Any]:
    data = payload.get("data", {}) or {}
    
    # Hämta input
    description = data.get("description", "") or data.get("text", "")
    dialog = data.get("dialog", [])
    
    # Hämta konfiguration
    expected_speakers = meta.get("speakers", ["P1", "P2"])
    default_speaker = meta.get("default_speaker", "P1")
    
    # Detektera språk
    language = detect_language(description)
    
    labeled_thread = []
    
    # Om dialog redan är strukturerad
    if dialog and isinstance(dialog, list):
        for i, turn in enumerate(dialog):
            if isinstance(turn, dict):
                speaker = turn.get("speaker", "UNKNOWN")
                text = turn.get("text", "")
                ts = turn.get("ts", i)
                
                # Om speaker är okänd, försök attribuera
                if speaker == "UNKNOWN" or speaker == "?":
                    speaker, confidence = attribute_speaker_from_text(text, language, default_speaker)
                else:
                    confidence = 0.9  # Hög confidence om speaker redan är given
                
                labeled_thread.append({
                    "speaker": speaker,
                    "text": text,
                    "ts": ts,
                    "confidence": round(confidence, 2)
                })
    else:
        # Parsa från description
        turns = split_into_turns(description)
        
        # Alternera mellan P1 och P2 om inga pronomen hittas
        current_speaker_idx = 0
        
        for i, turn_text in enumerate(turns):
            speaker, confidence = attribute_speaker_from_text(turn_text, language, default_speaker)
            
            # Om confidence är låg och vi har flera turer, alternera
            if confidence < 0.5 and len(turns) > 1:
                speaker = expected_speakers[current_speaker_idx % len(expected_speakers)]
                confidence = 0.4
                current_speaker_idx += 1
            
            labeled_thread.append({
                "speaker": speaker,
                "text": turn_text,
                "ts": i,
                "confidence": round(confidence, 2)
            })
    
    # Beräkna speaker-distribution
    speaker_distribution = {}
    total = len(labeled_thread)
    if total > 0:
        for speaker in expected_speakers:
            count = sum(1 for t in labeled_thread if t["speaker"] == speaker)
            speaker_distribution[speaker] = round(count / total, 2)
    
    # Genomsnittlig confidence
    avg_confidence = sum(t.get("confidence", 0.0) for t in labeled_thread) / max(1, len(labeled_thread))
    
    emits = {
        "labeled_thread": labeled_thread,
        "speaker_confidence": round(avg_confidence, 2),
        "speaker_distribution": speaker_distribution
    }
    
    checks = {
        "CHK-SPEAKER-01": {
            "pass": len(labeled_thread) > 0,
            "reason": f"{len(labeled_thread)} turer attribuerade"
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
        
        res = run(payload, meta)
        res["version"] = f"{AGENT_ID}@{AGENT_VERSION}"
        res["latency_ms"] = int((time.time() - t0) * 1000)
        res["cost"] = {"usd": 0.001}
        
        if args.explain_verbose or meta.get("explain_verbose", False):
            res["rationales"] = [{
                "cue": "speaker_attribution",
                "detail": {
                    "turns_processed": len(res["emits"]["labeled_thread"]),
                    "avg_confidence": res["emits"]["speaker_confidence"],
                    "distribution": res["emits"]["speaker_distribution"]
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
