#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
E1 ReportEvidenceAgent — Samla, validera, deduplikerar och formattera evidens/citat för rapporter.
<1s (MVP) <3s (Gold)

Input (stdin eller --payload path):
{
  "meta": {
    "explain_verbose": false,
    "min_quality": 0.5,
    "max_duplicates": 0.85,              # likhetströskel för dedupe (0–1, högre = striktare)
    "max_items": 50,                      # hårt tak
    "pii_strict": false,                  # räkna adresshint som PII-varning
    "recent_weight_days": 365,            # tidsviktning för recency
    "citation_style": "apa"               # "apa"|"iso"|"simple"
  },
  "data": {
    "report": { "sections": [{"id":"sum","title":"Sammanfattning"}] },   # valfritt
    "anchors": [
      {"id":"comm_quality", "section":"analysis.communication"},
      {"id":"risk_flags", "section":"safety"}
    ],
    "claims": [
      {"id":"C1","text":"Konfliktnivån har ökat senaste månaden."},
      {"id":"C2","text":"Dagliga check-ins korrelerar med färre eskalationer."}
    ],
    "sources": [
      {
        "id":"S1","type":"web","title":"RCT on daily check-ins",
        "author":"Doe, J.","date":"2024-05-10","url":"https://example.org/study",
        "content":"...abstract and key quotes...","snippet":"Daily check-ins reduced escalations by 23%.",
        "domain":"example.org","license":"CC-BY","confidence":0.8
      },
      {
        "id":"S2","type":"pdf","title":"Internal weekly log","date":"2025-10-01",
        "file":"logs/week_40.pdf","snippet":"3 escalations vs 1 previous month","confidence":0.6
      }
    ]
  }
}

Output:
{
  "ok": true,
  "version": "report_evidence@1.0.0",
  "latency_ms": 8,
  "cost": {"usd": 0.001},
  "emits": {
    "evidence": [ { ... normalized evidence items ... } ],
    "bibliography": ["Doe, J. (2024). RCT on daily check-ins. ..."],
    "evidence_index": { "analysis.communication": ["EVID_0001", ...] },
    "stats": { "kept": 3, "dropped_dupes": 1, "pii_hits": 0 }
  },
  "checks": {
    "CHK-ENOUGH-QUALITY": {"pass": true, "kept": 3, "min_quality": 0.5},
    "CHK-NO-PII": {"pass": true, "hits": 0}
  },
  "rationales": [...]
}
"""
import sys
import json
import time
import argparse
import re
import hashlib
from datetime import datetime, timedelta
from typing import Any, Dict, List, Tuple, Optional

AGENT_VERSION = "1.0.0"
AGENT_ID = "report_evidence"

# ---------------- PII regex (enkla, snabba) ---------------- #
PII_REGEX = {
    "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    "phone": re.compile(r"(?:\+?\d{1,3}[\s\-]?)?(?:\(?\d{2,4}\)?[\s\-]?)?\d{3,4}[\s\-]?\d{3,4}"),
    "personnummer": re.compile(r"\b(?:\d{6}|\d{8})[-+]?(\d{4})\b"),
    "address_hint": re.compile(r"\b(gata|vägen|road|street|avenue|väg)\b", re.IGNORECASE)
}

# ---------------- Helpers ---------------- #
def non_blocking_stdin(default: Dict[str, Any]) -> Dict[str, Any]:
    try:
        if sys.stdin and not sys.stdin.isatty():
            raw = sys.stdin.read()
            if raw.strip():
                return json.loads(raw)
    except Exception:
        pass
    return default

def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="ReportEvidenceAgent – samlar och kvalitetssäkrar evidens.")
    p.add_argument("--payload", type=str, default=None, help="Sökväg till payload.json (annars läs stdin).")
    p.add_argument("--min-quality", type=float, default=None, help="Override meta.min_quality.")
    p.add_argument("--max-duplicates", type=float, default=None, help="Override meta.max_duplicates.")
    p.add_argument("--max-items", type=int, default=None, help="Override meta.max_items.")
    p.add_argument("--pii-strict", action="store_true", help="Räkna address hints som PII-fall.")
    p.add_argument("--explain-verbose", action="store_true", help="Inkludera rationales.")
    return p.parse_args(argv)

def load_payload(args: argparse.Namespace) -> Dict[str, Any]:
    default_payload = {"meta": {}, "data": {}}
    if args.payload:
        with open(args.payload, "r", encoding="utf-8") as f:
            return json.load(f)
    return non_blocking_stdin(default_payload)

def cfg_from(meta: Dict[str, Any], args: argparse.Namespace) -> Dict[str, Any]:
    return {
        "min_quality": float(args.min_quality if args.min_quality is not None else meta.get("min_quality", 0.5)),
        "max_duplicates": float(args.max_duplicates if args.max_duplicates is not None else meta.get("max_duplicates", 0.85)),
        "max_items": int(args.max_items if args.max_items is not None else meta.get("max_items", 50)),
        "pii_strict": bool(args.pii_strict or meta.get("pii_strict", False)),
        "recent_weight_days": int(meta.get("recent_weight_days", 365)),
        "citation_style": str(meta.get("citation_style", "apa")).lower(),
        "explain_verbose": bool(args.explain_verbose or meta.get("explain_verbose", False)),
    }

def normalize_text(s: Optional[str]) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", s.strip())

def content_fprint(text: str) -> str:
    return hashlib.sha256(normalize_text(text).lower().encode("utf-8")).hexdigest()[:16]

def jaccard(a: str, b: str) -> float:
    # enkel token-baserad likhet
    ta = set(re.findall(r"\w+", a.lower()))
    tb = set(re.findall(r"\w+", b.lower()))
    if not ta and not tb:
        return 1.0
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / max(1, len(ta | tb))

def parse_date(s: Optional[str]) -> Optional[datetime]:
    if not s: return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y-%m", "%Y/%m", "%Y"):
        try:
            return datetime.strptime(s, fmt)
        except Exception:
            continue
    return None

def recency_score(dt: Optional[datetime], horizon_days: int) -> float:
    if not dt:
        return 0.5
    age = (datetime.utcnow() - dt).days
    if age <= 0:
        return 1.0
    return max(0.0, 1.0 - min(1.0, age / max(1.0, float(horizon_days))))

def domain_quality(domain: Optional[str]) -> float:
    if not domain:
        return 0.5
    dom = domain.lower()
    # grov heuristik: myndigheter/edu/journaler väger högre
    if dom.endswith(".gov") or dom.endswith(".gov.se") or dom.endswith(".edu"):
        return 0.95
    if any(k in dom for k in ["who.int","nih.gov","nature.com","sciencedirect","acm.org","ieee.org"]):
        return 0.95
    if any(k in dom for k in ["wikipedia.org"]):
        return 0.7
    return 0.65

def source_quality(s: Dict[str, Any], horizon_days: int) -> float:
    base = float(s.get("confidence", 0.6))
    rq = recency_score(parse_date(s.get("date")), horizon_days)
    dq = domain_quality(s.get("domain") or (s.get("url") or "").split("/")[2] if s.get("url") else None)
    # viktad snitt
    return max(0.0, min(1.0, 0.5*base + 0.3*dq + 0.2*rq))

def detect_pii(text: str, strict: bool) -> List[Dict[str, Any]]:
    hits = []
    for k, rx in PII_REGEX.items():
        for m in rx.finditer(text):
            if k == "phone" and len(re.sub(r"\D", "", m.group(0))) < 7:
                continue
            hits.append({"type": k, "value": m.group(0), "span": [m.start(), m.end()]})
    if not strict:
        hits = [h for h in hits if h["type"] != "address_hint"]
    return hits

def make_citation(s: Dict[str, Any], style: str) -> str:
    title = s.get("title") or "Untitled"
    author = s.get("author") or s.get("authors") or ""
    date = s.get("date") or ""
    url = s.get("url") or s.get("file") or ""
    if style == "iso":
        return f"{author} ({date}). {title}. {url}".strip()
    if style == "simple":
        return f"{title} — {author} — {date} — {url}".strip()
    # apa (förenklad)
    return f"{author} ({date}). {title}. {url}".strip()

def to_evidence_item(s: Dict[str, Any], idx: int, style: str, horizon_days: int) -> Dict[str, Any]:
    content = normalize_text(s.get("content") or s.get("snippet") or "")
    snippet = normalize_text(s.get("snippet") or content[:300])
    evid_id = f"EVID_{idx:04d}"
    return {
        "id": evid_id,
        "source_id": s.get("id") or evid_id,
        "type": s.get("type") or "unknown",
        "title": s.get("title") or "",
        "author": s.get("author") or s.get("authors") or "",
        "date": s.get("date") or "",
        "url": s.get("url") or "",
        "file": s.get("file") or "",
        "domain": s.get("domain") or "",
        "license": s.get("license") or "",
        "snippet": snippet,
        "content_fprint": content_fprint(content or snippet),
        "quality": round(source_quality(s, horizon_days), 3),
        "citation": make_citation(s, style),
        "anchors": s.get("anchors") or [],       # ex: ["analysis.communication"]
        "claims": s.get("claims") or [],         # ex: ["C1","C2"]
        "pii_hits": [],                          # fylls senare
    }

def dedupe(items: List[Dict[str, Any]], max_duplicates: float) -> Tuple[List[Dict[str, Any]], int]:
    kept: List[Dict[str, Any]] = []
    dropped = 0
    for it in items:
        is_dup = False
        for jt in kept:
            # om fingerprint lika eller jaccard över tröskel → drop
            if it["content_fprint"] == jt["content_fprint"]:
                is_dup = True; break
            if jaccard(it.get("snippet",""), jt.get("snippet","")) >= max_duplicates:
                # behåll den med högre kvalitet
                if it["quality"] > jt["quality"]:
                    jt.update(it)
                is_dup = True; break
        if not is_dup:
            kept.append(it)
        else:
            dropped += 1
    return kept, dropped

def index_by_section(items: List[Dict[str, Any]], anchors: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    # Bygg karta section_key -> evid_ids, baserat på item.anchors och angivna anchors
    mapped = {}
    valid_sections = {a.get("section"): a.get("id") for a in anchors or []}  # ej strikt nödvändigt
    for it in items:
        sec_keys = it.get("anchors") or []
        for k in sec_keys:
            mapped.setdefault(k, []).append(it["id"])
    # sortera ids deterministiskt
    for k in list(mapped.keys()):
        mapped[k] = sorted(set(mapped[k]))
    return mapped

# ---------------- Core ---------------- #
def run(payload: Dict[str, Any], cfg: Dict[str, Any]) -> Dict[str, Any]:
    data = payload.get("data", {}) or {}
    sources = data.get("sources") or []
    claims = data.get("claims") or []
    anchors = data.get("anchors") or []

    # 1) Normalisera källor → evidence items
    items = []
    for i, s in enumerate(sources, start=1):
        items.append(to_evidence_item(s, i, cfg["citation_style"], cfg["recent_weight_days"]))

    # 2) PII-kontroll på snippet (snabbt) och flagga
    total_pii = 0
    for it in items:
        hits = detect_pii((it.get("snippet") or "")[:2000], cfg["pii_strict"])
        it["pii_hits"] = hits
        total_pii += len(hits)

    # 3) Filtrera på kvalitet
    qualified = [it for it in items if it["quality"] >= cfg["min_quality"]]
    # 4) Dedupe
    deduped, dropped_dupes = dedupe(qualified, cfg["max_duplicates"])
    # 5) Begränsa antal
    deduped = deduped[: cfg["max_items"]]

    # 6) Bibliografi
    bibliography = [it["citation"] for it in deduped]

    # 7) Index per rapportdel (anchors)
    evidence_index = index_by_section(deduped, anchors)

    # 8) Checks
    checks = {
        "CHK-ENOUGH-QUALITY": {"pass": len(deduped) > 0, "kept": len(deduped), "min_quality": cfg["min_quality"]},
        "CHK-NO-PII": {"pass": total_pii == 0, "hits": total_pii},
    }

    emits = {
        "evidence": deduped,
        "bibliography": bibliography,
        "evidence_index": evidence_index,
        "stats": {
            "input": len(sources),
            "qualified": len(qualified),
            "kept": len(deduped),
            "dropped_dupes": dropped_dupes,
            "pii_hits": total_pii
        }
    }

    out = {
        "ok": True,
        "emits": emits,
        "checks": checks
    }

    if cfg["explain_verbose"]:
        out["rationales"] = [{
            "cue": "evidence_pipeline_v1",
            "detail": {
                "min_quality": cfg["min_quality"],
                "max_duplicates": cfg["max_duplicates"],
                "max_items": cfg["max_items"],
                "citation_style": cfg["citation_style"]
            }
        }]

    return out

# ---------------- Main ---------------- #
def main() -> None:
    t0 = time.time()
    try:
        args = parse_args(sys.argv[1:])
        payload = load_payload(args)
        cfg = cfg_from(payload.get("meta", {}) or {}, args)
        res = run(payload, cfg)
        res["version"] = f"{AGENT_ID}@{AGENT_VERSION}"
        res["latency_ms"] = int((time.time() - t0) * 1000)
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
