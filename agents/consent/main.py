#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
A1 ConsentAgent - Verifiera samtycke och scope
Hard stop om villkor ej uppfylls. Producerar signerat consent-token och artefakt.

I/O
- STDIN: {
    "intent":"consent.verify",
    "meta":{"case_id":"C123","runner_id":"R1","ts":"2025-10-23T11:25:00Z"},
    "data":{
      "consent_given": true,
      "subject_id": "user_abc",
      "actor_id": "agent_xyz",
      "jurisdiction": "SE",
      "age": 28,
      "terms_version": "v1.4",
      "consent_ts": "2025-10-23T11:20:00Z",
      "channel": "web_form",
      "scope": ["full_analysis"],         # begärd scope
      "purpose": ["relationship_report"], # begärd purpose
      "retention_days": 90,
      "nonce": "d5f1d8..."                # klientgenererad för replay-skydd
    }
}
- STDOUT: ENDA JSON-resultatet
- STDERR: färgade loggar
CLI:
  --batch B123            -> skriver consent_B123.json
  --cost-usd 0.0001
  --policy PATH.json      -> överskrid standardpolicy
Env:
  CONSENT_SECRET="hemligt_nyckelmaterial"
"""
from __future__ import annotations
import sys, json, time, argparse, os, hmac, hashlib, re
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Dict, Any

AGENT_VERSION = "1.2.0"
AGENT_ID = "consent"
DEFAULT_COST_USD = 0.0001

# -------- utils --------
def log(msg: str, level: str = "INFO") -> None:
    C = {"INFO":"\033[36m","OK":"\033[32m","WARN":"\033[33m","ERR":"\033[31m","RESET":"\033[0m"}
    sys.stderr.write(f"{C.get(level,'')}[{level}] {msg}{C['RESET']}\n")

ISO8601_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")

def utcnow() -> datetime:
    return datetime.now(timezone.utc)

def parse_iso(ts: str) -> datetime:
    if not ts or not ISO8601_RE.match(ts):
        raise ValueError(f"Invalid ISO8601 Zulu timestamp: {ts}")
    return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)

def json_dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))

def hmac_sha256(secret: bytes, msg: str) -> str:
    return hmac.new(secret, msg.encode("utf-8"), hashlib.sha256).hexdigest()

def read_policy(path: str | None) -> Dict[str, Any]:
    base = {
        "default_retention_days": 180,
        "min_age": 16,
        "minor_requires_guardian": True,
        "allowed_purposes": ["relationship_report","debug_quality","safety_review"],
        "allowed_scopes": {
            "full_analysis": ["PII_redacted=False"],
            "minimal_analysis": ["PII_redacted=True"],
            "meta_only": ["only_metadata=True","PII_redacted=True"]
        },
        "jurisdiction_rules": {
            "SE": {"min_age": 16},
            "EU": {"min_age": 16},
            "US": {"min_age": 13}
        },
        "require_terms": True,
        "valid_channels": ["web_form","app","api"],
        "nonce_ttl_seconds": 3600,
        "token_ttl_hours": 24
    }
    if not path:
        return base
    try:
        with open(path, "r", encoding="utf-8") as f:
            override = json.load(f)
        base.update(override or {})
    except Exception as e:
        log(f"Kunde inte läsa policy '{path}': {e}", "WARN")
    return base

# -------- core --------
def evaluate_scope_and_purpose(data: Dict[str, Any], policy: Dict[str, Any]) -> Dict[str, Any]:
    requested_scope = data.get("scope") or ["full_analysis"]
    requested_purpose = data.get("purpose") or ["relationship_report"]
    allowed_purposes = set(policy.get("allowed_purposes", []))

    purposes_ok = all(p in allowed_purposes for p in requested_purpose)
    # scope-minimering: om ok -> behåll första; annars nedgradera
    allowed_scopes = policy.get("allowed_scopes", {})
    scope_effective = None
    for sc in requested_scope:
        if sc in allowed_scopes:
            scope_effective = sc
            break
    if not scope_effective:
        # fallback minimal
        scope_effective = "minimal_analysis" if "minimal_analysis" in allowed_scopes else next(iter(allowed_scopes.keys()), "meta_only")

    scope_flags = allowed_scopes.get(scope_effective, [])

    return {
        "requested_scope": requested_scope,
        "requested_purpose": requested_purpose,
        "purposes_ok": purposes_ok,
        "scope_effective": scope_effective,
        "scope_flags": scope_flags
    }

def validate_hard_requirements(meta: Dict[str, Any], data: Dict[str, Any], policy: Dict[str, Any]) -> Dict[str, Any]:
    failures = {}

    # 1) explicit consent
    if not data.get("consent_given", False):
        failures["no_consent"] = "No consent given"

    # 2) IDs
    if not data.get("subject_id"):
        failures["no_subject"] = "Missing subject_id"
    if not data.get("actor_id"):
        failures["no_actor"] = "Missing actor_id"

    # 3) timestamps
    try:
        consent_ts = parse_iso(data.get("consent_ts"))
    except Exception:
        failures["bad_consent_ts"] = "Invalid consent_ts"
        consent_ts = None

    # 4) terms
    if policy.get("require_terms", True) and not data.get("terms_version"):
        failures["no_terms"] = "Missing terms_version"

    # 5) channel
    channel = data.get("channel")
    if channel not in policy.get("valid_channels", []):
        failures["bad_channel"] = f"Invalid channel '{channel}'"

    # 6) jurisdiction & age
    j = (data.get("jurisdiction") or "SE").upper()
    jr = policy.get("jurisdiction_rules", {}).get(j, {})
    min_age = jr.get("min_age", policy.get("min_age", 16))
    age = data.get("age")
    if age is None or not isinstance(age, (int, float)):
        failures["no_age"] = "Missing/invalid age"
    else:
        if age < min_age:
            if policy.get("minor_requires_guardian", True) and not data.get("guardian_consent", False):
                failures["minor_guardian"] = f"Minor requires guardian consent (min_age={min_age})"

    # 7) meta ts sanity
    try:
        run_ts = parse_iso(meta.get("ts"))
    except Exception:
        failures["bad_meta_ts"] = "Invalid meta.ts"
        run_ts = utcnow()

    # 8) retention
    retention_days = int(data.get("retention_days") or policy.get("default_retention_days", 180))
    if retention_days <= 0 or retention_days > 3650:
        failures["bad_retention"] = "Retention_days out of bounds (1..3650)"

    # 9) nonce (replay-skydd) – kräver att klient skickar 'nonce'
    nonce = data.get("nonce")
    if not nonce or len(str(nonce)) < 8:
        failures["bad_nonce"] = "Missing/weak nonce"

    return {
        "failures": failures,
        "consent_ts": consent_ts,
        "run_ts": run_ts,
        "retention_days": retention_days,
        "jurisdiction": j,
        "min_age": min_age,
        "channel": channel,
        "nonce": nonce
    }

def build_token(meta: Dict[str, Any], data: Dict[str, Any], effective: Dict[str, Any], policy: Dict[str, Any]) -> Dict[str, Any]:
    secret = (os.environ.get("CONSENT_SECRET") or "dev_secret").encode("utf-8")
    issued_at = utcnow()
    ttl_hours = int(policy.get("token_ttl_hours", 24))
    exp_at = issued_at + timedelta(hours=ttl_hours)

    token_payload = {
        "case_id": meta.get("case_id"),
        "subject_id": data.get("subject_id"),
        "actor_id": data.get("actor_id"),
        "scope": effective["scope_effective"],
        "purpose": effective["requested_purpose"],
        "issued_at": issued_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "expires_at": exp_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "nonce": data.get("nonce")
    }
    # signera
    body = json_dumps(token_payload)
    sig = hmac_sha256(secret, body)
    token = f"CONSENT.{sig[:16]}.{token_payload['issued_at']}"

    return {
        "token": token,
        "signature": sig,
        "payload": token_payload
    }

def build_checks(hard: Dict[str, Any], effective: Dict[str, Any], policy: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    failures = hard["failures"]
    checks = {
        "CHK-CONS-01:explicit_consent": {"pass": "no_consent" not in failures, "reason": failures.get("no_consent", "OK")},
        "CHK-CONS-02:ids_present": {"pass": all(k not in failures for k in ["no_subject","no_actor"]), "reason": failures.get("no_subject") or failures.get("no_actor") or "OK"},
        "CHK-CONS-03:timestamps_valid": {"pass": all(k not in failures for k in ["bad_consent_ts","bad_meta_ts"]), "reason": failures.get("bad_consent_ts") or failures.get("bad_meta_ts") or "OK"},
        "CHK-CONS-04:terms_ok": {"pass": "no_terms" not in failures, "reason": failures.get("no_terms","OK")},
        "CHK-CONS-05:channel_ok": {"pass": "bad_channel" not in failures, "reason": failures.get("bad_channel","OK")},
        "CHK-CONS-06:age_jurisdiction": {"pass": "minor_guardian" not in failures and "no_age" not in failures, "reason": failures.get("minor_guardian") or failures.get("no_age") or "OK"},
        "CHK-CONS-07:retention_ok": {"pass": "bad_retention" not in failures, "reason": failures.get("bad_retention","OK")},
        "CHK-CONS-08:nonce_ok": {"pass": "bad_nonce" not in failures, "reason": failures.get("bad_nonce","OK")},
        "CHK-CONS-09:purpose_allowed": {"pass": bool(effective["purposes_ok"]), "reason": "Purpose not allowed" if not effective["purposes_ok"] else "OK"},
        "CHK-CONS-10:scope_resolved": {"pass": effective["scope_effective"] is not None, "reason": "Scope resolution failed" if not effective["scope_effective"] else "OK"},
    }
    return checks

def overall_ok(checks: Dict[str, Dict[str, Any]]) -> bool:
    return all(c.get("pass", False) for c in checks.values())

def advice_from(checks: Dict[str, Dict[str, Any]]) -> str:
    fails = [k for k,v in checks.items() if not v.get("pass")]
    if not fails:
        return "Consent OK. Fortsätt pipeline."
    tips = []
    if any(k.startswith("CHK-CONS-04") for k in fails): tips.append("Be om godkännande av villkor (terms_version).")
    if any(k.startswith("CHK-CONS-06") for k in fails): tips.append("Verifiera ålder och/eller målsmans samtycke.")
    if any(k.startswith("CHK-CONS-09") for k in fails): tips.append("Justera 'purpose' till en av policy.allowed_purposes.")
    if any(k.startswith("CHK-CONS-10") for k in fails): tips.append("Begär stödd scope eller kör minimal_analysis.")
    if any(k.startswith("CHK-CONS-08") for k in fails): tips.append("Skicka stark 'nonce' (≥8 tecken) för replay-skydd.")
    if any(k.startswith("CHK-CONS-05") for k in fails): tips.append("Använd giltig kanal (web_form/app/api).")
    if any(k.startswith("CHK-CONS-07") for k in fails): tips.append("Sätt retention_days 1..3650.")
    if any(k.startswith("CHK-CONS-03") for k in fails): tips.append("Skicka giltiga ISO8601 Z-tidsstämplar.")
    return " | ".join(tips)

def write_artifact(batch_id: str, result: Dict[str, Any]) -> Path:
    p = Path(f"consent_{batch_id}.json")
    p.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return p

# -------- run --------
def run(payload: Dict[str, Any], policy: Dict[str, Any]) -> Dict[str, Any]:
    intent = payload.get("intent") or "consent.verify"
    if intent not in ("consent.verify", "consent.check"):
        raise ValueError(f"Unsupported intent '{intent}' for {AGENT_ID}")

    meta = payload.get("meta") or {}
    data = payload.get("data") or {}

    effective = evaluate_scope_and_purpose(data, policy)
    hard = validate_hard_requirements(meta, data, policy)
    checks = build_checks(hard, effective, policy)

    if not overall_ok(checks):
        return {
            "ok": False,
            "error": "Consent gate failed",
            "checks": checks,
            "emits": {
                "advice": advice_from(checks),
                "scope_effective": effective["scope_effective"],
                "scope_flags": effective["scope_flags"]
            }
        }

    # token + retention/expiry
    token = build_token(meta, data, effective, policy)
    retention_days = hard["retention_days"]
    consent_expiry = parse_iso(token["payload"]["expires_at"])
    retention_until = utcnow() + timedelta(days=retention_days)

    consent_record = {
        "subject_id": data.get("subject_id"),
        "actor_id": data.get("actor_id"),
        "jurisdiction": hard["jurisdiction"],
        "terms_version": data.get("terms_version"),
        "channel": hard["channel"],
        "purpose": effective["requested_purpose"],
        "scope": effective["scope_effective"],
        "scope_flags": effective["scope_flags"],
        "consent_ts": data.get("consent_ts"),
        "issued_at": token["payload"]["issued_at"],
        "expires_at": token["payload"]["expires_at"],
        "retention_until": retention_until.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "nonce": data.get("nonce")
    }

    emits = {
        "consent_token": token["token"],
        "consent_signature": token["signature"],
        "consent_payload": token["payload"],
        "consent_record": consent_record,
        "scope_effective": effective["scope_effective"],
        "scope_flags": effective["scope_flags"],
        "advice": "Consent OK. Fortsätt pipeline."
    }

    return {"ok": True, "emits": emits, "checks": checks, "version": f"{AGENT_ID}@{AGENT_VERSION}"}

# -------- entry --------
def main():
    t0 = time.time()
    parser = argparse.ArgumentParser(description="ConsentAgent")
    parser.add_argument("--batch", type=str, default="", help="Batch-ID för artefakt (consent_<id>.json)")
    parser.add_argument("--cost-usd", type=float, default=DEFAULT_COST_USD, help="Kostindikator USD")
    parser.add_argument("--policy", type=str, default="", help="Policy-override JSON-fil")
    args = parser.parse_args()

    policy = read_policy(args.policy)

    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
    except Exception as e:
        print(json_dumps({"ok": False, "error": f"Invalid JSON on stdin: {e}"}))
        sys.exit(1)

    try:
        res = run(payload, policy)
        res["latency_ms"] = int((time.time() - t0) * 1000)
        res["cost"] = {"usd": round(args.cost_usd, 6)}
        if args.batch:
            p = write_artifact(args.batch, res)
            log(f"Skrev artefakt: {p}", "OK")
        print(json_dumps(res))
    except Exception as e:
        log(f"Exception: {e}", "ERR")
        print(json_dumps({"ok": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
