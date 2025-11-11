#!/usr/bin/env python3
"""
Canary Drift Alarm & Auto-Backoff

Monitors style gate breaches and automatically reduces canary percentage
after 3 consecutive breaches within 15 minutes.
"""
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any, Optional

STATE_FILE = Path("reports/si/canary_drift_state.json")
LOG_FILE = Path("reports/si/canary_drift_log.jsonl")
TELEMETRY_FILE = Path("reports/worldclass_live.norm.jsonl")
CANARY_STATE_FILE = Path("reports/si/canary_state.json")

# Thresholds
P95_TONE_DELTA_MAX = 0.05
P95_ECHO_MAX = 0.05
MAX_QUESTIONS = 1
MIN_LIKE = 0.90
BREACH_WINDOW_MINUTES = 15
CONSECUTIVE_BREACHES_THRESHOLD = 3

def load_state() -> Dict[str, Any]:
    """Load drift alarm state."""
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except:
            pass
    return {
        "breaches": [],
        "last_check": None,
        "consecutive_breaches": 0,
        "last_backoff": None,
    }

def save_state(state: Dict[str, Any]):
    """Save drift alarm state."""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")

def p95(nums: List[float]) -> float:
    """Calculate p95."""
    if not nums:
        return 0.0
    sorted_nums = sorted(nums)
    idx = int(0.95 * (len(sorted_nums) - 1))
    return sorted_nums[idx]

def check_breach(telemetry_path: Path) -> Optional[Dict[str, Any]]:
    """Check if current telemetry breaches thresholds."""
    if not telemetry_path.exists():
        return None
    
    events: List[Dict[str, Any]] = []
    tone_deltas: List[float] = []
    echo_ratios: List[float] = []
    failing_sessions: List[str] = []
    
    with open(telemetry_path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            events.append(event)
            style = event.get("style", {})
            tone_deltas.append(style.get("tone_delta", 0))
            echo_ratios.append(style.get("echo_ratio", 0))
            
            # Check individual event
            if (style.get("echo_ratio", 0) > P95_ECHO_MAX or
                style.get("question_count", 0) > MAX_QUESTIONS or
                style.get("likability_proxy", 1) < MIN_LIKE):
                session_id = event.get("session_id", "unknown")
                if session_id not in failing_sessions:
                    failing_sessions.append(session_id)
    
    if not events:
        return None
    
    p95_tone = p95(tone_deltas)
    p95_echo = p95(echo_ratios)
    
    breaches = []
    if p95_tone > P95_TONE_DELTA_MAX:
        breaches.append(f"p95_tone_delta={p95_tone:.4f}")
    if p95_echo > P95_ECHO_MAX:
        breaches.append(f"p95_echo={p95_echo:.4f}")
    
    if breaches or failing_sessions:
        return {
            "ts": datetime.utcnow().isoformat() + "Z",
            "breaches": breaches,
            "failing_sessions": failing_sessions[:10],
            "p95_tone": p95_tone,
            "p95_echo": p95_echo,
            "events_checked": len(events),
        }
    
    return None

def log_breach(breach: Dict[str, Any], why: str, sample_reply: Optional[str] = None):
    """Log breach to JSONL."""
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        **breach,
        "why": why,
        "sample_reply": sample_reply,
    }
    with open(LOG_FILE, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry) + "\n")

def reduce_canary():
    """Reduce canary percentage by 5%."""
    if not CANARY_STATE_FILE.exists():
        print("[DRIFT_ALARM] Canary state file not found — skip backoff")
        return False
    
    try:
        state = json.loads(CANARY_STATE_FILE.read_text(encoding="utf-8"))
        current_pct = state.get("percent", 0)
        new_pct = max(0, current_pct - 5)
        
        state["percent"] = new_pct
        state["last_action_ts"] = int(datetime.utcnow().timestamp())
        state["fails_in_row"] = (state.get("fails_in_row", 0) + 1)
        state["passes_in_row"] = 0
        
        CANARY_STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")
        print(f"[DRIFT_ALARM] Reduced canary from {current_pct}% to {new_pct}%")
        return True
    except Exception as e:
        print(f"[DRIFT_ALARM] Failed to reduce canary: {e}")
        return False

def parse_args():
    """Parse command line arguments."""
    args = {}
    i = 1
    while i < len(sys.argv):
        arg = sys.argv[i]
        if arg.startswith("--"):
            key = arg[2:].replace("-", "_")
            if i + 1 < len(sys.argv) and not sys.argv[i + 1].startswith("--"):
                args[key] = sys.argv[i + 1]
                i += 2
            else:
                args[key] = True
                i += 1
        else:
            i += 1
    return args

def main():
    """Main drift alarm logic."""
    args = parse_args()
    
    # Override defaults with args
    global TELEMETRY_FILE, LOG_FILE, BREACH_WINDOW_MINUTES, CONSECUTIVE_BREACHES_THRESHOLD
    if args.get("in"):
        TELEMETRY_FILE = Path(args["in"])
    if args.get("out"):
        LOG_FILE = Path(args["out"])
    if args.get("window_min"):
        BREACH_WINDOW_MINUTES = int(args["window_min"])
    if args.get("breach"):
        CONSECUTIVE_BREACHES_THRESHOLD = int(args["breach"])
    
    state = load_state()
    now = datetime.utcnow()
    
    # Check for breach
    breach = check_breach(TELEMETRY_FILE)
    
    if breach:
        # Add to breach history
        state["breaches"].append({
            "ts": breach["ts"],
            "breaches": breach["breaches"],
        })
        
        # Clean old breaches (outside window)
        cutoff = now - timedelta(minutes=BREACH_WINDOW_MINUTES)
        state["breaches"] = [
            b for b in state["breaches"]
            if datetime.fromisoformat(b["ts"].replace("Z", "+00:00")).replace(tzinfo=None) > cutoff
        ]
        
        # Count consecutive breaches
        consecutive = len(state["breaches"])
        state["consecutive_breaches"] = consecutive
        
        # Log breach
        why = f"Breaches: {', '.join(breach['breaches'])}; Sessions: {len(breach.get('failing_sessions', []))}"
        log_breach(breach, why)
        
        print(f"[DRIFT_ALARM] Breach detected: {why}")
        print(f"[DRIFT_ALARM] Consecutive breaches in last {BREACH_WINDOW_MINUTES}min: {consecutive}")
        
        # Auto-backoff if threshold reached
        if consecutive >= CONSECUTIVE_BREACHES_THRESHOLD:
            print(f"[DRIFT_ALARM] ⚠️ Threshold reached ({consecutive} breaches) — reducing canary")
            if reduce_canary():
                state["last_backoff"] = now.isoformat() + "Z"
                state["consecutive_breaches"] = 0  # Reset after backoff
                state["breaches"] = []  # Clear history
    else:
        # No breach — reset counter
        if state["consecutive_breaches"] > 0:
            print(f"[DRIFT_ALARM] ✅ No breach — resetting counter (was {state['consecutive_breaches']})")
        state["consecutive_breaches"] = 0
        state["breaches"] = []
    
    state["last_check"] = now.isoformat() + "Z"
    save_state(state)
    
    if breach and state["consecutive_breaches"] >= CONSECUTIVE_BREACHES_THRESHOLD:
        sys.exit(1)  # Exit with error to trigger alerts
    sys.exit(0)

if __name__ == "__main__":
    main()

