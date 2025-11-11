#!/usr/bin/env python3
import json
import os
import sys
from typing import Any, Dict, List, Optional


def parse_args() -> Dict[str, Any]:
    args: Dict[str, Any] = {}
    i = 1
    while i < len(sys.argv):
        token = sys.argv[i]
        if token.startswith("--"):
            key = token[2:].replace("-", "_")
            if i + 1 < len(sys.argv) and not sys.argv[i + 1].startswith("--"):
                args[key] = sys.argv[i + 1]
                i += 2
            else:
                args[key] = True
                i += 1
        else:
            if "path" not in args:
                args["path"] = token
            i += 1
    return args


def to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str) and value.strip() != "":
        try:
            return float(value)
        except ValueError:
            return None
    return None


args = parse_args()
PATH = args.get("path") or os.getenv("HONESTY_GATE_PATH", "reports/worldclass_live.norm.jsonl")
MIN_RATE = float(
    args.get("min_honesty_rate")
    or args.get("min_rate")
    or os.getenv("HONESTY_MIN_RATE", "0.10")
)
MIN_REPAIR_ACCEPT = float(
    args.get("min_repair_accept")
    or os.getenv("HONESTY_MIN_REPAIR_ACCEPT", "0.50")
)
ENSURE_NO_ADVICE = (
    args.get("no_advice_when_honest")
    or os.getenv("HONESTY_NO_ADVICE_REQUIRED", "1")
)
if isinstance(ENSURE_NO_ADVICE, str):
    ENSURE_NO_ADVICE = ENSURE_NO_ADVICE.strip().lower()
    ENSURE_NO_ADVICE = ENSURE_NO_ADVICE not in ("0", "false", "no")
else:
    ENSURE_NO_ADVICE = bool(ENSURE_NO_ADVICE)

if not os.path.exists(PATH):
    print(f"[HONESTY_GATE] missing telemetry file: {PATH}")
    sys.exit(1)

bad_advice_sessions: List[str] = []
rate_values: List[float] = []
repair_accept_values: List[float] = []
missing_rate_sessions: List[str] = []
missing_repair_sessions: List[str] = []
checked_events = 0
active_events = 0

with open(PATH, "r", encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("skipped_reason"):
            continue

        honesty = event.get("honesty")
        if not isinstance(honesty, dict):
            continue

        checked_events += 1

        active = bool(honesty.get("active"))
        reasons = honesty.get("reasons") or []
        if not isinstance(reasons, list):
            reasons = []
        if active:
            active_events += 1

        if not active:
            continue

        session_id = event.get("session_id", "unknown")

        # Rate requirement only for brist-fall (reasons present)
        if reasons:
            rate = to_float(honesty.get("rate"))
            if rate is None:
                missing_rate_sessions.append(session_id)
            else:
                rate_values.append(rate)

            repair_accept = to_float(honesty.get("repair_accept_rate"))
            if repair_accept is None:
                missing_repair_sessions.append(session_id)
            else:
                repair_accept_values.append(repair_accept)

        if ENSURE_NO_ADVICE:
            explain = (event.get("kpi") or {}).get("explain") or {}
            no_advice = to_float(explain.get("no_advice"))
            if no_advice is not None and no_advice < 1.0:
                bad_advice_sessions.append(session_id)
            else:
                honesty_no_advice = honesty.get("no_advice")
                if honesty_no_advice is not None and not bool(honesty_no_advice):
                    bad_advice_sessions.append(session_id)

# No honesty events → skip gate (warn only)
if checked_events == 0 or active_events == 0:
    print(f"[HONESTY_GATE] WARNING: no honesty events found in {PATH} (gate skipped)")
    sys.exit(0)

fails = 0

if not ENSURE_NO_ADVICE:
    bad_advice_sessions.clear()

if bad_advice_sessions:
    print(
        f"[HONESTY_GATE] FAIL: advice detected in honesty replies (sessions: {', '.join(bad_advice_sessions[:5])})"
    )
    if len(bad_advice_sessions) > 5:
        print(f"[HONESTY_GATE]   ... and {len(bad_advice_sessions) - 5} more")
    fails += 1

if missing_rate_sessions and MIN_RATE > 0:
    print(
        f"[HONESTY_GATE] FAIL: missing honesty.rate for sessions {', '.join(missing_rate_sessions[:5])}"
    )
    if len(missing_rate_sessions) > 5:
        print(f"[HONESTY_GATE]   ... and {len(missing_rate_sessions) - 5} more")
    fails += 1
elif rate_values:
    min_rate = min(rate_values)
    if min_rate < MIN_RATE:
        print(f"[HONESTY_GATE] FAIL: honesty.rate min {min_rate:.3f} < {MIN_RATE:.3f}")
        fails += 1
else:
    print("[HONESTY_GATE] WARNING: no honesty.rate values found (skipping rate check)")

if missing_repair_sessions and MIN_REPAIR_ACCEPT > 0:
    print(
        f"[HONESTY_GATE] FAIL: missing repair_accept_rate for sessions {', '.join(missing_repair_sessions[:5])}"
    )
    if len(missing_repair_sessions) > 5:
        print(f"[HONESTY_GATE]   ... and {len(missing_repair_sessions) - 5} more")
    fails += 1
elif repair_accept_values:
    min_repair = min(repair_accept_values)
    if min_repair < MIN_REPAIR_ACCEPT:
        print(
            f"[HONESTY_GATE] FAIL: repair_accept_rate min {min_repair:.3f} < {MIN_REPAIR_ACCEPT:.3f}"
        )
        fails += 1
else:
    print("[HONESTY_GATE] WARNING: no repair_accept_rate values found (skipping repair check)")

if fails > 0:
    print(f"[HONESTY_GATE] failures={fails} (checked {checked_events} honesty events)")
    sys.exit(1)

print(
    f"[HONESTY_GATE] OK (checked {checked_events} honesty events, active={active_events}, min_rate={min(rate_values) if rate_values else 'n/a'}, min_repair={min(repair_accept_values) if repair_accept_values else 'n/a'})"
)
