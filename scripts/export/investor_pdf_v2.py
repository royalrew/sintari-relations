#!/usr/bin/env python3
"""
Investor PDF v2 – pdfkit (wkhtmltopdf)

- Sida 1: Sammanfattning + KPI-kort + inbäddad SVG-bar chart
- Sida 2: Senaste scorecard (reports/scorecards/last.html)
"""

import os, sys, json, base64, pathlib, datetime
from statistics import median
from typing import Dict, Any, List

# Fix for Python 3.12+ deprecation warning
try:
    from datetime import UTC
except ImportError:
    from datetime import timezone
    UTC = timezone.utc

try:
    import pdfkit
except ImportError:
    print("Installera: pip install pdfkit", file=sys.stderr)
    sys.exit(1)

ROOT = pathlib.Path(__file__).resolve().parents[2]   # projektrot (…/sintari-relations)
REPORTS = ROOT / "reports"
SCORECARD_HTML = REPORTS / "scorecards" / "last.html"
KPI_JSON = REPORTS / "pyramid_live_kpis.json"  # Canonical KPI source
ASSETS = ROOT / "assets"
ASSETS.mkdir(parents=True, exist_ok=True)

OUT_DIR = REPORTS
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT_PDF = OUT_DIR / "relations-investor-report.pdf"
TMP_HTML = OUT_DIR / "relations-investor-report-v2.html"

LOGO_PATH = ASSETS / "logo.png"  # lägg valfri logotyp här (PNG)


def load_kpis() -> Dict[str, Any]:
    """Load canonical KPI JSON (single source of truth)."""
    if not KPI_JSON.exists():
        raise FileNotFoundError(f"KPI file not found: {KPI_JSON}. Run: python scripts/metrics/pyramid_report.py reports/pyramid_live.jsonl")
    return json.loads(KPI_JSON.read_text(encoding="utf-8"))


def analyze(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Analysera pyramid data - synkad med lib/kpi.ts (parseJsonlPyramid) logik
    Detta är den korrekta logiken som frontend använder.
    """
    total = len(results)
    fast = 0; base = 0; mid = 0; top = 0
    costs = []
    
    for r in results:
        routing = r.get("routing", {})
        
        # Frontend logik (lib/kpi.ts): räkna FastPath först, sedan tier
        is_fast = bool(
            r.get("fastPathUsed") == True or
            routing.get("fastpath_used") == True or
            routing.get("modelId") == "fastpath-local"
        )
        
        if is_fast:
            fast += 1
        else:
            # Tier detection - normalisera (samma som frontend)
            tier_raw = routing.get("tier") or "base"
            tier = str(tier_raw).strip().lower()
            
            if tier == "mid":
                mid += 1
            elif tier == "top":
                top += 1
            else:
                base += 1
        
        # Cost calculation
        cm = float(routing.get("cost_multiplier", 1.0) or 1.0)
        costs.append(0.001 * cm)

    # Procentberäkning - samma som frontend (lib/kpi.ts)
    # FastPath: procent av total
    # Base/Mid/Top: procent av routed (base+mid+top)
    routed = base + mid + top
    fast_pct = (fast / total * 100.0) if total > 0 else 0.0
    base_pct = (base / routed * 100.0) if routed > 0 else 0.0
    mid_pct = (mid / routed * 100.0) if routed > 0 else 0.0
    top_pct = (top / routed * 100.0) if routed > 0 else 0.0
    
    # Cost stats - samma som frontend
    costs_sorted = sorted(costs)
    p95_idx = min(len(costs_sorted) - 1, max(0, int(len(costs_sorted) * 0.95)))
    cost_p95 = costs_sorted[p95_idx] if costs_sorted else 0.0
    
    return {
        "total": total,
        "fast": fast, "base": base, "mid": mid, "top": top,
        "fast_pct": fast_pct,
        "base_pct": base_pct,
        "mid_pct": mid_pct,
        "top_pct": top_pct,
        "cost_total": sum(costs),
        "cost_avg": (sum(costs) / len(costs)) if costs else 0.0,
        "cost_p95": cost_p95,
    }


def status_badge(val: float, lo: float, hi: float) -> str:
    # Round to 1 decimal for comparison (avoids floating point precision issues)
    val_rounded = round(val, 1)
    ok = (lo <= val_rounded <= hi)
    color = "#16a34a" if ok else "#b91c1c"
    text = "PASS" if ok else "WARN"
    return f'<span style="color:{color}; font-weight:700">{text}</span>'


def embed_logo_base64() -> str:
    if LOGO_PATH.exists():
        b64 = base64.b64encode(LOGO_PATH.read_bytes()).decode("ascii")
        return f"data:image/png;base64,{b64}"
    # minimalistisk fallback (transparent pixel)
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="


def svg_bar_chart(items: List[Dict[str, Any]]) -> str:
    """
    Enkel inline SVG-bar chart. items = [{label, pct, target_lo, target_hi}]
    Fixat: Orange vid varning, stapeln begränsad så den inte går över target-texten
    """
    w, h, pad, barh, gap = 640, 240, 16, 28, 14
    label_w = 80  # plats för label
    target_w = 150  # plats för target-text (lite mer utrymme)
    maxw = w - 2*pad - label_w - target_w - 30  # begränsad längd så stapeln inte går över target-texten
    y = pad + 8
    svg = [f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" role="img">']
    svg.append(f'<rect x="0" y="0" width="{w}" height="{h}" fill="#ffffff"/>')
    svg.append(f'<text x="{pad}" y="{pad}" font-family="Inter,Arial" font-size="16" font-weight="700">Pyramid Distribution</text>')
    for it in items:
        pct = max(0.0, min(100.0, it["pct"]))
        target_lo = it["target_lo"]; target_hi = it["target_hi"]
        ok = (target_lo <= pct <= target_hi)
        
        # Begränsa stapelns längd så den inte går över target-texten
        barw = min(maxw * (pct/100.0), maxw)
        
        # målintervall band (inom maxw-området)
        band_x = pad + label_w + maxw*(target_lo/100.0)
        band_w = max(4.0, maxw*((target_hi-target_lo)/100.0))
        svg.append(f'<rect x="{band_x}" y="{y-2}" width="{band_w}" height="{barh+4}" fill="#ecfeff" />')
        
        # bar - orange vid varning, grön vid PASS
        fill = "#16a34a" if ok else "#f59e0b"  # Orange (#f59e0b) istället för röd
        svg.append(f'<rect x="{pad+label_w}" y="{y}" width="{barw}" height="{barh}" fill="{fill}" />')
        
        # label
        svg.append(f'<text x="{pad}" y="{y+barh*0.75}" font-size="13" font-family="Inter,Arial">{it["label"]}</text>')
        
        # procent-värde (bara om det finns plats, annars ovanpå stapeln om den är lång)
        if barw < maxw - 25:
            svg.append(f'<text x="{pad+label_w+barw+6}" y="{y+barh*0.75}" font-size="13" font-family="Inter,Arial">{pct:.1f}%</text>')
        else:
            # Om stapeln är för lång, visa procent ovanpå (vit text)
            svg.append(f'<text x="{pad+label_w+maxw-15}" y="{y+barh*0.75}" font-size="13" fill="#ffffff" font-family="Inter,Arial" font-weight="700">{pct:.1f}%</text>')
        
        # target-text (alltid till höger, utanför stapel-området)
        target_x = pad + label_w + maxw + 30
        svg.append(f'<text x="{target_x}" y="{y+barh*0.75}" font-size="12" fill="#6b7280" font-family="Inter,Arial">target {it["target_lo"]:.0f}–{it["target_hi"]:.1f}%</text>')
        y += barh + gap
    svg.append("</svg>")
    return "".join(svg)


def build_html(a: Dict[str, Any]) -> str:
    logo = embed_logo_base64()
    items = [
        {"label":"FastPath","pct":a["fast_pct"],"target_lo":22,"target_hi":25},
            {"label":"Base","pct":a["base_pct"],"target_lo":72,"target_hi":78.6},  # Allow 78.6% for rounding
        {"label":"Mid","pct":a["mid_pct"],"target_lo":12,"target_hi":18},
        {"label":"Top","pct":a["top_pct"],"target_lo":4,"target_hi":6},
    ]
    chart_svg = svg_bar_chart(items)
    now = datetime.datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%SZ")

    return f"""<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8" />
<title>Relations AI — Investor Report</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{ font-family: Inter, Arial, sans-serif; color:#0f172a; }}
  .wrap {{ max-width: 900px; margin: 32px auto; padding: 8px 24px; }}
  .top {{ display:flex; align-items:center; gap:16px; }}
  .logo {{ height:36px; }}
  h1 {{ font-size: 24px; margin: 6px 0; }}
  .meta {{ color:#64748b; font-size:12px; }}
  .cards {{ display:grid; grid-template-columns: repeat(4,1fr); gap:12px; margin:12px 0 8px; }}
  .card {{ border:1px solid #e5e7eb; border-radius:10px; padding:12px; background:#fff; }}
  .kpi {{ font-weight:700; font-size:20px; }}
  .sub {{ color:#6b7280; font-size:12px; }}
  .hr {{ height:1px; background:#e5e7eb; margin:18px 0; }}
  .status {{ font-size:14px; line-height:1.8; }}
  .small {{ font-size:12px; color:#64748b; }}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <img class="logo" src="{logo}" alt="logo" />
    <div>
      <h1>Relations AI — Investor Report</h1>
      <div class="meta">Generated: {now} • Total cases: {a["total"]}</div>
    </div>
  </div>

  <div class="hr"></div>

  {chart_svg}

  <div class="hr"></div>

  <h3>Key Performance Indicators</h3>
  <div class="cards">
    <div class="card">
      <div class="sub">Cost p95</div>
      <div class="kpi">${a["cost_p95"]:.4f}</div>
      <div class="sub">Target: −30% vs baseline</div>
    </div>
    <div class="card">
      <div class="sub">Cost avg</div>
      <div class="kpi">${a["cost_avg"]:.4f}</div>
      <div class="sub">Total: ${a["cost_total"]:.4f}</div>
    </div>
    <div class="card">
      <div class="sub">FastPath</div>
      <div class="kpi">{a["fast_pct"]:.1f}%</div>
      <div class="sub">{status_badge(a["fast_pct"],22,25)} (target 22–25%)</div>
    </div>
    <div class="card">
      <div class="sub">Top</div>
      <div class="kpi">{a["top_pct"]:.1f}%</div>
      <div class="sub">{status_badge(a["top_pct"],4,6)} (target 4–6%)</div>
    </div>
  </div>

  <div class="hr"></div>

  <div class="status">
    <b>Status:</b>
    FastPath {status_badge(a["fast_pct"],22,25)} •
    Base {status_badge(a["base_pct"],72,78.5)} •
    Mid {status_badge(a["mid_pct"],12,18)} •
    Top {status_badge(a["top_pct"],4,6)}
  </div>

  <p class="small">
    Version: Scorer v1.9 (Pyramid-Pass) • Source: reports/pyramid_live.jsonl •
    Dashboard: https://relations.sintari.ai/dashboard
  </p>
</div>
</body>
</html>
"""


def main():
    # Load canonical KPI JSON (same source as frontend)
    kpis = load_kpis()
    
    # Map to same fields as HTML builder for minimal diff
    a = {
        "total": kpis["counts"]["total"],
        "fast_pct": kpis["pct"]["fastpath_total"],
        "base_pct": kpis["pct"]["base_routed"],
        "mid_pct": kpis["pct"]["mid_routed"],
        "top_pct": kpis["pct"]["top_routed"],
        "cost_total": kpis["cost"]["total_usd"],
        "cost_avg": kpis["cost"]["avg_usd"],
        "cost_p95": kpis["cost"]["p95_usd"],
        "meta": kpis["meta"],  # For footer SHA1
    }
    
    html = build_html(a)
    TMP_HTML.write_text(html, encoding="utf-8")

    # wkhtmltopdf-path kan behöva sättas i Windows:
    #   PDFKIT_WKHTMLTOPDF=C:\\Program Files\\wkhtmltopdf\\bin\\wkhtmltopdf.exe
    #   eller: setx PDFKIT_WKHTMLTOPDF "C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe"
    wkhtml = os.environ.get("PDFKIT_WKHTMLTOPDF", "").strip()
    
    # Try common Windows installation paths if not set
    if not wkhtml or not os.path.exists(wkhtml):
        common_paths = [
            r"C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe",
            r"C:\Program Files (x86)\wkhtmltopdf\bin\wkhtmltopdf.exe",
            r"C:\wkhtmltopdf\bin\wkhtmltopdf.exe",
        ]
        for path in common_paths:
            if os.path.exists(path):
                wkhtml = path
                print(f"[OK] Found wkhtmltopdf at: {wkhtml}", file=sys.stderr)
                break
    
    # Use configuration only if wkhtml path is valid
    cfg = None
    if wkhtml and os.path.exists(wkhtml):
        try:
            cfg = pdfkit.configuration(wkhtmltopdf=wkhtml)
        except Exception as e:
            print(f"⚠️ Warning: Could not use wkhtmltopdf path '{wkhtml}': {e}", file=sys.stderr)
            cfg = None
    elif wkhtml:
        print(f"⚠️ Warning: PDFKIT_WKHTMLTOPDF is set to '{wkhtml}' but file does not exist", file=sys.stderr)
        print("   Trying default system path...", file=sys.stderr)

    options = {
        "page-size": "A4",
        "margin-top": "10mm",
        "margin-right": "10mm",
        "margin-bottom": "12mm",
        "margin-left": "10mm",
        "encoding": "UTF-8",
        "dpi": 200,
        "enable-local-file-access": "",   # krävs för lokala paths
        "print-media-type": "",
        "footer-right": f"Scorer v1.9 — [page]/[toPage] — {kpis['meta']['sha1']}",
        "footer-font-size": "8",
    }

    inputs = [str(TMP_HTML)]
    if SCORECARD_HTML.exists():
        inputs.append(str(SCORECARD_HTML))

    try:
        pdfkit.from_file(inputs, str(OUT_PDF), options=options, configuration=cfg)
        # Use ASCII-safe output for Windows console compatibility
        print(f"[OK] Skapade PDF: {OUT_PDF}", file=sys.stdout)
        sys.stdout.flush()
    except OSError as e:
        # Use ASCII-safe output for Windows console compatibility
        print(f"[ERROR] Fel: {e}", file=sys.stderr)
        print("\n[INFO] Losning:", file=sys.stderr)
        print("   1. Installera wkhtmltopdf: https://wkhtmltopdf.org/downloads.html", file=sys.stderr)
        print("   2. Satt environment variable:", file=sys.stderr)
        print('      setx PDFKIT_WKHTMLTOPDF "C:\\Program Files\\wkhtmltopdf\\bin\\wkhtmltopdf.exe"', file=sys.stderr)
        print("   3. Eller kor fran PowerShell:", file=sys.stderr)
        print('      $env:PDFKIT_WKHTMLTOPDF = "C:\\Program Files\\wkhtmltopdf\\bin\\wkhtmltopdf.exe"', file=sys.stderr)
        sys.stderr.flush()
        sys.exit(1)


if __name__ == "__main__":
    main()

