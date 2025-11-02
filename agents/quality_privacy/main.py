#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
M6 PrivacyReviewAgent — Dataminimering & policy
Passerar checklistor (CLI-styrt). <2s typiskt.

Input (stdin eller --payload path):
{
  "meta": {
    "min_score": 0.8,
    "max_bytes": 10000,
    "retention_days": 90,
    "consent_mode": "explicit",        # explicit|implicit|contract
    "allowed_purposes": ["diagnostics","reporting"],
    "pii_strict": true,
    "explain_verbose": false
  },
  "data": {
    "consent": { "given": true, "mode": "explicit", "timestamp": "2025-10-01" },
    "purpose": "reporting",
    "retention": { "days": 60 },
    "masked_text": "…",                # valfritt: text efter maskning
    "pii_map": { "[EMAIL_1]": "joe@example.com" },  # valfritt
    "report": "… fri text eller objekt ..."
  }
}

Output:
{
  "ok": true,
  "version": "quality_privacy@1.4.0",
  "latency_ms": 12,
  "cost": {"usd": 0.000},
  "emits": {
    "privacy_ok": true,
    "privacy_score": 0.92,
    "privacy_checks": {...},
    "pii": {"hits_total": 0, "hits": []},
    "anonymization": {"coverage": 1.0, "missing": []}
  },
  "checks": {...},
  "rationales": [...]
}
"""
import sys
import json
import time
import argparse
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Tuple

AGENT_VERSION = "1.4.0"
AGENT_ID = "quality_privacy"


# ----------------------- PII patterns (configurable) ----------------------- #
PII_REGEX = {
    "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    "phone": re.compile(r"(?:\+?\d{1,3}[\s\-]?)?(?:\(?\d{2,4}\)?[\s\-]?)?\d{3,4}[\s\-]?\d{3,4}"),
    # Svenska personnummer (förenklad): ÅÅÅÅMMDD-XXXX eller ÅÅMMDD-XXXX
    "personnummer": re.compile(r"\b(?:\d{6}|\d{8})[-+]?(\d{4})\b"),
    # IBAN (grovt)
    "iban": re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b"),
    # IPv4
    "ipv4": re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b"),
    # Postadressindikatorer (svag signal)
    "address_hint": re.compile(r"\b(gata|vägen|road|street|avenue|väg|vägen)\b", re.IGNORECASE),
}


# ----------------------- Helpers ----------------------- #
def sizeof_bytes(obj: Any) -> int:
    try:
        return len(json.dumps(obj, ensure_ascii=False).encode("utf-8"))
    except Exception:
        return len(str(obj).encode("utf-8"))

def flatten_text(x: Any) -> str:
    try:
        if isinstance(x, str):
            return x
        return json.dumps(x, ensure_ascii=False)
    except Exception:
        return str(x)

def find_pii(text: str, patterns: Dict[str, re.Pattern]) -> List[Dict[str, Any]]:
    hits = []
    for label, rx in patterns.items():
        for m in rx.finditer(text):
            val = m.group(0)
            # Filtrera bort triviala phone-matcher (3-3-3 t.ex.) om de ser orimliga ut
            if label == "phone" and len(re.sub(r"\D", "", val)) < 7:
                continue
            hits.append({"type": label, "value": val, "span": [m.start(), m.end()]})
    return hits

def anonymization_coverage(masked_text: str, pii_map: Dict[str, str]) -> Tuple[float, List[str]]:
    if not pii_map:
        return (1.0, [])
    missing = []
    for mask, original in pii_map.items():
        # mask ska finnas i masked_text, original ska ej finnas
        has_mask = masked_text and (mask in masked_text)
        leaks = masked_text and (original in masked_text)
        if not has_mask or leaks:
            missing.append(mask)
    coverage = 1.0 - (len(missing) / max(1, len(pii_map)))
    return (coverage, missing)

def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Privacy review: dataminimering, PII, consent, retention, purpose.")
    p.add_argument("--payload", type=str, default=None, help="Path to payload.json (otherwise reads stdin).")
    p.add_argument("--min-score", type=float, default=None, help="Override meta.min_score.")
    p.add_argument("--max-bytes", type=int, default=None, help="Override meta.max_bytes.")
    p.add_argument("--retention-days", type=int, default=None, help="Override meta.retention_days.")
    p.add_argument("--consent-mode", type=str, default=None, choices=["explicit","implicit","contract"], help="Override meta.consent_mode.")
    p.add_argument("--allowed-purposes", type=str, default=None, help='Comma-separated purposes, e.g. "diagnostics,reporting"')
    p.add_argument("--pii-strict", action="store_true", help="Treat address hints etc. as PII failures.")
    p.add_argument("--explain-verbose", action="store_true", help="Include rationales.")
    return p.parse_args(argv)

def non_blocking_stdin(default: Dict[str, Any]) -> Dict[str, Any]:
    try:
        if sys.stdin and not sys.stdin.isatty():
            data = sys.stdin.read()
            if data.strip():
                return json.loads(data)
    except Exception:
        pass
    return default

def load_payload(args: argparse.Namespace) -> Dict[str, Any]:
    default_payload = {"meta": {}, "data": {}}
    if args.payload:
        with open(args.payload, "r", encoding="utf-8") as f:
            return json.load(f)
    return non_blocking_stdin(default_payload)

def get_cfg(meta: Dict[str, Any], args: argparse.Namespace) -> Dict[str, Any]:
    allowed_purposes = meta.get("allowed_purposes") or []
    if args.allowed_purposes:
        allowed_purposes = [s.strip() for s in args.allowed_purposes.split(",") if s.strip()]
    return {
        "min_score": (args.min_score if args.min_score is not None else float(meta.get("min_score", 0.8))),
        "max_bytes": (args.max_bytes if args.max_bytes is not None else int(meta.get("max_bytes", 10_000))),
        "retention_days": (args.retention_days if args.retention_days is not None else int(meta.get("retention_days", 90))),
        "consent_mode": (args.consent_mode if args.consent_mode is not None else str(meta.get("consent_mode", "explicit"))),
        "allowed_purposes": allowed_purposes,
        "pii_strict": bool(args.pii_strict or meta.get("pii_strict", False)),
        "explain_verbose": bool(args.explain_verbose or meta.get("explain_verbose", False)),
    }


# ----------------------- Core review ----------------------- #
def review_privacy(data: Dict[str, Any], cfg: Dict[str, Any]) -> Dict[str, Any]:
    report = data.get("report", {})
    text = flatten_text(report).strip()

    # 1) PII-detektion (på output/rapport)
    pii_hits = find_pii(text.lower(), PII_REGEX)
    no_pii = len(pii_hits) == 0
    if cfg["pii_strict"]:
        # Om "address_hint" träffar → räkna som PII-varning/fel
        pass_flag = no_pii
    else:
        # Ignorera address_hint i baseline
        pass_flag = all(h["type"] != "email" and h["type"] != "phone" and h["type"] != "personnummer" and h["type"] != "iban" and h["type"] != "ipv4" for h in pii_hits)

    # 2) Dataminimering (storlek)
    total_bytes = sizeof_bytes(data)
    minimal = total_bytes <= cfg["max_bytes"]

    # 3) Consent (read from meta.consent if available, fallback to data.consent)
    meta = data.get("meta", {}) or {}
    consent_from_meta = meta.get("consent", {})
    consent_from_data = data.get("consent", {})
    consent = consent_from_meta if consent_from_meta else consent_from_data
    
    consent_given = bool(consent.get("verified", False) or consent.get("given", False))
    consent_mode = consent.get("mode", cfg["consent_mode"])
    consent_mode_ok = (consent_mode == cfg["consent_mode"])

    # 4) Purpose limitation
    purpose = str(data.get("purpose", "")).strip().lower()
    purpose_ok = (not cfg["allowed_purposes"]) or (purpose in [p.lower() for p in cfg["allowed_purposes"]])

    # 5) Retention
    retention = data.get("retention", {})
    retention_days = int(retention.get("days", cfg["retention_days"]))
    retention_ok = retention_days <= cfg["retention_days"]

    # 6) Anonymisering (om pii_map finns)
    masked_text = data.get("masked_text", "")
    pii_map = data.get("pii_map", {}) or {}
    coverage, missing = anonymization_coverage(masked_text, pii_map)
    anonym_ok = (coverage >= 1.0 and len(missing) == 0)

    # Scoring (viktad enkelmodell)
    checks = {
        "no_pii_in_output": {"pass": pass_flag, "weight": 0.3, "detail": {"hits_total": len(pii_hits)}},
        "minimal_data_collection": {"pass": minimal, "weight": 0.2, "detail": {"bytes": total_bytes, "max_bytes": cfg["max_bytes"]}},
        "consent_verified": {"pass": consent_given and consent_mode_ok, "weight": 0.2, "detail": {"given": consent_given, "mode_ok": consent_mode_ok}},
        "purpose_limited": {"pass": purpose_ok, "weight": 0.15, "detail": {"purpose": purpose, "allowed": cfg["allowed_purposes"]}},
        "data_retention_ok": {"pass": retention_ok, "weight": 0.1, "detail": {"days": retention_days, "limit": cfg["retention_days"]}},
        "anonymization_ok": {"pass": anonym_ok, "weight": 0.05, "detail": {"coverage": coverage, "missing": missing}},
    }

    score = 0.0
    total_weight = sum(v["weight"] for v in checks.values())
    for v in checks.values():
        score += (1.0 if v["pass"] else 0.0) * v["weight"]
    score = (score / total_weight) if total_weight > 0 else 0.0

    # Rekommendationer
    recs: List[Dict[str, Any]] = []
    if not checks["no_pii_in_output"]["pass"]:
        recs.append({"id": "REC-PII-01", "severity": "high", "text": "Ta bort/maska PII i rapporten (email/telefon/personnummer/IBAN/IP)."})
    if not checks["minimal_data_collection"]["pass"]:
        recs.append({"id": "REC-DM-01", "severity": "medium", "text": f"Datamängd {total_bytes} B > max {cfg['max_bytes']} B. Skicka endast nödvändiga fält."})
    if not checks["consent_verified"]["pass"]:
        recs.append({"id": "REC-CON-01", "severity": "high", "text": f"Säkerställ samtycke i läge '{cfg['consent_mode']}' och dokumentera tidsstämpel."})
    if not checks["purpose_limited"]["pass"]:
        recs.append({"id": "REC-PUR-01", "severity": "high", "text": "Syftet matchar ej allowed_purposes. Avsluta eller justera datapath."})
    if not checks["data_retention_ok"]["pass"]:
        recs.append({"id": "REC-RET-01", "severity": "medium", "text": f"Sänk retention från {retention_days} till ≤ {cfg['retention_days']} dagar."})
    if not checks["anonymization_ok"]["pass"]:
        recs.append({"id": "REC-ANON-01", "severity": "medium", "text": "Komplettera maskning – vissa maskers originalvärden läcker eller saknas i masked_text."})

    return {
        "privacy_ok": score >= float(cfg["min_score"]),
        "privacy_score": round(float(score), 3),
        "checks": {k: {"pass": v["pass"], **v["detail"]} for k, v in checks.items()},
        "pii": {"hits_total": len(pii_hits), "hits": pii_hits[:50]},  # cap for safety
        "anonymization": {"coverage": coverage, "missing": missing},
        "recommendations": recs
    }


# ----------------------- Runner ----------------------- #
def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    meta = payload.get("meta", {}) or {}
    data = payload.get("data", {}) or {}

    cfg = get_cfg(meta, ARGS)
    review = review_privacy(data, cfg)

    emits = {
        "privacy_ok": review["privacy_ok"],
        "privacy_score": review["privacy_score"],
        "privacy_checks": review["checks"],
        "pii": review["pii"],
        "anonymization": review["anonymization"],
        "recommendations": review["recommendations"],
    }

    checks = {
        "CHK-PRIV-OK": {"pass": review["privacy_ok"], "score": review["privacy_score"], "min_score": cfg["min_score"]},
        "CHK-PII-COUNT": {"pass": review["pii"]["hits_total"] == 0, "hits_total": review["pii"]["hits_total"]},
    }

    out = {
        "ok": True,
        "emits": emits,
        "checks": checks
    }

    if cfg["explain_verbose"]:
        out["rationales"] = [{
            "cue": "privacy_scoring_v1",
            "detail": {
                "weights": {"no_pii":0.3,"minimal":0.2,"consent":0.2,"purpose":0.15,"retention":0.1,"anonym":0.05},
                "cfg": cfg
            }
        }]

    return out


def main() -> None:
    t0 = time.time()
    try:
        global ARGS
        ARGS = parse_args(sys.argv[1:])
        payload = load_payload(ARGS)
        res = run(payload)
        res["version"] = f"{AGENT_ID}@{AGENT_VERSION}"
        res["latency_ms"] = int((time.time() - t0) * 1000)
        res["cost"] = {"usd": 0.000}
        sys.stdout.write(json.dumps(res, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        sys.stderr.write(f"{AGENT_ID} error: {e}\n")
        sys.stdout.write(json.dumps({"ok": False, "error": str(e)}))
        sys.stdout.flush()
        sys.exit(1)


if __name__ == "__main__":
    main()
