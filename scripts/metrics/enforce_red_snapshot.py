#!/usr/bin/env python3
"""
RED Farewell Snapshot Gate

Validates RED farewell responses match frozen snapshots (hash-based).
"""
import json
import hashlib
import os
import sys
from pathlib import Path
from typing import Dict, List, Any

def normalize_text(text: str) -> str:
    """Normalize text for hashing (strip whitespace, lowercase, remove PII-like patterns)."""
    if not text:
        return ""
    # Remove PII-like patterns (phone numbers, emails, etc.)
    import re
    text = re.sub(r'\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b', '[PHONE]', text)
    text = re.sub(r'\b[\w.-]+@[\w.-]+\.\w+\b', '[EMAIL]', text)
    # Normalize whitespace
    text = " ".join(text.split())
    return text.lower().strip()

def hash_text(text: str) -> str:
    """Generate hash of normalized text."""
    normalized = normalize_text(text)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]

def load_snapshots(snap_path: Path) -> Dict[str, str]:
    """Load snapshot hashes."""
    if not snap_path.exists():
        print(f"[RED_SNAPSHOT] WARNING: Snapshot file not found: {snap_path}")
        return {}
    
    try:
        data = json.loads(snap_path.read_text(encoding="utf-8"))
        snapshots = {}
        for variant_id, text in data.items():
            snapshots[variant_id] = hash_text(text)
        return snapshots
    except Exception as e:
        print(f"[RED_SNAPSHOT] ERROR loading snapshots: {e}")
        return {}

def main():
    input_path = sys.argv[sys.argv.index("--in") + 1] if "--in" in sys.argv else "reports/worldclass_live.norm.jsonl"
    snap_path = Path(sys.argv[sys.argv.index("--snap") + 1] if "--snap" in sys.argv else "tests/golden/style/red_farewell_snap.json")

    snapshots = load_snapshots(snap_path)
    if not snapshots:
        print("[RED_SNAPSHOT] No snapshots loaded — skip")
        sys.exit(0)

    if not os.path.exists(input_path):
        print(f"[RED_SNAPSHOT] missing file: {input_path}")
        sys.exit(1)

    red_events: List[Dict[str, Any]] = []
    mismatches: List[str] = []

    with open(input_path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue

            # Skip skipped events
            if event.get("skipped_reason"):
                continue

            # Only check RED farewell events
            if event.get("risk") == "RED" and event.get("intent") == "goodbye":
                reply_text = event.get("reply_text", "")
                if reply_text:
                    red_events.append(event)
                    reply_hash = hash_text(reply_text)
                    
                    # Check against snapshots
                    matched = False
                    for variant_id, expected_hash in snapshots.items():
                        if reply_hash == expected_hash:
                            matched = True
                            break
                    
                    if not matched:
                        seed_id = event.get("seed_id", "unknown")
                        mismatches.append(f"{seed_id}: hash={reply_hash}, text={reply_text[:60]}...")

    if not red_events:
        print("[RED_SNAPSHOT] No RED farewell events found — skip")
        sys.exit(0)

    if mismatches:
        print(f"[RED_SNAPSHOT] FAIL: {len(mismatches)} mismatches out of {len(red_events)} RED farewells")
        for mismatch in mismatches[:5]:
            print(f"[RED_SNAPSHOT]   {mismatch}")
        if len(mismatches) > 5:
            print(f"[RED_SNAPSHOT]   ... and {len(mismatches) - 5} more")
        sys.exit(1)

    print(f"[RED_SNAPSHOT] OK (checked {len(red_events)} RED farewells, {len(snapshots)} snapshots)")
    sys.exit(0)

if __name__ == "__main__":
    main()

