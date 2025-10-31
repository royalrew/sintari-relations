#!/usr/bin/env python3
"""
Pyramid Report Generator - Genererar rapport från shadow-logs

Analyserar pyramid_live.jsonl och genererar markdown-rapport.
"""

import json
import sys
import pathlib
import hashlib
import time
from collections import defaultdict
from typing import Dict, Any, List

def load_jsonl(filepath: str) -> List[Dict[str, Any]]:
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


def analyze_pyramid(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Analyze pyramid distribution."""
    stats = defaultdict(int)
    costs = []
    
    for r in results:
        routing = r.get('routing', {})
        # Normalisera tier: lowercase, strip (räkna "Top"/"TOP"/" top " som "top")
        tier = str(routing.get('tier', 'unknown')).strip().lower()
        
        # Räkna FastPath korrekt: antingen via flag eller modelId
        is_fast = bool(r.get('fastPathUsed') or (routing.get('modelId') == 'fastpath-local') or routing.get('fastpath_used'))
        
        if is_fast:
            stats['fastpath'] += 1
        else:
            stats[tier] += 1
        
        cost_mult = routing.get('cost_multiplier', 1.0)
        estimated_cost = 0.001 * cost_mult
        costs.append(estimated_cost)
    
    total = len(results)
    fastpath_count = stats.get('fastpath', 0)
    routed_count = stats.get('base', 0) + stats.get('mid', 0) + stats.get('top', 0)
    
    if routed_count == 0:
        return {
            'total': total,
            'fastpath': fastpath_count,
            'distribution': {},
            'cost_stats': {},
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
        'cost_stats': {
            'total_usd': sum(costs),
            'avg_usd': sum(costs) / len(costs) if costs else 0,
            # Robust p95-index för små N
            'p95_usd': (lambda s: s[max(0, min(len(s) - 1, int(len(s) * 0.95)))])(sorted(costs)) if costs else 0,
        },
    }


def generate_report(analysis: Dict[str, Any]) -> str:
    """Generate markdown report."""
    dist = analysis['distribution']
    cost = analysis['cost_stats']
    
    # Use ASCII-safe symbols for Windows compatibility
    report = f"""# Pyramid Live Report

**Generated:** {pathlib.Path(__file__).stat().st_mtime}  
**Total Cases:** {analysis['total']}

---

## 🎯 Pyramid Distribution

| Tier | Count | Percentage | Target | Status |
|------|-------|------------|--------|--------|
| **FastPath** | {analysis['fastpath']} | {dist.get('fastpath_pct', 0):.1f}% | 20-30% | {'[PASS]' if 20 <= dist.get('fastpath_pct', 0) <= 30 else '[WARN]'} |
| **Base** | {analysis.get('base', 0)} | {dist.get('base_pct', 0):.1f}% | 70-90% | {'[PASS]' if 70 <= dist.get('base_pct', 0) <= 90 else '[WARN]'} |
| **Mid** | {analysis.get('mid', 0)} | {dist.get('mid_pct', 0):.1f}% | 10-20% | {'[PASS]' if 10 <= dist.get('mid_pct', 0) <= 20 else '[WARN]'} |
| **Top** | {analysis.get('top', 0)} | {dist.get('top_pct', 0):.1f}% | 3-7% | {'[PASS]' if 3 <= dist.get('top_pct', 0) <= 7 else '[WARN]'} |

**Routed Cases:** {analysis.get('base', 0) + analysis.get('mid', 0) + analysis.get('top', 0)}

---

## Cost Analysis

| Metric | Value |
|--------|-------|
| Total Cost | ${cost.get('total_usd', 0):.4f} USD |
| Average Cost/Case | ${cost.get('avg_usd', 0):.4f} USD |
| p95 Cost | ${cost.get('p95_usd', 0):.4f} USD |

---

## Acceptance Criteria

- [ ] Live-fördelning 80/15/5 ±5%
- [ ] p95 kostnad −30% vs pre-routing baseline
- [ ] 0 budget-övertramp
- [ ] 0 felroutingar (manuellt stickprov n=50)

---

**Status:** {'[PASS] All targets met' if all([
    70 <= dist.get('base_pct', 0) <= 90,
    10 <= dist.get('mid_pct', 0) <= 20,
    3 <= dist.get('top_pct', 0) <= 7,
]) else '[REVIEW NEEDED] Targets not met'}
"""
    
    return report


def main():
    if len(sys.argv) < 2:
        input_file = 'reports/pyramid_live.jsonl'
    else:
        input_file = sys.argv[1]
    
    if not pathlib.Path(input_file).exists():
        print(f"❌ File not found: {input_file}")
        sys.exit(1)
    
    results = load_jsonl(input_file)
    analysis = analyze_pyramid(results)
    report = generate_report(analysis)
    
    # Output to stdout (can be redirected) - ensure UTF-8 encoding
    if sys.stdout.encoding and sys.stdout.encoding.lower() in ('cp1252', 'windows-1252'):
        # Windows console - use ASCII-safe output
        safe_report = report.encode('ascii', errors='replace').decode('ascii')
        print(safe_report)
    else:
        print(report)
    
    # Also save to file (always UTF-8)
    output_file = input_file.replace('.jsonl', '.md')
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print(f"\n[OK] Report saved to: {output_file}", file=sys.stderr)
    
    # Build canonical KPI JSON (single source of truth)
    input_path = pathlib.Path(input_file)
    try:
        with open(input_file, 'rb') as f:
            file_content = f.read()
        sha1_hash = hashlib.sha1(file_content).hexdigest()[:12]
    except Exception:
        sha1_hash = "unknown"
    
    kpi = {
        "meta": {
            "source": str(input_file),
            "mtime": input_path.stat().st_mtime,
            "generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "sha1": sha1_hash,
        },
        "counts": {
            "total": analysis["total"],
            "fastpath": analysis["fastpath"],
            "base": analysis.get("base", 0),
            "mid": analysis.get("mid", 0),
            "top": analysis.get("top", 0),
            "routed": analysis.get("base", 0) + analysis.get("mid", 0) + analysis.get("top", 0),
        },
        "pct": {
            "fastpath_total": analysis["distribution"].get("fastpath_pct", 0.0),
            "base_routed": analysis["distribution"].get("base_pct", 0.0),
            "mid_routed": analysis["distribution"].get("mid_pct", 0.0),
            "top_routed": analysis["distribution"].get("top_pct", 0.0),
        },
        "cost": analysis["cost_stats"],
    }
    
    out_json = input_file.replace(".jsonl", "_kpis.json")
    try:
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(kpi, f, ensure_ascii=False, indent=2)
        print(f"[OK] KPI JSON saved to: {out_json}", file=sys.stderr)
    except Exception as e:
        print(f"[ERROR] Could not write KPI JSON: {e}", file=sys.stderr)


if __name__ == '__main__':
    main()

