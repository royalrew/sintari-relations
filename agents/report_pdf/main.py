#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ReportPdfAgent — Rendera rapport (JSON→PDF) med auto-backend och tydliga fallbacks.

Input (stdin eller --payload path):
{
  "meta": {
    "out_path": "report.pdf",
    "backend": "auto",                  # auto|reportlab|fpdf|html
    "brand": {"title":"Sintari Relations","logo_path":"./logo.png"},
    "fonts": {"base":"Helvetica","mono":"Courier"},
    "page": {"size":"A4","margins_mm": [18,18,18,18]},
    "watermark": {"text":"INTERNAL", "when_status_not":"OK"},  # valfritt
    "show_toc": true,                   # innehållsförteckning
    "explain_verbose": false
  },
  "data": {
    "report": {...},                    # från ReportComposerAgent (inkl summary/insights/plan/...)
    "pdf_layout": {"title":"Relationsrapport","sections":[{"title":"Sammanfattning","path":"summary"}, ...]}
  }
}

Output (stdout):
{
  "ok": true,
  "version": "report_pdf@1.0.0",
  "latency_ms": 120,
  "cost": {"usd": 0.001},
  "emits": {
    "pdf_path": "report.pdf",
    "backend_used": "reportlab|fpdf|html",
    "pages": 7,
    "toc": [{"title":"Sammanfattning","page":1}, ...]
  },
  "checks": {"CHK-FILE-EXISTS": {"pass": true}}
}

Noteringar:
- Backend ’auto’ väljer i ordning: reportlab → fpdf → html.
- Om inget PDF-backend finns skapas en HTML-fil (”report.html”) som fallback.
- Stöd för enkel watermark om safety-status ≠ given (t.ex. ”OK”).
- Hanterar textwrap, tabeller (enkla KPI), listor och monospaced block.
"""

import sys
import json
import time
import argparse
import os
import math
from typing import Any, Dict, List, Tuple, Optional

AGENT_VERSION = "1.0.0"
AGENT_ID = "report_pdf"

# ----------- Utilities ----------- #
def nb_read(default: Dict[str, Any]) -> Dict[str, Any]:
    try:
        if sys.stdin and not sys.stdin.isatty():
            raw = sys.stdin.read()
            if raw.strip():
                return json.loads(raw)
    except Exception:
        pass
    return default

def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="ReportPdfAgent – JSON→PDF/HTML med auto-backend.")
    p.add_argument("--payload", type=str, default=None, help="Sökväg till payload.json (annars läs stdin).")
    return p.parse_args(argv)

def load_payload(args: argparse.Namespace) -> Dict[str, Any]:
    default_payload = {"meta": {}, "data": {}}
    if args.payload:
        with open(args.payload, "r", encoding="utf-8") as f:
            return json.load(f)
    return nb_read(default_payload)

def get(obj: Any, path: str, default: Any=None) -> Any:
    cur = obj
    for part in [p for p in path.split(".") if p]:
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return default
    return cur

def mm_to_pt(mm: float) -> float:
    return mm * 72.0 / 25.4

def clamp(v, a, b):
    return max(a, min(b, v))

def ensure_dir(path: str) -> None:
    d = os.path.dirname(os.path.abspath(path))
    if d and not os.path.exists(d):
        os.makedirs(d, exist_ok=True)

def plain(s: Any) -> str:
    try:
        return str(s) if isinstance(s, (str, int, float)) else json.dumps(s, ensure_ascii=False, indent=2)
    except Exception:
        return str(s)

# ----------- Content builders ----------- #
def kpi_items_from_report(report: Dict[str, Any]) -> List[Tuple[str, str]]:
    s = report.get("summary", {}) or {}
    return [
        ("Övergripande poäng", str(s.get("overall_score","-"))),
        ("Säkerhet", str(s.get("safety_status","-"))),
        ("Fokusområden", ", ".join(s.get("focus_areas", [])) or "-"),
        ("Case ID", str(s.get("case_id","-"))),
        ("Tid", str(s.get("timestamp","-"))),
    ]

def section_blocks(report: Dict[str, Any], pdf_layout: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Samla sektioner: title + payload att rendera."""
    out = []
    title = pdf_layout.get("title") or "Rapport"
    out.append({"type":"title", "text": title})
    for sec in pdf_layout.get("sections", []):
        sec_title = sec.get("title") or sec.get("path")
        path = sec.get("path")
        payload = get(report, path, {})
        out.append({"type":"section", "title": sec_title})
        # specialfall för summary → KPI-tabell
        if path == "summary":
            out.append({"type":"kpis", "items": kpi_items_from_report(report)})
        # listor
        if isinstance(payload, list):
            if payload and all(isinstance(x, (str,int,float)) for x in payload):
                out.append({"type":"list", "items": [str(x) for x in payload]})
            else:
                out.append({"type":"code", "text": plain(payload)})
        elif isinstance(payload, dict):
            # kända nycklar
            if "recommendations" in payload and isinstance(payload["recommendations"], list):
                out.append({"type":"list", "title":"Rekommendationer", "items": [str(x) for x in payload["recommendations"]]})
            if "next_steps" in payload and isinstance(payload["next_steps"], list):
                out.append({"type":"list", "title":"Nästa steg", "items": [str(x) for x in payload["next_steps"]]})
            # visa resten som kodblock
            show = {k: v for k, v in payload.items() if k not in {"recommendations","next_steps"}}
            if show:
                out.append({"type":"code", "text": plain(show)})
        else:
            out.append({"type":"text", "text": plain(payload)})
    return out

# ----------- Backends detection ----------- #
def pick_backend(pref: str) -> Tuple[str, Dict[str, Any]]:
    if pref in ("auto", "reportlab"):
        try:
            from reportlab.lib.pagesizes import A4, LETTER
            return "reportlab", {"A4": A4, "LETTER": LETTER}
        except Exception:
            if pref == "reportlab":
                pass
    if pref in ("auto", "fpdf"):
        try:
            import fpdf  # noqa
            return "fpdf", {}
        except Exception:
            if pref == "fpdf":
                pass
    return "html", {}

# ----------- Render: REPORTLAB ----------- #
def render_reportlab(blocks: List[Dict[str, Any]], meta: Dict[str, Any]) -> Tuple[str, int, List[Dict[str, Any]]]:
    from reportlab.lib.pagesizes import A4, LETTER
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
    from reportlab.lib import colors

    out_path = meta.get("out_path") or "report.pdf"
    size = (A4 if (meta.get("page", {}).get("size","A4") == "A4") else LETTER)
    m_top, m_right, m_bottom, m_left = [mm_to_pt(x) for x in (meta.get("page", {}).get("margins_mm") or [18,18,18,18])]
    ensure_dir(out_path)

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name='TitleH', fontName=meta.get("fonts",{}).get("base","Helvetica"),
                              fontSize=18, leading=22, alignment=TA_CENTER, spaceAfter=10))
    styles.add(ParagraphStyle(name='H2', fontName=meta.get("fonts",{}).get("base","Helvetica-Bold"),
                              fontSize=13, leading=16, spaceBefore=8, spaceAfter=6))
    styles.add(ParagraphStyle(name='Body', fontName=meta.get("fonts",{}).get("base","Helvetica"),
                              fontSize=10.5, leading=14))
    styles.add(ParagraphStyle(name='Mono', fontName=meta.get("fonts",{}).get("mono","Courier"),
                              fontSize=9.5, leading=13))
    styles.add(ParagraphStyle(name='TOC', fontSize=10, leading=12))

    toc = []
    story = []

    brand_title = meta.get("brand", {}).get("title")
    if brand_title:
        story.append(Paragraph(brand_title, styles['TitleH']))
        story.append(Spacer(1, 6))

    # Watermark control
    watermark = meta.get("watermark", {})
    wm_text = watermark.get("text")
    wm_when_not = watermark.get("when_status_not")

    def _on_page(canvas, doc):
        # page number footer
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(doc.pagesize[0]-mm_to_pt(12), mm_to_pt(10), f"Sida {doc.page}")
        # watermark
        if wm_text and wm_when_not:
            status = get(payload.get("data",{}),"report.summary.safety_status","OK")
            if str(status).upper() != str(wm_when_not).upper():
                canvas.setFont("Helvetica", 48)
                canvas.setFillGray(0.90)
                canvas.saveState()
                canvas.translate(doc.pagesize[0]/2, doc.pagesize[1]/2)
                canvas.rotate(45)
                canvas.drawCentredString(0, 0, wm_text)
                canvas.restoreState()
        canvas.restoreState()

    # Build content
    for blk in blocks:
        t = blk["type"]
        if t == "title":
            story.append(Paragraph(blk.get("text","Rapport"), styles['TitleH']))
            story.append(Spacer(1, 6))
        elif t == "section":
            story.append(Spacer(1, 6))
            story.append(Paragraph(blk.get("title","Sektion"), styles['H2']))
            toc.append({"title": blk.get("title","Sektion"), "page": len(story)})  # page fixed efter build
        elif t == "text":
            story.append(Paragraph(blk.get("text","").replace("\n","<br/>"), styles['Body']))
        elif t == "kpis":
            data = [["Nyckeltal","Värde"]] + [[k, v] for k, v in blk.get("items",[])]
            tbl = Table(data, hAlign='LEFT', colWidths=[mm_to_pt(50), mm_to_pt(100)])
            tbl.setStyle(TableStyle([
                ("BACKGROUND",(0,0),(-1,0), colors.lightgrey),
                ("TEXTCOLOR",(0,0),(-1,0), colors.black),
                ("GRID",(0,0),(-1,-1), 0.25, colors.grey),
                ("FONT",(0,0),(-1,-1), meta.get("fonts",{}).get("base","Helvetica")),
                ("FONTSIZE",(0,0),(-1,-1), 9.5),
                ("ALIGN",(0,0),(-1,0), "CENTER")
            ]))
            story.append(tbl)
        elif t == "list":
            title = blk.get("title")
            if title:
                story.append(Paragraph(title, styles['H2']))
            items = blk.get("items",[])
            for it in items:
                story.append(Paragraph(f"• {it}", styles['Body']))
        elif t == "code":
            story.append(Paragraph("<br/>", styles['Body']))
            story.append(Paragraph(blk.get("text","").replace(" ","&nbsp;").replace("\n","<br/>"), styles['Mono']))
        elif t == "pagebreak":
            story.append(PageBreak())

    # TOC
    if meta.get("show_toc", False):
        story.insert(0, Paragraph("Innehåll", styles['H2']))
        # enkel TOC-approx (exakt sidnumrering kräver två-pass; vi håller det enkelt)
        for entry in toc:
            story.insert(1, Paragraph(f"• {entry['title']}", styles['TOC']))
        story.insert(2, Spacer(1, 8))

    doc = SimpleDocTemplate(
        out_path,
        pagesize=size,
        leftMargin=m_left, rightMargin=m_right, topMargin=m_top, bottomMargin=m_bottom
    )
    doc.build(story, onFirstPage=_on_page, onLaterPages=_on_page)

    # Sidor är svåra att hämta exakt utan två-pass; anta minst 1
    return out_path, 1, toc

# ----------- Render: FPDF ----------- #
def render_fpdf(blocks: List[Dict[str, Any]], meta: Dict[str, Any]) -> Tuple[str, int, List[Dict[str, Any]]]:
    from fpdf import FPDF

    out_path = meta.get("out_path") or "report.pdf"
    ensure_dir(out_path)
    page_size = meta.get("page",{}).get("size","A4")
    m = meta.get("page",{}).get("margins_mm") or [18,18,18,18]
    pdf = FPDF(format=page_size)
    pdf.set_margins(m[3], m[0], m[1])
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=m[2])

    base = meta.get("fonts",{}).get("base","Helvetica")
    mono = meta.get("fonts",{}).get("mono","Courier")

    toc = []

    def h2(txt):
        pdf.set_font(base, "B", 14)
        pdf.ln(2)
        pdf.multi_cell(0, 8, txt)
        pdf.ln(1)

    def body(txt, size=11):
        pdf.set_font(base, "", size)
        pdf.multi_cell(0, 6, txt)

    def code(txt):
        pdf.set_font(mono, "", 9)
        for line in txt.split("\n"):
            pdf.multi_cell(0, 5, line)

    # Brand
    brand_title = meta.get("brand",{}).get("title")
    if brand_title:
        pdf.set_font(base, "B", 16)
        pdf.multi_cell(0, 10, brand_title)
        pdf.ln(2)

    for blk in blocks:
        t = blk["type"]
        if t == "title":
            pdf.set_font(base, "B", 16)
            pdf.multi_cell(0, 10, blk.get("text","Rapport"))
            pdf.ln(1)
        elif t == "section":
            h2(blk.get("title","Sektion"))
            toc.append({"title": blk.get("title","Sektion"), "page": pdf.page_no()})
        elif t == "text":
            body(blk.get("text",""))
        elif t == "kpis":
            pdf.set_font(base, "B", 11); pdf.cell(60, 6, "Nyckeltal"); pdf.cell(0, 6, "Värde", ln=1)
            pdf.set_font(base, "", 10)
            for k, v in blk.get("items", []):
                pdf.cell(60, 6, str(k)); pdf.cell(0, 6, str(v), ln=1)
            pdf.ln(1)
        elif t == "list":
            title = blk.get("title")
            if title: h2(title)
            pdf.set_font(base, "", 11)
            for it in blk.get("items", []):
                pdf.multi_cell(0, 6, f"• {it}")
        elif t == "code":
            code(blk.get("text",""))
        elif t == "pagebreak":
            pdf.add_page()

    pdf.output(out_path)
    return out_path, pdf.page_no(), toc

# ----------- Render: HTML fallback ----------- #
def render_html(blocks: List[Dict[str, Any]], meta: Dict[str, Any]) -> Tuple[str, int, List[Dict[str, Any]]]:
    out_path = meta.get("out_path") or "report.pdf"
    html_path = os.path.splitext(out_path)[0] + ".html"
    ensure_dir(html_path)

    def esc(s: str) -> str:
        return (s or "").replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")

    html = []
    html.append("<!doctype html><meta charset='utf-8'><title>Report</title>")
    html.append("<style>body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;max-width:820px;margin:24px auto;padding:0 16px}h1{font-size:22px}h2{font-size:16px;margin-top:18px}pre{background:#f6f8fa;padding:10px;border-radius:8px;overflow:auto}</style>")
    brand_title = meta.get("brand",{}).get("title")
    if brand_title: html.append(f"<h1>{esc(brand_title)}</h1>")

    toc = []
    sec_i = 0
    for blk in blocks:
        t = blk["type"]
        if t == "title":
            html.append(f"<h1>{esc(blk.get('text','Rapport'))}</h1>")
        elif t == "section":
            sec_i += 1
            html.append(f"<h2 id='s{sec_i}'>{esc(blk.get('title','Sektion'))}</h2>")
            toc.append({"title": blk.get("title","Sektion"), "page": sec_i})
        elif t == "text":
            html.append(f"<p>{esc(blk.get('text','')).replace('\\n','<br>')}</p>")
        elif t == "kpis":
            html.append("<table><thead><tr><th>Nyckeltal</th><th>Värde</th></tr></thead><tbody>")
            for k, v in blk.get("items", []):
                html.append(f"<tr><td>{esc(str(k))}</td><td>{esc(str(v))}</td></tr>")
            html.append("</tbody></table>")
        elif t == "list":
            if blk.get("title"): html.append(f"<h3>{esc(blk['title'])}</h3>")
            html.append("<ul>")
            for it in blk.get("items", []):
                html.append(f"<li>{esc(str(it))}</li>")
            html.append("</ul>")
        elif t == "code":
            html.append(f"<pre>{esc(blk.get('text',''))}</pre>")

    with open(html_path, "w", encoding="utf-8") as f:
        f.write("\n".join(html))

    return html_path, sec_i, toc

# ----------- Orchestrator ----------- #
def build_blocks(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    report = payload.get("data",{}).get("report",{}) or {}
    layout = payload.get("data",{}).get("pdf_layout",{}) or {"title":"Rapport","sections":[{"title":"Sammanfattning","path":"summary"}]}
    return section_blocks(report, layout)

def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    meta = payload.get("meta",{}) or {}
    t0 = time.time()

    blocks = build_blocks(payload)

    pref = str(meta.get("backend","auto")).lower()
    backend, _ = pick_backend(pref)
    meta.setdefault("out_path", meta.get("out_path") or "report.pdf")

    if backend == "reportlab":
        out_path, pages, toc = render_reportlab(blocks, meta)
    elif backend == "fpdf":
        out_path, pages, toc = render_fpdf(blocks, meta)
    else:
        out_path, pages, toc = render_html(blocks, meta)

    exists = os.path.exists(out_path)
    checks = {"CHK-FILE-EXISTS": {"pass": bool(exists), "path": out_path}}
    emits = {"pdf_path": out_path, "backend_used": backend, "pages": pages, "toc": toc}

    return {
        "ok": bool(exists),
        "emits": emits,
        "checks": checks,
        "latency_ms": int((time.time() - t0) * 1000)
    }

def main() -> None:
    t0 = time.time()
    try:
        args = parse_args(sys.argv[1:])
        payload = load_payload(args)
        res = run(payload)
        res["version"] = f"{AGENT_ID}@{AGENT_VERSION}"
        res["cost"] = {"usd": 0.001}
        sys.stdout.write(json.dumps(res, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        sys.stderr.write(f"{AGENT_ID} error: {e}\n")
        sys.stdout.write(json.dumps({"ok": False, "error": str(e)}))
        sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    main()
