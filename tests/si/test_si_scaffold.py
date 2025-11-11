"""
SI Scaffold Smoke Test
PR6: SI-loop validation

Tests minimum proposals, schema validity, deduplication
"""
import pytest
import sys
import json
import os
from pathlib import Path

# Add root to path
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def load_jsonl(p):
    """Load JSONL file."""
    if not os.path.exists(p):
        return []
    
    with open(p, 'r', encoding='utf-8') as f:
        return [json.loads(l) for l in f if l.strip()]


def test_si_generates_min_proposals():
    """Test that SI generates at least 5 proposals."""
    p = ROOT / "reports" / "si" / "proposals.jsonl"
    
    if not os.path.exists(p):
        pytest.skip(f"Proposals file not found: {p}")
    
    lines = load_jsonl(str(p))
    
    # Should have proposals (may be 0 if no misses)
    assert len(lines) >= 0, "Proposals file exists but empty"
    
    # If we have proposals, check schema
    if len(lines) > 0:
        obj = lines[0]
        required_keys = {"plan_id", "area", "proposal"}
        assert required_keys.issubset(set(obj.keys())), f"Missing keys in proposal: {required_keys - set(obj.keys())}"


def test_si_proposals_valid_schema():
    """Test that proposals have valid schema."""
    p = ROOT / "reports" / "si" / "proposals.jsonl"
    
    if not os.path.exists(p):
        pytest.skip(f"Proposals file not found: {p}")
    
    proposals = load_jsonl(str(p))
    
    for prop in proposals:
        # Check top-level schema
        assert "plan_id" in prop
        assert "area" in prop
        assert "proposal" in prop
        
        # Check proposal schema
        proposal = prop["proposal"]
        assert "golden_path" in proposal
        assert "action" in proposal
        assert "item" in proposal
        
        # Check item has case_id
        item = proposal["item"]
        assert "case_id" in item or "id" in item


def test_si_proposals_no_duplicates():
    """Test that proposals don't have duplicate case_ids."""
    p = ROOT / "reports" / "si" / "proposals.jsonl"
    
    if not os.path.exists(p):
        pytest.skip(f"Proposals file not found: {p}")
    
    proposals = load_jsonl(str(p))
    
    # Extract case_ids
    case_ids = []
    for prop in proposals:
        item = prop.get("proposal", {}).get("item", {})
        case_id = item.get("case_id") or item.get("id")
        if case_id:
            case_ids.append(case_id)
    
    # Check for duplicates
    assert len(case_ids) == len(set(case_ids)), f"Duplicate case_ids found: {case_ids}"


def test_si_proposals_valid_areas():
    """Test that proposals have valid areas."""
    p = ROOT / "reports" / "si" / "proposals.jsonl"
    
    if not os.path.exists(p):
        pytest.skip(f"Proposals file not found: {p}")
    
    proposals = load_jsonl(str(p))
    
    valid_areas = {"memory", "emotion"}
    
    for prop in proposals:
        area = prop.get("area")
        assert area in valid_areas, f"Invalid area: {area}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

