"""
SI Memory Plan - Memory Self-Improvement
PR6: SI-loop scaffold

Generates new golden cases from memory misses
"""
import sys
from pathlib import Path
from datetime import datetime

# Add parent directory to path
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agents.self_improve.si_core import load_jsonl, cluster_texts, append_jsonl, generate_plan_id


def propose_from_memory(miss_path: str, out_path: str, k: int = 5) -> int:
    """
    Generate memory proposals from misses.
    
    Args:
        miss_path: Path to misses.jsonl
        out_path: Path to proposals output
        k: Number of proposals to generate
    
    Returns:
        Number of proposals generated
    """
    # Load misses
    misses = list(load_jsonl(miss_path))
    
    if not misses:
        print(f"[SI Memory] No misses found at {miss_path}")
        return 0
    
    # Cluster misses by input text
    clusters = cluster_texts(misses, key="input", min_len=20)
    
    proposals = 0
    
    for cluster in clusters[:k]:
        if proposals >= k:
            break
        
        # Use first item in cluster as representative
        m = cluster[0]
        
        # Generate case ID
        case_id = f"M{900 + proposals + 1}"
        
        # Create proposal item
        item = {
            "case_id": case_id,
            "input": m.get("input", ""),
            "expect_recall_keys": m.get("needed_keys", []),
            "allow_distractors": True
        }
        
        # Create proposal
        proposal = {
            "plan_id": generate_plan_id("memory"),
            "area": "memory",
            "reason": m.get("reason", "FN"),
            "source_case_id": m.get("case_id", ""),
            "proposal": {
                "golden_path": "tests/golden/relations/gold/memory_multiturn.jsonl",
                "action": "append",
                "item": item
            }
        }
        
        # Append proposal
        append_jsonl(out_path, proposal)
        proposals += 1
    
    print(f"[SI Memory] Generated {proposals} proposals")
    return proposals


# -------------------- CLI support -------------------- #

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python si_memory_plan.py <miss_path> <out_path> [k]")
        sys.exit(1)
    
    miss_path = sys.argv[1]
    out_path = sys.argv[2]
    k = int(sys.argv[3]) if len(sys.argv) > 3 else 5
    
    count = propose_from_memory(miss_path, out_path, k)
    print(f"Generated {count} memory proposals")

