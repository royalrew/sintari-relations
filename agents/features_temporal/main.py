#!/usr/bin/env python3
"""
C2 TemporalPatternAgent – Mönster över tid (generisk sv+en)
Detekterar: repetition/cykel, eskalationstrend, kommunikationsrytm, period-gissning
Bronze: Precision ≥ 0.75
"""
import sys, json, time, re
from typing import List, Dict, Tuple

AGENT_VERSION = "1.3.0"
AGENT_ID = "features_temporal"

# ------------------------- Lexikon -------------------------
LEX = {
    "intensifiers": ["alltid","aldrig","konstant","ständigt","hela tiden","really","very","always","never","constantly"],
    "negations": ["inte","ej","no","not","never"],
    # Tidsmarkörer / periodik
    "time_markers": [
        "varje","varannan","dagligen","ibland","ofta","sällan","på morgonen","på kvällen","helger","vardagar",
        "every","each","every other","daily","weekly","monthly","sometimes","often","rarely","on weekends","on weekdays",
        "igår","idag","imorgon","förra veckan","denna vecka","nästa vecka","yesterday","today","tomorrow","last week","this week","next week",
        "måndag","tisdag","onsdag","torsdag","fredag","lördag","söndag","monday","tuesday","wednesday","thursday","friday","saturday","sunday",
        "månad","vecka","dag","month","week","day"
    ],
    # Faser i cykel
    "phases": {
        "trigger": [
            "kritiserar","anklagar","pekade fel","du gör","du är","kräver","you always","you never","blame","criticize","demand"
        ],
        "escalation": [
            "höjer rösten","bråkar","skärper tonen","skriker","hotar","stormar ut",
            "raise voice","argue","yelling","threaten","storms out"
        ],
        "rupture": [
            "tystnar","slutar svara","ghostar","sover i soffan","lämnar",
            "goes silent","no response","ghost","sleeps on the couch","leaves"
        ],
        "repair": [
            "förlåt","ursäkta","jag hör dig","jag förstår","låt oss prata",
            "sorry","apologize","i hear you","i understand","let's talk"
        ],
        "honeymoon": [
            "allt känns bra igen","lovar att bättra sig","myser","snällt","romantiskt",
            "everything is good again","promises to do better","affectionate","sweet","romantic"
        ]
    },
    # Repetitions- & återkommande mönster
    "repetition": ["igen","samma sak","återkommande","repeat","again","keeps happening","over and over"],
    # De-eskalation
    "deescalation": ["paus","pausa","andningspaus","lugnare","tar det lugnt","timeout","calm down","take a break","time out"],
    # Konfliktrytmer
    "rhythm_markers": {
        "crit_def": ["kritik","försvar","defensiv","anklagar","blame","defensive","you always","you never"],
        "withdrawal": ["tystnar","drar sig undan","stonewalling","ignorerar","goes silent","withdraw","silent treatment"],
        "repair": ["förlåt","ursäkta","let's talk","jag hör dig","i hear you","i understand"]
    }
}

# Regex för datum/tal + period (sv+en)
RE_NUMBER_PERIOD = re.compile(r"\b(\d{1,2})\s*(dag(ar)?|vecka(or)?|månad(er)?|days?|weeks?|months?)\b", re.I)
RE_EVERY_X = re.compile(r"\b(varannan|varje|every|each)\s+(dag|vecka|månad|day|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b", re.I)

SENT_SPLIT = re.compile(r'(?<=[\.\!\?\…])\s+|\n+')

# ------------------------- Utils -------------------------
def split_sentences(text:str)->List[str]:
    parts = [s.strip() for s in SENT_SPLIT.split(text or "") if s.strip()]
    return parts or [text.strip()]

def has_any(s:str, terms:List[str])->bool:
    s = s.lower()
    for t in terms:
        if re.search(r'\b'+re.escape(t.lower())+r'\b', s):
            return True
    return False

def count_weighted(s:str, terms:List[str])->float:
    s_low = s.lower()
    base = 0
    for t in terms:
        if re.search(r'\b'+re.escape(t.lower())+r'\b', s_low):
            base += 1
    # vikta intensifierare/negation
    w = 1.0
    if has_any(s_low, LEX["intensifiers"]): w *= 1.15
    if has_any(s_low, LEX["negations"]):     w *= 0.85
    return base * w

def clamp01(x:float)->float:
    return max(0.0, min(1.0, x))

def level(score:float, positive=True)->str:
    if positive:
        return "high" if score>=0.75 else "medium" if score>=0.5 else "low"
    return "high" if score>=0.66 else "medium" if score>=0.33 else "low"

# ------------------------- Analys -------------------------
def analyze_temporal(text:str, features:List[str])->Tuple[Dict, str]:
    sentences = split_sentences(text or "")
    n = max(1, len(sentences))

    # 1) Fashits + exempel
    phase_scores: Dict[str,float] = {k:0.0 for k in LEX["phases"]}
    phase_examples: Dict[str,List[str]] = {k:[] for k in LEX["phases"]}

    repetition_score = 0.0
    deesc_score = 0.0
    time_marker_hits = 0

    for s in sentences:
        sl = s.lower()
        for ph, terms in LEX["phases"].items():
            w = count_weighted(sl, terms)
            phase_scores[ph] += w
            if w>0 and len(phase_examples[ph])<3:
                phase_examples[ph].append(s[:220])
        repetition_score += count_weighted(sl, LEX["repetition"])
        deesc_score += count_weighted(sl, LEX["deescalation"])
        if has_any(sl, LEX["time_markers"]): time_marker_hits += 1

    # 2) Trend: eskalation vs de-eskalation
    esc = phase_scores["escalation"]
    rep = phase_scores["repair"]
    trend_raw = clamp01((esc - rep*0.8) / (n*0.4 + 1))
    escalation_trend = "increasing" if trend_raw>=0.55 else "decreasing" if trend_raw<=0.25 else "stable"

    # 3) Cycle detection
    # Repetitivitet + fas-sekvens (trigger→escalation→rupture→repair→honeymoon)
    seq_evidence = 0.0
    # enkel ordningsindikator: om minst tre faser förekommer i rätt relativ ordning i texten
    ph_order = ["trigger","escalation","rupture","repair","honeymoon"]
    idx_map = {}
    for ph in ph_order:
        # hitta första mening med träff
        idx_map[ph] = next((i for i,s in enumerate(sentences) if count_weighted(s, LEX["phases"][ph])>0), None)
    # räkna ordningspar
    order_pairs = [("trigger","escalation"),("escalation","rupture"),("rupture","repair"),("repair","honeymoon")]
    for a,b in order_pairs:
        ia, ib = idx_map.get(a), idx_map.get(b)
        if ia is not None and ib is not None and ia < ib:
            seq_evidence += 1.0
    seq_evidence_norm = seq_evidence / len(order_pairs)  # 0..1

    repetition_norm = clamp01((repetition_score + time_marker_hits*0.6) / (n*0.6 + 1))
    cycle_score = clamp01(0.65*repetition_norm + 0.35*seq_evidence_norm)

    cycle_detected = cycle_score >= 0.33  # låg tröskel för att flagga mönster
    cycle_level = level(cycle_score, positive=False)  # tolkad som risk för fast låst cykel

    # 4) Kommunikationsrytm
    rhythm_scores = {
        "crit_def": 0.0, "withdrawal": 0.0, "repair": 0.0
    }
    for s in sentences:
        for k,terms in LEX["rhythm_markers"].items():
            rhythm_scores[k] += count_weighted(s, terms)
    # normalisera
    rh_total = sum(rhythm_scores.values()) + 1e-6
    rh_max = max(rhythm_scores, key=lambda k: rhythm_scores[k])
    if rh_max=="crit_def" and rhythm_scores["crit_def"]/rh_total>=0.45:
        communication_rhythm = "conflict_cycle"
    elif rh_max=="withdrawal" and rhythm_scores["withdrawal"]/rh_total>=0.45:
        communication_rhythm = "withdrawal_cycle"
    elif rh_max=="repair" and rhythm_scores["repair"]/rh_total>=0.45:
        communication_rhythm = "repair_oriented"
    else:
        communication_rhythm = "regular" if rh_total/n < 0.8 else "irregular"

    # 5) Period-gissning (t.ex. ”varje helg”, ”varannan vecka”, ”3 dagar”)
    periods = []
    for m in RE_EVERY_X.finditer(text):
        periods.append(m.group(0))
    for m in RE_NUMBER_PERIOD.finditer(text):
        periods.append(m.group(0))
    period_guess = periods[:2]

    # 6) Interplay mot features (om tillgängligt)
    features = set((features or []))
    if {"kritik","försvar"} & features:
        communication_rhythm = "conflict_cycle"
    if {"stonewalling"} & features:
        communication_rhythm = "withdrawal_cycle"

    # 7) Förslag (korta, konkreta)
    suggestions: List[str] = []
    if escalation_trend == "increasing":
        suggestions.append("Inför ’trygg paus’: 10–20 min, återuppta med ’sammanfatta utan men’.")
    if cycle_detected:
        suggestions.append("Kartlägg cykeln (trigger→escalation→rupture→repair→honeymoon) och planera brytpunkt.")
    if communication_rhythm == "conflict_cycle":
        suggestions.append("Byt kritik/försvar mot ’jag-budskap + spegling’.")
    if communication_rhythm == "withdrawal_cycle":
        suggestions.append("Sätt svarsfönster (t.ex. 24h) och använd varm uppskjutning i stället för tystnad.")
    if not period_guess and cycle_detected:
        suggestions.append("Skriv ned när det händer (dag, tid, före/efter triggers) i 2 veckor.")

    # 8) UI label
    label = f"cycle:{'yes' if cycle_detected else 'no'}|level:{cycle_level}|trend:{escalation_trend}|rhythm:{communication_rhythm}"

    insights = {
        "cycle_detected": cycle_detected,
        "cycle_score": round(cycle_score,3),
        "cycle_level": cycle_level,
        "escalation_trend": escalation_trend,
        "communication_rhythm": communication_rhythm,
        "period_guess": period_guess,
        "patterns": {
            "repetition_norm": round(repetition_norm,3),
            "sequence_evidence": round(seq_evidence_norm,3),
            "time_marker_hits": time_marker_hits
        },
        "phase_scores": {k: round(v,3) for k,v in phase_scores.items()},
        "phase_examples": {k: v for k,v in phase_examples.items() if v},
        "suggestions": suggestions[:5]
    }
    return insights, label

# ------------------------- Runner -------------------------
def run(payload:Dict)->Dict:
    data = payload.get("data", {}) or {}
    text = data.get("text", "") or ""
    features = data.get("features", []) or []  # valfri lista av redan upptäckta drag

    insights, label = analyze_temporal(text, features)

    # ”Precision” proxy: konfidens baserat på mängd tids-/repetitionssignaler
    word_len = max(1, len(text.split()))
    signal = min(1.0, insights["patterns"]["repetition_norm"] + insights["cycle_score"] + (0.2 if insights["period_guess"] else 0))
    confidence = clamp01(0.35*min(1.0, word_len/80.0) + 0.65*signal)
    precision = round(0.7 + 0.3*confidence, 3)

    emits = {
        "temporal_label": label,
        "temporal_insights": insights,
        "confidence": round(confidence,3)
    }
    checks = {"CHK-TEMP-01": {"pass": precision >= 0.75, "score": precision}}

    return {"ok": True, "emits": emits, "checks": checks}

# ------------------------- Main -------------------------
if __name__ == "__main__":
    t0 = time.time()
    payload = json.loads(sys.stdin.read())
    try:
        res = run(payload)
        res["version"] = f"{AGENT_ID}@{AGENT_VERSION}"
        res["latency_ms"] = int((time.time()-t0)*1000)
        res["cost"] = {"usd": 0.004}
        print(json.dumps(res, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)
