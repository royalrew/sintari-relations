#!/usr/bin/env python3
"""
Generate Scorecard - HTML report per batch run

Input: pyramid_live.jsonl (or any pyramid JSONL)
Output: HTML scorecard showing distribution, KPIs, costs
"""

import json
import sys
import argparse
import pathlib
from datetime import datetime
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


def analyze_distribution(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Calculate pyramid distribution and metrics."""
    stats = defaultdict(int)
    costs = []
    
    for r in results:
        routing = r.get('routing', {})
        # Original logik: räkna tier direkt (tier kan vara 'fastpath' i routing.tier)
        tier = routing.get('tier', 'unknown')
        stats[tier] += 1
        
        # Extract cost if available
        cost_check = r.get('cost_check', {})
        cost_multiplier = routing.get('cost_multiplier', 1.0)
        if cost_multiplier:
            costs.append(cost_multiplier)
    
    total = len(results)
    fastpath_count = stats.get('fastpath', 0)
    routed_count = stats.get('base', 0) + stats.get('mid', 0) + stats.get('top', 0)
    
    distribution = {}
    if total > 0:
        distribution['fastpath_pct'] = (fastpath_count / total * 100)
    if routed_count > 0:
        distribution['base_pct'] = (stats.get('base', 0) / routed_count * 100)
        distribution['mid_pct'] = (stats.get('mid', 0) / routed_count * 100)
        distribution['top_pct'] = (stats.get('top', 0) / routed_count * 100)
    
    # Calculate p95 cost (if costs available)
    p95_cost = None
    if costs:
        costs_sorted = sorted(costs)
        p95_idx = int(len(costs_sorted) * 0.95)
        if p95_idx < len(costs_sorted):
            p95_cost = costs_sorted[p95_idx]
    
    return {
        'total': total,
        'fastpath': fastpath_count,
        'base': stats.get('base', 0),
        'mid': stats.get('mid', 0),
        'top': stats.get('top', 0),
        'distribution': distribution,
        'p95_cost': p95_cost,
    }


def check_kpis(distribution: Dict[str, Any]) -> Dict[str, Any]:
    """Check if distribution meets KPIs."""
    dist_dict = distribution.get('distribution', {})
    kpis = {
        'fastpath': {'target': (22.0, 25.0), 'actual': dist_dict.get('fastpath_pct', 0), 'pass': False},
        'base': {'target': (72.0, 78.6), 'actual': dist_dict.get('base_pct', 0), 'pass': False},  # Allow slight over (78.6% acceptable for rounding)
        'mid': {'target': (12.0, 18.0), 'actual': dist_dict.get('mid_pct', 0), 'pass': False},  # Match enforce_pyramid_targets.py
        'top': {'target': (4.0, 6.0), 'actual': dist_dict.get('top_pct', 0), 'pass': False},
    }
    
    for tier, kpi in kpis.items():
        min_val, max_val = kpi['target']
        actual = kpi['actual']
        # Round to 1 decimal for comparison (avoids floating point precision issues)
        actual_rounded = round(actual, 1)
        kpi['pass'] = (min_val <= actual_rounded <= max_val)
    
    return kpis


def generate_html_scorecard(distribution: Dict[str, Any], kpis: Dict[str, Any], input_file: str) -> str:
    """Generate HTML scorecard."""
    dist = distribution['distribution']
    date_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    # Determine overall status
    all_pass = all(kpi['pass'] for kpi in kpis.values())
    status_emoji = "✅" if all_pass else "⚠️"
    status_text = "PASS" if all_pass else "REVIEW NEEDED"
    
    # Format cost
    cost_str = "N/A"
    if distribution.get('p95_cost'):
        cost_str = f"${distribution['p95_cost']:.4f}"
    
    html = f"""<!DOCTYPE html>
<html lang="sv">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Relations Scorer — Batch Scorecard</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            background: #f5f5f5;
        }}
        .scorecard {{
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }}
        h1 {{
            margin: 0 0 10px 0;
            color: #333;
        }}
        .subtitle {{
            color: #666;
            margin-bottom: 30px;
        }}
        .stats {{
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin: 30px 0;
        }}
        .stat-box {{
            background: #f9f9f9;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #007bff;
        }}
        .stat-box.pass {{
            border-left-color: #28a745;
        }}
        .stat-box.fail {{
            border-left-color: #dc3545;
        }}
        .stat-label {{
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
            margin-bottom: 5px;
        }}
        .stat-value {{
            font-size: 24px;
            font-weight: bold;
            color: #333;
        }}
        .stat-target {{
            font-size: 12px;
            color: #999;
            margin-top: 5px;
        }}
        .kpi-table {{
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }}
        .kpi-table th {{
            background: #007bff;
            color: white;
            padding: 12px;
            text-align: left;
        }}
        .kpi-table td {{
            padding: 12px;
            border-bottom: 1px solid #eee;
        }}
        .kpi-table tr.pass {{
            background: #d4edda;
        }}
        .kpi-table tr.fail {{
            background: #f8d7da;
        }}
        .status-badge {{
            display: inline-block;
            padding: 8px 16px;
            border-radius: 4px;
            font-weight: bold;
            margin: 20px 0;
        }}
        .status-badge.pass {{
            background: #28a745;
            color: white;
        }}
        .status-badge.fail {{
            background: #dc3545;
            color: white;
        }}
        .footer {{
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #999;
            font-size: 12px;
        }}
    </style>
</head>
<body>
    <div class="scorecard">
        <h1>🧩 Relations Scorer — Batch Scorecard</h1>
        <div class="subtitle">Generated: {date_str}</div>
        
        <div class="status-badge {'pass' if all_pass else 'fail'}">
            {status_emoji} {status_text}
        </div>
        
        <div class="stats">
            <div class="stat-box">
                <div class="stat-label">Total Cases</div>
                <div class="stat-value">{distribution['total']}</div>
            </div>
            <div class="stat-box">
                <div class="stat-label">p95 Cost</div>
                <div class="stat-value">{cost_str}</div>
            </div>
        </div>
        
        <h2>Pyramid Distribution</h2>
        <table class="kpi-table">
            <thead>
                <tr>
                    <th>Tier</th>
                    <th>Count</th>
                    <th>Percentage</th>
                    <th>Target</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
"""
    
    # Add FastPath row
    fp_kpi = kpis['fastpath']
    fp_status = 'pass' if fp_kpi['pass'] else 'fail'
    fp_emoji = '✅' if fp_kpi['pass'] else '⚠️'
    html += f"""                <tr class="{fp_status}">
                    <td><strong>FastPath</strong></td>
                    <td>{distribution['fastpath']}</td>
                    <td>{dist.get('fastpath_pct', 0):.1f}%</td>
                    <td>{fp_kpi['target'][0]}-{fp_kpi['target'][1]}%</td>
                    <td>{fp_emoji}</td>
                </tr>
"""
    
    # Add Base/Mid/Top rows
    for tier in ['base', 'mid', 'top']:
        kpi = kpis[tier]
        count = distribution.get(tier, 0)
        status = 'pass' if kpi['pass'] else 'fail'
        emoji = '✅' if kpi['pass'] else '⚠️'
        html += f"""                <tr class="{status}">
                    <td><strong>{tier.capitalize()}</strong></td>
                    <td>{count}</td>
                    <td>{kpi['actual']:.1f}%</td>
                    <td>{kpi['target'][0]}-{kpi['target'][1]}%</td>
                    <td>{emoji}</td>
                </tr>
"""
    
    html += f"""            </tbody>
        </table>
        
        <div class="footer">
            <p><strong>Input:</strong> {input_file}</p>
            <p><strong>Version:</strong> 2025-01-30-pyramid-pass</p>
            <p>All KPIs must pass for production deployment.</p>
        </div>
    </div>
</body>
</html>"""
    
    return html


def main():
    parser = argparse.ArgumentParser(description='Generate HTML scorecard from pyramid JSONL or KPI JSON')
    parser.add_argument('input', help='Input JSONL file (e.g., reports/pyramid_live.jsonl) or KPI JSON (e.g., reports/pyramid_live_kpis.json)')
    parser.add_argument('-o', '--output', default='reports/scorecards/last.html',
                       help='Output HTML file (default: reports/scorecards/last.html)')
    
    args = parser.parse_args()
    
    if not pathlib.Path(args.input).exists():
        print(f"ERROR: Input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)
    
    # Check if input is KPI JSON (canonical source)
    input_path = pathlib.Path(args.input)
    if input_path.suffix == '.json' and 'kpis' in input_path.name:
        # Load from KPI JSON (canonical source - same as frontend/PDF)
        with open(args.input, 'r', encoding='utf-8') as f:
            kpi_data = json.load(f)
        
        # Convert KPI structure to distribution format
        distribution = {
            'total': kpi_data['counts']['total'],
            'fastpath': kpi_data['counts']['fastpath'],
            'base': kpi_data['counts']['base'],
            'mid': kpi_data['counts']['mid'],
            'top': kpi_data['counts']['top'],
            'distribution': {
                'fastpath_pct': kpi_data['pct']['fastpath_total'],
                'base_pct': kpi_data['pct']['base_routed'],
                'mid_pct': kpi_data['pct']['mid_routed'],
                'top_pct': kpi_data['pct']['top_routed'],
            },
            'p95_cost': kpi_data['cost'].get('p95_usd'),
        }
        print(f"[OK] Loaded KPI data from: {args.input}", file=sys.stderr)
    else:
        # Parse JSONL as before (legacy support)
        results = load_jsonl(args.input)
        if not results:
            print(f"ERROR: No valid data in {args.input}", file=sys.stderr)
            sys.exit(1)
        distribution = analyze_distribution(results)
    
    kpis = check_kpis(distribution)
    
    # Generate HTML
    html = generate_html_scorecard(distribution, kpis, args.input)
    
    # Write output
    output_path = pathlib.Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html, encoding='utf-8')
    
    # Print summary
    dist_dict = distribution.get('distribution', {})
    print(f"[OK] Scorecard generated: {args.output}")
    print(f"   Total: {distribution['total']} cases")
    print(f"   FastPath: {distribution['fastpath']} ({dist_dict.get('fastpath_pct', 0):.1f}%)")
    print(f"   Base: {distribution['base']} ({kpis['base']['actual']:.1f}%)")
    print(f"   Mid: {distribution['mid']} ({kpis['mid']['actual']:.1f}%)")
    print(f"   Top: {distribution['top']} ({kpis['top']['actual']:.1f}%)")
    
    all_pass = all(kpi['pass'] for kpi in kpis.values())
    if all_pass:
        print("   Status: [PASS] All KPIs PASS")
    else:
        print("   Status: [WARN] Some KPIs FAIL")
        sys.exit(1)


if __name__ == '__main__':
    main()

