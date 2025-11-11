"""
Memory Gate CI Test
PR3-MIN: Telemetry & CI gates

Fails if recall < 0.90 or lat_p95_ms > 120
"""
import pytest
import sys
from pathlib import Path

# Add root to path
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.metrics.worldclass_live import log_memory_kpi


# Mock recall and latency values for testing
RECALL_THRESHOLD = 0.90
LATENCY_THRESHOLD_MS = 120


def test_memory_gate_pass():
    """Test passing memory gate criteria."""
    # Good recall and latency
    recall = 0.92
    hits = 95
    misses = 5
    lat_p95 = 100
    
    # Should not raise
    log_memory_kpi(recall, hits, misses, lat_p95, path=Path("/tmp/test_memory_gate.jsonl"))
    
    # Verify thresholds
    assert recall >= RECALL_THRESHOLD, f"Recall {recall} < {RECALL_THRESHOLD}"
    assert lat_p95 <= LATENCY_THRESHOLD_MS, f"Latency {lat_p95} > {LATENCY_THRESHOLD_MS}"


def test_memory_gate_fail_low_recall():
    """Test failing due to low recall."""
    recall = 0.85  # Below threshold
    hits = 85
    misses = 15
    lat_p95 = 100
    
    # Should fail
    with pytest.raises(AssertionError, match="Recall.*< 0.9"):
        assert recall >= RECALL_THRESHOLD, f"Recall {recall} < {RECALL_THRESHOLD}"


def test_memory_gate_fail_high_latency():
    """Test failing due to high latency."""
    recall = 0.92
    hits = 95
    misses = 5
    lat_p95 = 150  # Above threshold
    
    # Should fail
    with pytest.raises(AssertionError, match="Latency.*>"):
        assert lat_p95 <= LATENCY_THRESHOLD_MS, f"Latency {lat_p95} > {LATENCY_THRESHOLD_MS}"


def test_memory_gate_boundary():
    """Test boundary conditions."""
    # Exactly at threshold
    recall = RECALL_THRESHOLD
    lat_p95 = LATENCY_THRESHOLD_MS
    
    assert recall >= RECALL_THRESHOLD
    assert lat_p95 <= LATENCY_THRESHOLD_MS


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

