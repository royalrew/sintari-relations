"""
SI Emotion Plan - Emotion Self-Improvement
PR6: SI-loop scaffold

Generates new golden cases from emotion false negatives/positives
"""
import sys
import json
from pathlib import Path

# Add parent directory to path
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agents.self_improve.si_core import append_jsonl, generate_plan_id


def propose_from_emotion(eval_path: str, out_path: str, k: int = 5) -> int:
    """
    Generate emotion proposals from eval misses.
    
    Args:
        eval_path: Path to emotion_eval.json
        out_path: Path to proposals output
        k: Number of proposals to generate
    
    Returns:
        Number of proposals generated
    """
    from agents.self_improve.si_core import load_json
    
    # Load eval results
    if not Path(eval_path).exists():
        print(f"[SI Emotion] Eval file not found at {eval_path}")
        return 0
    
    eval_data = load_json(eval_path)
    misses = eval_data.get("misses", [])
    
    if not misses:
        print(f"[SI Emotion] No misses found in {eval_path}")
        return 0
    
    proposals = 0
    
    for miss in misses[:k]:
        if proposals >= k:
            break
        
        # Generate case ID
        case_id = f"E{900 + proposals + 1}"
        
        # Determine reason
        reason = "FN"  # Default to false negative
        
        if miss.get("expected") != miss.get("detected"):
            reason = "FP" if miss.get("detected") != "neutral" else "FN"
        
        # Create proposal item
        item = {
            "case_id": case_id,
            "text": miss.get("text", "")[:200],  # Truncate
            "expected": miss.get("expected", "neutral"),
            "lang": miss.get("lang", "sv")
        }
        
        # Create proposal
        proposal = {
            "plan_id": generate_plan_id("emotion"),
            "area": "emotion",
            "reason": reason,
            "source_case_id": miss.get("id", ""),
            "proposal": {
                "golden_path": "tests/golden/emotion/micro_mood_golden.jsonl",
                "action": "append",
                "item": item
            }
        }
        
        # Append proposal
        append_jsonl(out_path, proposal)
        proposals += 1
    
    print(f"[SI Emotion] Generated {proposals} proposals")
    return proposals


# -------------------- CLI support -------------------- #

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python si_emotion_plan.py <eval_path> <out_path> [k]")
        sys.exit(1)
    
    eval_path = sys.argv[1]
    out_path = sys.argv[2]
    k = int(sys.argv[3]) if len(sys.argv) > 3 else 5
    
    count = propose_from_emotion(eval_path, out_path, k)
    print(f"Generated {count} emotion proposals")

