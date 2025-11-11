#!/usr/bin/env python3
"""
Language Parity Gate

Measures likability_proxy gap between SV/EN seeds and validates language matching.
"""
import json
import os
import sys
from typing import Dict, List, Any, Tuple
from collections import defaultdict

def p95(nums: List[float]) -> float:
    if not nums:
        return 0.0
    sorted_nums = sorted(nums)
    idx = int(0.95 * (len(sorted_nums) - 1))
    return sorted_nums[idx]

def detect_language(text: str) -> str:
    """Detect language from text."""
    if not text:
        return "unknown"
    text_lower = text.lower()
    has_swedish = any(c in text for c in "åäöÅÄÖ") or any(
        word in text_lower for word in ["jag", "hur", "vad", "varför", "du", "vi", "idag"]
    )
    has_english = any(
        word in text_lower for word in ["what", "how", "why", "you", "we", "i", "today", "right now", "suggest", "step"]
    )
    if has_english and not has_swedish:
        return "en"
    if has_swedish:
        return "sv"
    return "unknown"

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "reports/worldclass_live.norm.jsonl"
    parity_threshold = float(os.getenv("PARITY_P95_LIKE_GAP", "0.02"))
    strict_lang_match = os.getenv("STRICT_LANG_MATCH", "false").lower() == "true"

    if not os.path.exists(path):
        print(f"[PARITY_GATE] missing file: {path}")
        sys.exit(1)

    events: List[Dict[str, Any]] = []
    sv_likes: List[float] = []
    en_likes: List[float] = []
    lang_mismatches: List[str] = []

    with open(path, "r", encoding="utf-8") as fh:
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

            events.append(event)
            style = event.get("style", {})
            like = style.get("likability_proxy", 0)
            reply_text = event.get("reply_text", "")
            seed_id = event.get("seed_id", "")

            # Detect language from reply
            detected_lang = detect_language(reply_text)
            
            # Check for language mismatch if strict mode
            if strict_lang_match and seed_id:
                if seed_id.endswith("_en") and detected_lang != "en":
                    lang_mismatches.append(f"{seed_id}: expected EN, got {detected_lang}")
                elif seed_id.endswith("_sv") and detected_lang == "en":
                    lang_mismatches.append(f"{seed_id}: expected SV, got EN")

            # Group by seed language hint
            if "_en" in seed_id.lower() or event.get("locale") == "en":
                en_likes.append(like)
            elif "_sv" in seed_id.lower() or not event.get("locale"):
                sv_likes.append(like)

    if not events:
        print("[PARITY_GATE] WARNING: No events found")
        sys.exit(0)

    # Calculate p95 gap
    p95_sv = p95(sv_likes) if sv_likes else 0
    p95_en = p95(en_likes) if en_likes else 0
    gap = abs(p95_sv - p95_en)

    fails = 0
    if gap > parity_threshold:
        print(f"[PARITY_GATE] FAIL: likability_proxy gap {gap:.4f} > {parity_threshold}")
        print(f"[PARITY_GATE] SV p95={p95_sv:.4f}, EN p95={p95_en:.4f}")
        fails += 1

    if lang_mismatches:
        print(f"[PARITY_GATE] FAIL: {len(lang_mismatches)} language mismatches")
        for mismatch in lang_mismatches[:10]:
            print(f"[PARITY_GATE]   {mismatch}")
        if len(lang_mismatches) > 10:
            print(f"[PARITY_GATE]   ... and {len(lang_mismatches) - 10} more")
        fails += 1

    if fails > 0:
        sys.exit(1)

    print(f"[PARITY_GATE] OK (gap={gap:.4f}, SV={len(sv_likes)}, EN={len(en_likes)})")
    sys.exit(0)

if __name__ == "__main__":
    main()

