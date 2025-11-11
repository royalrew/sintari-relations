#!/usr/bin/env python3
import json
import os
import sys
from typing import List, Dict, Any

def parse_args():
    args = {}
    i = 1
    while i < len(sys.argv):
        if sys.argv[i].startswith("--"):
            key = sys.argv[i][2:].replace("-", "_")
            if i + 1 < len(sys.argv) and not sys.argv[i + 1].startswith("--"):
                args[key] = sys.argv[i + 1]
                i += 2
            else:
                args[key] = True
                i += 1
        else:
            if "path" not in args:
                args["path"] = sys.argv[i]
            i += 1
    return args

def p95(nums: List[float]) -> float:
    if not nums:
        return 0.0
    sorted_nums = sorted(nums)
    idx = int(0.95 * (len(sorted_nums) - 1))
    return sorted_nums[idx]

args = parse_args()
PATH = args.get("path") or os.getenv("STYLE_GATE_PATH", "reports/worldclass_live.norm.jsonl")
P95_TONE_DELTA = float(args.get("p95_tone_delta") or os.getenv("STYLE_P95_TONE_DELTA", "0.05"))
P95_ECHO = float(args.get("p95_echo") or os.getenv("STYLE_P95_ECHO", "0.05"))
MAX_QUESTIONS = int(args.get("max_questions") or os.getenv("STYLE_MAX_QUESTIONS", "1"))
MIN_LIKE = float(args.get("min_like") or os.getenv("STYLE_MIN_LIKE", "0.90"))
PARITY_P95_LIKE_GAP = float(args.get("parity_p95_like_gap") or os.getenv("PARITY_P95_LIKE_GAP", "0.02"))
STRICT_LANG_MATCH = args.get("strict_lang_match") or os.getenv("STRICT_LANG_MATCH", "false").lower() == "true"

if not os.path.exists(PATH):
    print(f"[STYLE_GATE] missing telemetry file: {PATH}")
    sys.exit(1)

events: List[Dict[str, Any]] = []
tone_deltas: List[float] = []
echo_ratios: List[float] = []
failing_sessions: List[str] = []
sv_likes: List[float] = []
en_likes: List[float] = []
lang_mismatches: List[str] = []

def detect_language(text: str) -> str:
    """Detect language from text."""
    if not text:
        return "unknown"
    text_lower = text.lower().replace("\u2019", "'")
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

with open(PATH, "r", encoding="utf-8") as fh:
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
        tone_delta = style.get("tone_delta", 0)
        echo_ratio = style.get("echo_ratio", 0)
        tone_deltas.append(tone_delta)
        echo_ratios.append(echo_ratio)
        
        # Language parity tracking
        like = style.get("likability_proxy", 0)
        reply_text = event.get("reply_text", "")
        seed_id = event.get("seed_id") or ""
        detected_lang = (event.get("debug") or {}).get("detected_lang") or detect_language(reply_text)
        
        if STRICT_LANG_MATCH:
            expected_lang = event.get("locale") or (seed_id.endswith("_en") and "en") or (seed_id.endswith("_sv") and "sv") or None
            if expected_lang:
                if expected_lang == "en" and detected_lang != "en":
                    lang_mismatches.append(f"{seed_id}: expected EN (locale={event.get('locale')}), got {detected_lang}")
                elif expected_lang == "sv" and detected_lang == "en":
                    lang_mismatches.append(f"{seed_id}: expected SV (locale={event.get('locale')}), got EN")
        
        if "_en" in seed_id.lower() or event.get("locale") == "en":
            en_likes.append(like)
        elif "_sv" in seed_id.lower() or not event.get("locale"):
            sv_likes.append(like)

if not events:
    print(f"[STYLE_GATE] WARNING: No events found in {PATH} (gate skipped)")
    sys.exit(0)

# Calculate p95 metrics
p95_tone = p95(tone_deltas)
p95_echo = p95(echo_ratios)

# Check individual events
fails = 0
for event in events:
    session_id = event.get("session_id", "unknown")
    style = event.get("style", {})
    kpi = event.get("kpi", {})
    
    event_failed = False
    
    # Individual checks
    if style.get("echo_ratio", 0) > P95_ECHO:
        event_failed = True
    if style.get("question_count", 0) > MAX_QUESTIONS:
        event_failed = True
    if style.get("likability_proxy", 1) < MIN_LIKE:
        event_failed = True
    
    # KPI checks (allow int 1 or float 1.0)
    explain = kpi.get("explain", {})
    if float(explain.get("coverage", 0)) < 1.0:
        event_failed = True
    
    memory = kpi.get("memory", {})
    if float(memory.get("hit_at_3", 0)) < 1.0:
        event_failed = True
    
    if event_failed:
        fails += 1
        if session_id not in failing_sessions:
            failing_sessions.append(session_id)

# p95 checks
if p95_tone > P95_TONE_DELTA:
    print(f"[STYLE_GATE] FAIL: p95 tone_delta {p95_tone:.4f} > {P95_TONE_DELTA}")
    fails += 1

if p95_echo > P95_ECHO:
    print(f"[STYLE_GATE] FAIL: p95 echo_ratio {p95_echo:.4f} > {P95_ECHO}")
    fails += 1

# Language parity check
if PARITY_P95_LIKE_GAP > 0:
    p95_sv = p95(sv_likes) if sv_likes else 0
    p95_en = p95(en_likes) if en_likes else 0
    gap = abs(p95_sv - p95_en)
    if gap > PARITY_P95_LIKE_GAP:
        print(f"[STYLE_GATE] FAIL: likability_proxy gap {gap:.4f} > {PARITY_P95_LIKE_GAP}")
        print(f"[STYLE_GATE] SV p95={p95_sv:.4f}, EN p95={p95_en:.4f}")
        fails += 1

# Strict language matching
if STRICT_LANG_MATCH and lang_mismatches:
    print(f"[STYLE_GATE] FAIL: {len(lang_mismatches)} language mismatches")
    for mismatch in lang_mismatches[:5]:
        print(f"[STYLE_GATE]   {mismatch}")
    if len(lang_mismatches) > 5:
        print(f"[STYLE_GATE]   ... and {len(lang_mismatches) - 5} more")
    fails += 1

if fails > 0:
    print(f"[STYLE_GATE] failures={fails} (checked {len(events)} events)")
    if failing_sessions:
        print(f"[STYLE_GATE] failing sessions: {', '.join(failing_sessions[:10])}")
        if len(failing_sessions) > 10:
            print(f"[STYLE_GATE] ... and {len(failing_sessions) - 10} more")
    sys.exit(1)

print(f"[STYLE_GATE] OK (checked {len(events)} events, p95_tone={p95_tone:.4f}, p95_echo={p95_echo:.4f})")
