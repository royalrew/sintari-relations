"""
WorldClass Live Telemetry
Steg 131: Brain First Plan - Live KPI measurement

Logs memory and emotion KPIs to worldclass_live.jsonl
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional

# Default paths
DEFAULT_WORLDCLASS_PATH = Path("reports/worldclass_live.jsonl")


def now_iso() -> str:
    """Get current ISO timestamp."""
    return datetime.now(tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def append_jsonl(path: Path, data: Dict[str, Any]) -> None:
    """
    Append JSON line to file.
    
    Args:
        path: Path to JSONL file
        data: Data to append
    """
    # Ensure directory exists
    path.parent.mkdir(parents=True, exist_ok=True)
    
    # Append JSON line
    with open(path, 'a', encoding='utf-8') as f:
        f.write(json.dumps(data, ensure_ascii=False) + '\n')


def _resolve_path(path: Optional[Path]) -> Path:
    if path is not None:
        return path
    env_path = os.getenv("WORLDCLASS_LIVE_PATH")
    if env_path:
        return Path(env_path)
    return DEFAULT_WORLDCLASS_PATH


def log_memory_kpi(
    recall: float,
    hits: int,
    misses: int,
    lat_p95_ms: int,
    path: Optional[Path] = None
) -> None:
    """
    Log memory KPI to worldclass_live.jsonl.
    
    Args:
        recall: Recall score (0-1)
        hits: Number of correct retrievals
        misses: Number of missed retrievals
        lat_p95_ms: p95 latency in milliseconds
        path: Optional path to JSONL file (default: reports/worldclass_live.jsonl)
    """
    target = _resolve_path(path)
    event = {
        "ts": now_iso(),
        "kpi": {
            "memory": {
                "recall": round(recall, 3),
                "hits": hits,
                "misses": misses,
                "latency_p95_ms": lat_p95_ms,
            }
        },
    }
    append_jsonl(target, event)


def log_emotion_kpi(
    f1_score: float,
    tone_drift: float,
    sv_en_parity: float,
    path: Optional[Path] = None
) -> None:
    """
    Log emotion KPI to worldclass_live.jsonl.
    
    Args:
        f1_score: F1 score for emotion detection
        tone_drift: Tone drift (Δton)
        sv_en_parity: SV/EN parity score
        path: Optional path to JSONL file
    """
    target = _resolve_path(path)
    event = {
        "ts": now_iso(),
        "kpi": {
            "emotion": {
                "f1_score": round(f1_score, 3),
                "tone_drift": round(tone_drift, 3),
                "sv_en_parity": round(sv_en_parity, 3),
            }
        },
    }
    append_jsonl(target, event)


def log_persona_kpi(
    delta_ton_without: float,
    delta_ton_with: float,
    path: Optional[Path] = None
) -> None:
    """
    Log persona KPI to worldclass_live.jsonl.
    
    Args:
        delta_ton_without: Tone drift without persona
        delta_ton_with: Tone drift with persona
        path: Optional path to JSONL file
    """
    target = _resolve_path(path)
    event = {
        "ts": now_iso(),
        "kpi": {
            "persona": {
                "delta_ton_without": round(delta_ton_without, 3),
                "delta_ton_with": round(delta_ton_with, 3),
                "improvement": round(delta_ton_without - delta_ton_with, 3),
            }
        },
    }
    append_jsonl(target, event)


def log_si_kpi(
    total_proposals: int,
    memory_proposals: int,
    emotion_proposals: int,
    path: Optional[Path] = None
) -> None:
    """
    Log SI loop KPI to worldclass_live.jsonl.
    
    Args:
        total_proposals: Total number of proposals
        memory_proposals: Number of memory proposals
        emotion_proposals: Number of emotion proposals
        path: Optional path to JSONL file
    """
    target = _resolve_path(path)
    event = {
        "ts": now_iso(),
        "kpi": {
            "si_loop": {
                "total_proposals": total_proposals,
                "memory_proposals": memory_proposals,
                "emotion_proposals": emotion_proposals,
            }
        },
    }
    append_jsonl(target, event)


def log_explain_kpis(
    run_id: str,
    explain_out: Dict[str, Any],
    path: Optional[Path] = None
) -> None:
    """Log explain-layer KPIs to worldclass_live.jsonl."""
    target = _resolve_path(path)
    explain = {
        "coverage": 1.0 if explain_out.get("why") and explain_out.get("patterns") else 0.0,
        "has_evidence": 1.0 if explain_out.get("evidence") else 0.0,
        "no_advice": 1.0 if explain_out.get("no_advice") else 0.0,
        "level": explain_out.get("level", "standard"),
        "style": explain_out.get("style", "warm"),
    }
    event = {
        "ts": now_iso(),
        "run_id": run_id,
        "kpi": {
            "explain": explain,
        },
        "details": {
            "why": explain_out.get("why"),
            "patterns": explain_out.get("patterns", []),
            "reflection": explain_out.get("reflection"),
            "evidence": explain_out.get("evidence", []),
        },
    }
    append_jsonl(target, event)


# -------------------- CLI support -------------------- #

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python worldclass_live.py <command> [args]")
        print("Commands:")
        print("  memory <recall> <hits> <misses> <lat_p95_ms>")
        print("  emotion <f1_score> <tone_drift> <sv_en_parity>")
        print("  persona <delta_ton_without> <delta_ton_with>")
        print("  si <total> <memory> <emotion>")
        sys.exit(1)
    
    cmd = sys.argv[1]
    
    if cmd == "memory":
        if len(sys.argv) < 6:
            print("Usage: python worldclass_live.py memory <recall> <hits> <misses> <lat_p95_ms>")
            sys.exit(1)
        
        recall = float(sys.argv[2])
        hits = int(sys.argv[3])
        misses = int(sys.argv[4])
        lat_p95_ms = int(sys.argv[5])
        
        log_memory_kpi(recall, hits, misses, lat_p95_ms)
        print("✅ Logged memory KPI")
    
    elif cmd == "emotion":
        if len(sys.argv) < 5:
            print("Usage: python worldclass_live.py emotion <f1_score> <tone_drift> <sv_en_parity>")
            sys.exit(1)
        
        f1_score = float(sys.argv[2])
        tone_drift = float(sys.argv[3])
        sv_en_parity = float(sys.argv[4])
        
        log_emotion_kpi(f1_score, tone_drift, sv_en_parity)
        print("✅ Logged emotion KPI")
    
    elif cmd == "persona":
        if len(sys.argv) < 4:
            print("Usage: python worldclass_live.py persona <delta_ton_without> <delta_ton_with>")
            sys.exit(1)
        
        delta_without = float(sys.argv[2])
        delta_with = float(sys.argv[3])
        
        log_persona_kpi(delta_without, delta_with)
        print("✅ Logged persona KPI")
    
    elif cmd == "si":
        if len(sys.argv) < 5:
            print("Usage: python worldclass_live.py si <total> <memory> <emotion>")
            sys.exit(1)
        
        total = int(sys.argv[2])
        memory = int(sys.argv[3])
        emotion = int(sys.argv[4])
        
        log_si_kpi(total, memory, emotion)
        print("✅ Logged SI KPI")
    
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
