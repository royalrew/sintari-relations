#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
D6 AlignmentAgent - Mål/values-konflikter
- Explainable signals (values/goals, konfliktfraser, negationer)
- Klassificerar alignment: high/medium/low + score 0..1
- 'Sant på S004': Om meta.case_id == "S004" krävs low alignment för pass

I/O
STDIN:
{
  "intent": "diag.alignment",
  "meta": {"case_id":"S004","runner_id":"R1","ts":"2025-10-23T11:20:00Z"},
  "data": {
    "text": "...",
    "features": ["sv"],                 # valfritt
    "tags": ["relation","familj"],      # valfritt
    "language": "sv"                    # valfritt, default sv
  }
}

STDOUT: ENDA resultatet (JSON)
STDERR: färgade loggar

CLI:
  --batch ID   -> alignment_<ID>.json artefakt
  --cost-usd F
"""
from __future__ import annotations
import sys, json, time, argparse, re
from pathlib import Path
from typing import Dict, Any, List, Tuple

AGENT_VERSION = "1.2.0"
AGENT_ID = "diag_alignment"
DEFAULT_COST_USD = 0.010

# -------- utils --------
def log(msg: str, level: str = "INFO") -> None:
    C = {"INFO":"\033[36m","OK":"\033[32m","WARN":"\033[33m","ERR":"\033[31m","RESET":"\033[0m"}
    sys.stderr.write(f"{C.get(level,'')}[{level}] {msg}{C['RESET']}\n")

def clamp01(x: float) -> float:
    return 0.0 if x < 0 else 1.0 if x > 1 else x

def json_dumps(o: Any) -> str:
    return json.dumps(o, ensure_ascii=False, separators=(",", ":"))

# -------- lexikon (sv + en) --------
VALUES = {
    "prioriteter": ["prioritet","prioritera","viktigt","viktigast","priority","important","trade-off","kompromiss"],
    "värderingar": ["värdering","värderingar","värde","princip","principer","values","principles","etik","normer"],
    "mål": ["mål","dröm","drömmar","plan","planer","goals","ambition","vision","framtidsplan"]
}

GOALS = {
    "karriär": ["karriär","jobb","arbete","jobbet","career","work","befordran","starta företag","start-up","företagande"],
    "familj": ["familj","barn","hemma","familjeliv","family","children","kids","hem","förälder","parent"],
    "relation": ["relation","förhållande","tillsammans","partner","sambo","make","maka","relationship","vi","oss"],
    "ekonomi": ["ekonomi","pengar","inkomst","lön","budget","sparande","economy","income","salary","finance"],
    "frihet": ["frihet","egen tid","hobby","resa","resor","travel","egen utveckling","studier","utbildning","study","education"]
}

# konfliktsignaler och negation
CONFLICT_CUES = [
    "konflikt","krock","krockar","kolliderar","drar isär","drar åt olika håll",
    "bråk","osams","svårt att kombinera","välja mellan","antingen eller",
    "för lite tid","tar all tid","prioriterar bort","orkar inte båda",
    "compete","conflict","clash","either or","can't have both"
]
NEGATIONS = ["inte","ej","no","not","inget","ingenting","utan","saknar"]

# närliggande ord → starkare konflikt (tids-/resurskrock)
RESOURCE_CUES = ["tid","schema","arbete","barnvakt","pengar","energi","ork","stress","övertid","resor"]

# -------- kärnlogik --------
def find_hits(text: str, vocab: Dict[str, List[str]]) -> Dict[str,int]:
    hits = {}
    for k, words in vocab.items():
        count = 0
        for w in words:
            # ordgräns där det är rimligt, men tillåt fraser
            if " " in w:
                count += len(re.findall(re.escape(w.lower()), text))
            else:
                count += len(re.findall(r"\b" + re.escape(w.lower()) + r"\b", text))
        if count:
            hits[k] = count
    return hits

def window_conflict_score(text: str) -> Tuple[float, List[Dict[str,Any]]]:
    """Poängsätt explicit konflikt + resurskrock i närfönster."""
    evidences = []
    score = 0.0
    # indexera alla matchers positioner
    for cue in CONFLICT_CUES:
        for m in re.finditer(re.escape(cue.lower()), text):
            start = max(0, m.start()-80); end = min(len(text), m.end()+80)
            window = text[start:end]
            # vägning upp vid närvaro av minst två GOAL-domäner i fönstret
            domains_present = set()
            for g_name, g_words in GOALS.items():
                for w in g_words:
                    if re.search(r"\b" + re.escape(w.lower()) + r"\b", window):
                        domains_present.add(g_name); break
            wscore = 0.25
            if len(domains_present) >= 2:
                wscore += 0.35
            if any(re.search(r"\b" + re.escape(rw.lower()) + r"\b", window) for rw in RESOURCE_CUES):
                wscore += 0.20
            # negation i fönstret drar ned
            if any(re.search(r"\b" + re.escape(ng.lower()) + r"\b", window) for ng in NEGATIONS):
                wscore -= 0.20
            wscore = max(0.0, wscore)
            score += wscore
            evidences.append({
                "cue": cue, "window": window.strip(), "domains": sorted(list(domains_present)), "score": round(wscore,3)
            })
    # normalisera grovt
    return clamp01(score), evidences

def compute_alignment(text: str, tags: List[str]) -> Dict[str,Any]:
    text = text.lower()
    val_hits = find_hits(text, VALUES)
    goal_hits = find_hits(text, GOALS)
    conflict_score, conflict_evd = window_conflict_score(text)

    # Bas-signal: hur många mål-domäner nämns?
    domains_mentioned = sum(1 for v in goal_hits.values() if v > 0)
    diversity = min(1.0, domains_mentioned / 3.0)  # >3 domäner ger full
    values_presence = min(1.0, sum(val_hits.values()) / 4.0)

    # Alignmentscore: högre conflict -> lägre alignment
    # högre values_presence + diversity kan vara positivt men bara om låg konflikt
    raw = 0.6*(1.0 - conflict_score) + 0.25*max(0.0, values_presence - 0.2) + 0.15*max(0.0, diversity - 0.2)
    score = clamp01(raw)

    # Klassnivåer
    if score >= 0.78:
        level = "high"
    elif score >= 0.52:
        level = "medium"
    else:
        level = "low"

    # Utdrag av tydliga konflikt-domäner för UX
    domains_sorted = sorted(goal_hits.items(), key=lambda kv: -kv[1])
    top_domains = [d for d,c in domains_sorted if c > 0][:3]

    return {
        "alignment_score": round(score, 3),
        "alignment_level": level,
        "value_markers": val_hits,
        "goal_markers": goal_hits,
        "conflict_score": round(conflict_score, 3),
        "conflict_evidence": conflict_evd[:6],
        "top_goal_domains": top_domains,
        "tags_used": tags or []
    }

def advice_from(result: Dict[str,Any]) -> List[str]:
    adv = []
    level = result["alignment_level"]
    if level == "low":
        # konkreta råd kopplat till konfliktdomäner
        ds = result.get("top_goal_domains", [])
        if {"karriär","familj"}.issubset(ds) or {"karriär","relation"}.issubset(ds):
            adv.append("Tids-/gränssättning: blocka 2 fasta relation/familj-pass i veckan; synka kalender.")
            adv.append("Prioriteringsövning: rangordna topp-3 mål var för sig, skapa gemensam kompromisslista.")
        else:
            adv.append("Gör varsin topp-3-lista över viktigaste värderingar och jämför; enas om 1–2 förändringar.")
        adv.append("Sätt ett konkret experiment (2 veckor) och utvärdera med enkel checklista.")
    elif level == "medium":
        adv.append("Förtydliga individuella behov (”måste ha” vs ”trevligt att ha”) och gör enkel veckoritual.")
    else:
        adv.append("Behåll nuvarande struktur; planera kvartalsvis värde/ mål-synk.")
    return adv

# -------- checks --------
def build_checks(meta: Dict[str,Any], res: Dict[str,Any]) -> Dict[str,Dict[str,Any]]:
    chk = {}
    # 01: kvalitetssignal – alignment_score korrelerar med (1 - conflict_score)
    corr_ok = (1.0 - res["conflict_score"]) - res["alignment_score"] <= 0.35
    chk["CHK-ALIGN-01:consistency"] = {"pass": bool(corr_ok), "score": 1.0 if corr_ok else 0.6}

    # 02: determinism – inga NaN och bounds OK
    deterministic = (
        isinstance(res["alignment_score"], float)
        and 0.0 <= res["alignment_score"] <= 1.0
        and 0.0 <= res["conflict_score"] <= 1.0
    )
    chk["CHK-ALIGN-02:deterministic"] = {"pass": deterministic, "score": 1.0 if deterministic else 0.0}

    # 03: “Sant på S004”: kräver low när case_id == S004
    if str(meta.get("case_id","")).upper() == "S004":
        chk["CHK-ALIGN-03:S004_low_required"] = {"pass": res["alignment_level"] == "low",
                                                  "reason": "Requires low alignment on S004"}
    else:
        chk["CHK-ALIGN-03:S004_low_required"] = {"pass": True, "reason": "N/A"}

    # 04: basic coverage – minst en goal-domän hittad vid konflikt_evidence
    if res["conflict_evidence"]:
        ok_cov = len(res.get("top_goal_domains", [])) >= 1
    else:
        ok_cov = True
    chk["CHK-ALIGN-04:coverage"] = {"pass": ok_cov, "score": 1.0 if ok_cov else 0.7}

    return chk

# -------- run --------
def run(payload: Dict[str,Any]) -> Dict[str,Any]:
    data = payload.get("data") or {}
    meta = payload.get("meta") or {}
    intent = payload.get("intent") or "diag.alignment"
    if intent not in ("diag.alignment", "diag.alignment.check"):
        raise ValueError(f"Unsupported intent '{intent}' for {AGENT_ID}")

    text: str = (data.get("text") or "").strip()
    features: List[str] = data.get("features") or []
    tags: List[str] = data.get("tags") or []
    if not text:
        return {"ok": False, "error": "Missing data.text"}

    result = compute_alignment(text, tags)
    suggestions = advice_from(result)
    emits = {"align_insights": {**result, "suggestions": suggestions}, "features_used": features}

    checks = build_checks(meta, result)
    overall_ok = all(v.get("pass", False) for v in checks.values())

    return {
        "ok": overall_ok,
        "emits": emits,
        "checks": checks,
        "version": f"{AGENT_ID}@{AGENT_VERSION}"
    }

def write_artifact(batch_id: str, result: Dict[str,Any]) -> Path:
    p = Path(f"alignment_{batch_id}.json")
    p.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return p

# -------- entry --------
def main():
    t0 = time.time()
    parser = argparse.ArgumentParser(description="D6 AlignmentAgent")
    parser.add_argument("--batch", type=str, default="", help="Artefakt-ID (alignment_<id>.json)")
    parser.add_argument("--cost-usd", type=float, default=DEFAULT_COST_USD, help="Kostindikator USD")
    args = parser.parse_args()

    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
    except Exception as e:
        print(json_dumps({"ok": False, "error": f"Invalid JSON on stdin: {e}"}))
        sys.exit(1)

    try:
        res = run(payload)
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
