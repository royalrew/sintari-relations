#!/usr/bin/env python3
"""
Enforce Release Criteria - GO/NO-GO gate before release

Checks that all required artifacts exist and basic criteria are met.
"""

import sys
import pathlib
import json
import re
import os
from datetime import datetime, timedelta


R = pathlib.Path(__file__).resolve().parents[2]  # Root of sintari-relations

REQUIRED_ARTIFACTS = [
    R / "reports" / "kpi_dashboard.md",
    R / "reports" / "scorecards" / "last.html",
    R / "tests" / "golden" / "VERSION",
    R / "reports" / "pyramid_live.jsonl",
]

OPTIONAL_BUT_RECOMMENDED = [
    R / "reports" / "pyramid_weekly.md",
    R / "docs" / "RELEASE_CRITERIA.md",
]


def mean(values):
    return (sum(values) / len(values)) if values else 0.0


def check_explain_kpis() -> bool:
    """Ensure explain coverage and no-advice policy meet thresholds."""
    path = R / "reports" / "worldclass_live.jsonl"
    if not path.exists():
        print("❌ Explain telemetry missing (reports/worldclass_live.jsonl)", file=sys.stderr)
        return False

    coverage: list[float] = []
    no_advice: list[float] = []

    try:
        with path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                kpi = rec.get("kpi", {})
                if "explain.coverage" in kpi:
                    coverage.append(float(kpi.get("explain.coverage", 0.0)))
                    no_advice.append(float(kpi.get("explain.no_advice", 0.0)))
    except Exception as exc:
        print(f"❌ Failed to read explain telemetry: {exc}", file=sys.stderr)
        return False

    if not coverage:
        print("❌ No explain KPI entries found in worldclass_live.jsonl", file=sys.stderr)
        return False

    m_cov = mean(coverage)
    m_noa = mean(no_advice)

    TH_COVERAGE = 0.95
    TH_NO_ADVICE = 1.0

    ok = True
    if m_cov < TH_COVERAGE:
        print(f"[FAIL] Explain coverage {m_cov:.3f} < {TH_COVERAGE}", file=sys.stderr)
        ok = False
    if m_noa < TH_NO_ADVICE:
        print(f"[FAIL] Explain no-advice {m_noa:.3f} < {TH_NO_ADVICE}", file=sys.stderr)
        ok = False

    if ok:
        print(f"[OK] Explain coverage={m_cov:.3f} no_advice={m_noa:.3f}")
    return ok


def check_artifacts() -> bool:
    """Check that all required artifacts exist."""
    missing = []
    for p in REQUIRED_ARTIFACTS:
        if not p.exists():
            missing.append(str(p))
    
    if missing:
        print("❌ Missing required artifacts:", file=sys.stderr)
        for m in missing:
            print(f"   - {m}", file=sys.stderr)
        return False
    
    return True


def check_kpi_dashboard() -> bool:
    """Check that KPI dashboard is complete."""
    kpi_path = R / "reports" / "kpi_dashboard.md"
    if not kpi_path.exists():
        print("❌ KPI dashboard missing", file=sys.stderr)
        return False
    
    try:
        content = kpi_path.read_text(encoding="utf-8")
        required_sections = [
            "FastPath:",
            "Base:",
            "Mid:",
            "Top:",
            "p95:",
        ]
        
        missing = [s for s in required_sections if s not in content]
        if missing:
            print(f"❌ KPI dashboard incomplete. Missing: {', '.join(missing)}", file=sys.stderr)
            return False
        
        # Check if dashboard is recent (within 24h)
        # Look for date in format YYYY-MM-DD
        date_match = re.search(r'(\d{4}-\d{2}-\d{2})', content)
        if date_match:
            try:
                dashboard_date = datetime.strptime(date_match.group(1), '%Y-%m-%d').date()
                today = datetime.now().date()
                age = (today - dashboard_date).days
                if age > 1:
                    print(f"⚠️  KPI dashboard is {age} days old (should be < 24h)", file=sys.stderr)
                    # Warning, not blocking
            except Exception:
                pass
        
        return True
    except Exception as e:
        print(f"❌ Error reading KPI dashboard: {e}", file=sys.stderr)
        return False


def check_scorecard() -> bool:
    """Check that scorecard exists and is valid."""
    scorecard_path = R / "reports" / "scorecards" / "last.html"
    if not scorecard_path.exists():
        print("❌ Scorecard missing", file=sys.stderr)
        return False
    
    try:
        content = scorecard_path.read_text(encoding="utf-8")
        # Check for basic HTML structure
        if "<html" not in content.lower() or "<body" not in content.lower():
            print("❌ Scorecard appears invalid (missing HTML structure)", file=sys.stderr)
            return False
        
        return True
    except Exception as e:
        print(f"❌ Error reading scorecard: {e}", file=sys.stderr)
        return False


def check_golden_version() -> bool:
    """Check that golden VERSION exists and is valid."""
    version_path = R / "tests" / "golden" / "VERSION"
    if not version_path.exists():
        print("❌ Golden VERSION missing", file=sys.stderr)
        return False
    
    try:
        content = version_path.read_text(encoding="utf-8").strip()
        # Should contain a date or version identifier
        if not content or len(content) < 5:
            print("❌ Golden VERSION appears invalid", file=sys.stderr)
            return False
        
        return True
    except Exception as e:
        print(f"❌ Error reading golden VERSION: {e}", file=sys.stderr)
        return False


def check_pyramid_data() -> bool:
    """Check that pyramid data exists and has content."""
    pyramid_path = R / "reports" / "pyramid_live.jsonl"
    if not pyramid_path.exists():
        print("❌ Pyramid data missing", file=sys.stderr)
        return False
    
    try:
        # Load first few lines to verify it's valid JSONL
        lines = pyramid_path.read_text(encoding="utf-8").strip().splitlines()
        if not lines:
            print("⚠️  Pyramid data is empty", file=sys.stderr)
            return False
        
        # Try to parse first line
        try:
            json.loads(lines[0])
        except Exception:
            print("❌ Pyramid data appears invalid (not valid JSONL)", file=sys.stderr)
            return False
        
        return True
    except Exception as e:
        print(f"❌ Error reading pyramid data: {e}", file=sys.stderr)
        return False


def main():
    """Main enforcement logic."""
    explain_only = os.getenv("EXPLAIN_ONLY") == "1"
    if explain_only:
        ok = check_explain_kpis()
        sys.exit(0 if ok else 1)

    print("🔍 Checking release criteria...")
    
    # Check artifacts
    if not check_artifacts():
        sys.exit(1)
    
    # Check individual artifacts
    checks = [
        ("KPI Dashboard", check_kpi_dashboard),
        ("Scorecard", check_scorecard),
        ("Golden VERSION", check_golden_version),
        ("Pyramid Data", check_pyramid_data),
        ("Explain KPIs", check_explain_kpis),
    ]
    
    failed = []
    for name, check_func in checks:
        if not check_func():
            failed.append(name)
    
    if failed:
        print(f"\n❌ Release criteria check FAILED for: {', '.join(failed)}", file=sys.stderr)
        sys.exit(1)
    
    # Check optional artifacts (warnings only)
    missing_optional = [str(p) for p in OPTIONAL_BUT_RECOMMENDED if not p.exists()]
    if missing_optional:
        print(f"\n⚠️  Optional artifacts missing (non-blocking):", file=sys.stderr)
        for m in missing_optional:
            print(f"   - {m}", file=sys.stderr)
    
    print("\n✅ Release criteria artifacts present and valid")
    print("   All required artifacts exist")
    print("   KPI dashboard is complete")
    print("   Scorecard is valid")
    print("   Golden VERSION is set")
    print("   Pyramid data is available")
    
    # Note: This script only checks artifacts exist.
    # Actual metric validation (e.g., pyramid distribution, cost reduction)
    # should be done via enforce_pyramid_targets.py and other specific validators.


if __name__ == '__main__':
    main()

