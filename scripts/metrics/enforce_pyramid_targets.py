#!/usr/bin/env python3
"""
Enforce Pyramid Targets - CI checker

Verifierar att pyramid-fördelning ligger inom målen och exit 1 om inte.
"""

import json
import sys
import pathlib
from collections import defaultdict

# Version: 2025-01-30-pyramid-pass
PyramidTargets = {
    "VERSION": "2025-01-30-pyramid-pass",
    "LOCKED": True,
}

# Target intervals (FAIL-FAST: strict bounds for CI)
TARGETS = {
    "fastpath": (22.0, 25.0),  # 22-25% (FAIL if outside)
    "base": (72.0, 78.0),      # 72-78% (FAIL if outside)
    "mid": (12.0, 18.0),       # 12-18% (allows slight variation)
    "top": (4.0, 6.0),         # 4-6% (FAIL if outside)
}


def load_jsonl(filepath: str):
    """Load JSONL file."""
    results = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                results.append(json.loads(line))
            except Exception:
                continue
    return results


def analyze_distribution(results):
    """Calculate pyramid distribution."""
    stats = defaultdict(int)
    
    for r in results:
        routing = r.get('routing', {})
        tier = routing.get('tier', 'unknown')
        stats[tier] += 1
    
    total = len(results)
    fastpath_count = stats.get('fastpath', 0)
    routed_count = stats.get('base', 0) + stats.get('mid', 0) + stats.get('top', 0)
    
    if routed_count == 0:
        return {
            'total': total,
            'fastpath': fastpath_count,
            'distribution': {},
        }
    
    return {
        'total': total,
        'fastpath': fastpath_count,
        'base': stats.get('base', 0),
        'mid': stats.get('mid', 0),
        'top': stats.get('top', 0),
        'distribution': {
            'fastpath_pct': (fastpath_count / total * 100) if total > 0 else 0,
            'base_pct': (stats.get('base', 0) / routed_count * 100) if routed_count > 0 else 0,
            'mid_pct': (stats.get('mid', 0) / routed_count * 100) if routed_count > 0 else 0,
            'top_pct': (stats.get('top', 0) / routed_count * 100) if routed_count > 0 else 0,
        },
    }


def check_targets(distribution):
    """Check if distribution meets targets."""
    dist = distribution['distribution']
    errors = []
    
    # Check FastPath (of total)
    fastpath_pct = dist.get('fastpath_pct', 0)
    min_fp, max_fp = TARGETS['fastpath']
    if not (min_fp <= fastpath_pct <= max_fp):
        errors.append(f"FastPath: {fastpath_pct:.1f}% (target: {min_fp}-{max_fp}%)")
    
    # Check Base (of routed)
    base_pct = dist.get('base_pct', 0)
    min_base, max_base = TARGETS['base']
    if not (min_base <= base_pct <= max_base):
        errors.append(f"Base: {base_pct:.1f}% (target: {min_base}-{max_base}%)")
    
    # Check Mid (of routed)
    mid_pct = dist.get('mid_pct', 0)
    min_mid, max_mid = TARGETS['mid']
    if not (min_mid <= mid_pct <= max_mid):
        errors.append(f"Mid: {mid_pct:.1f}% (target: {min_mid}-{max_mid}%)")
    
    # Check Top (of routed)
    top_pct = dist.get('top_pct', 0)
    min_top, max_top = TARGETS['top']
    if not (min_top <= top_pct <= max_top):
        errors.append(f"Top: {top_pct:.1f}% (target: {min_top}-{max_top}%)")
    
    return errors


def main():
    if len(sys.argv) < 2:
        print("Usage: python enforce_pyramid_targets.py <pyramid_live.jsonl>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    if not pathlib.Path(input_file).exists():
        print(f"ERROR: File not found: {input_file}")
        sys.exit(1)
    
    results = load_jsonl(input_file)
    distribution = analyze_distribution(results)
    errors = check_targets(distribution)
    
    # Print summary
    dist = distribution['distribution']
    print(f"\n📊 Pyramid Distribution Check:")
    print(f"  Total: {distribution['total']}")
    print(f"  FastPath: {dist.get('fastpath_pct', 0):.1f}% (target: {TARGETS['fastpath'][0]}-{TARGETS['fastpath'][1]}%)")
    print(f"  Base: {dist.get('base_pct', 0):.1f}% (target: {TARGETS['base'][0]}-{TARGETS['base'][1]}%)")
    print(f"  Mid: {dist.get('mid_pct', 0):.1f}% (target: {TARGETS['mid'][0]}-{TARGETS['mid'][1]}%)")
    print(f"  Top: {dist.get('top_pct', 0):.1f}% (target: {TARGETS['top'][0]}-{TARGETS['top'][1]}%)")
    
    if errors:
        print(f"\n❌ Targets NOT met:")
        for error in errors:
            print(f"  - {error}")
        sys.exit(1)
    else:
        print(f"\n✅ All targets met!")
        sys.exit(0)


if __name__ == '__main__':
    main()

