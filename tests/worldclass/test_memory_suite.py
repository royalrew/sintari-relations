"""
Memory Worldclass Test Suite - CI Gates
Tests memory retrieval performance against thresholds
"""

import json
import pytest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Add tests directory to path for imports
tests_dir = ROOT / "tests"
if str(tests_dir) not in sys.path:
    sys.path.insert(0, str(tests_dir))

try:
    from memory.eval_memory import evaluate_memory, check_thresholds
except ImportError as e:
    # Fallback: try direct import
    import importlib.util
    eval_memory_path = ROOT / "tests" / "memory" / "eval_memory.py"
    if eval_memory_path.exists():
        spec = importlib.util.spec_from_file_location("eval_memory", eval_memory_path)
        eval_memory = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(eval_memory)
        evaluate_memory = eval_memory.evaluate_memory
        check_thresholds = eval_memory.check_thresholds
    else:
        raise ImportError(f"Cannot import eval_memory: {e}")

from agents.memory.dialog_memory_v2 import DialogMemoryV2
from scripts.tune_memory import load_golden


@pytest.fixture
def memory():
    """Initialize memory for tests."""
    return DialogMemoryV2()


@pytest.fixture
def golden_cases():
    """Load golden test cases."""
    golden_path = ROOT / "tests" / "memory" / "golden" / "*.jsonl"
    cases = load_golden(str(golden_path))
    return cases


@pytest.fixture
def best_config():
    """Load best config."""
    config_path = ROOT / "configs" / "memory" / "v2" / "2025-11-06.json"
    if not config_path.exists():
        pytest.skip(f"Config not found: {config_path}")
    return str(config_path)


def test_memory_hit_at_3(memory, golden_cases, best_config):
    """CI-gate: Hit@3 >= 0.70"""
    metrics = evaluate_memory(golden_cases, best_config, memory)
    hit_at_3 = metrics.get('hit_at_3', 0.0)
    print(f"\n[DEBUG] Hit@3: {hit_at_3:.3f} (threshold: 0.70)")
    print(f"[DEBUG] All metrics: {metrics}")
    assert hit_at_3 >= 0.70, f"Hit@3 {hit_at_3:.3f} < 0.70"


def test_memory_mrr(memory, golden_cases, best_config):
    """CI-gate: MRR >= 0.65"""
    metrics = evaluate_memory(golden_cases, best_config, memory)
    mrr = metrics.get('mrr', 0.0)
    print(f"\n[DEBUG] MRR: {mrr:.3f} (threshold: 0.65)")
    assert mrr >= 0.65, f"MRR {mrr:.3f} < 0.65"


def test_memory_p95_latency(memory, golden_cases, best_config):
    """CI-gate: P95 latency < 150ms"""
    metrics = evaluate_memory(golden_cases, best_config, memory)
    p95 = metrics.get('p95_latency_ms', 999.0)
    assert p95 < 150.0, f"P95 latency {p95:.1f}ms >= 150ms"


def test_memory_fail_rate(memory, golden_cases, best_config):
    """CI-gate: Fail rate < 1%"""
    metrics = evaluate_memory(golden_cases, best_config, memory)
    fail_rate = metrics.get('fail_rate', 1.0)
    assert fail_rate < 0.01, f"Fail rate {fail_rate:.3f} >= 0.01"


def test_memory_dup_rate(memory, golden_cases, best_config):
    """CI-gate: Dup rate < 5%"""
    metrics = evaluate_memory(golden_cases, best_config, memory)
    dup_rate = metrics.get('dup_rate', 1.0)
    assert dup_rate < 0.05, f"Dup rate {dup_rate:.3f} >= 0.05"


def test_memory_all_thresholds(memory, golden_cases, best_config):
    """CI-gate: All thresholds must pass"""
    metrics = evaluate_memory(golden_cases, best_config, memory)
    threshold_results = check_thresholds(metrics)
    
    print(f"\n[DEBUG] Metrics: {metrics}")
    print(f"[DEBUG] Threshold results: {threshold_results}")
    
    failed = [k for k, v in threshold_results.items() if not v]
    assert len(failed) == 0, f"Thresholds failed: {failed}"

