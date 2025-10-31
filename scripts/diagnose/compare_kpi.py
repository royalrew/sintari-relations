#!/usr/bin/env python3
"""
Quick diagnostic: Show canonical KPI values
Both frontend and PDF should read from reports/pyramid_live_kpis.json
"""
import json
import pathlib

KPI_FILE = pathlib.Path("reports/pyramid_live_kpis.json")

if not KPI_FILE.exists():
    print(f"[ERROR] KPI file not found: {KPI_FILE}")
    print("Run: python scripts/metrics/pyramid_report.py reports/pyramid_live.jsonl")
    exit(1)

k = json.loads(KPI_FILE.read_text(encoding="utf-8"))

print("=" * 60)
print("CANONICAL KPI SOURCE (reports/pyramid_live_kpis.json)")
print("=" * 60)
print(f"Total cases: {k['counts']['total']}")
print(f"FastPath: {k['counts']['fastpath']} ({k['pct']['fastpath_total']:.1f}%) - target 22-25%")
print(f"Routed: {k['counts']['routed']}")
print(f"  Base: {k['counts']['base']} ({k['pct']['base_routed']:.1f}%) - target 72-78%")
print(f"  Mid: {k['counts']['mid']} ({k['pct']['mid_routed']:.1f}%) - target 12-18%")
print(f"  Top: {k['counts']['top']} ({k['pct']['top_routed']:.1f}%) - target 4-6%")
print(f"\nSHA1: {k['meta']['sha1']}")
print(f"Generated: {k['meta']['generated_utc']}")
print(f"Source: {k['meta']['source']}")
print("=" * 60)
print("\nBoth frontend (/api/pyramid) and PDF (investor_pdf_v2.py)")
print("now read from this single source.")
print("\nIf frontend/PDF show different values:")
print("  1. Check that Next.js cache is cleared (restart dev server)")
print("  2. Verify both read from reports/pyramid_live_kpis.json")
print("  3. Check SHA1 matches in PDF footer")

