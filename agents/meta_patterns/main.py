#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, json, time, re
from typing import List, Dict, Any, Tuple

# Fix Unicode encoding for Windows
import codecs
sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())
sys.stderr = codecs.getwriter('utf-8')(sys.stderr.detach())

AGENT_VERSION = "2.0.0"
AGENT_ID = "meta_patterns"

# -------------------------- Utils --------------------------
URL_RE = re.compile(r"https?://\S+|www\.\S+", re.I)
EMAIL_RE = re.compile(r"\b[\w\.-]+@[\w\.-]+\.\w+\b", re.I)
CODE_FENCE_RE = re.compile(r"```.*?```", re.S)
NUM_RE = re.compile(r"\d+")
WS_RE = re.compile(r"\s+")

def normalize(text: str) -> str:
    t = text or ""
    t = CODE_FENCE_RE.sub(" ", t)
    t = URL_RE.sub(" ", t)
    t = EMAIL_RE.sub(" ", t)
    t = NUM_RE.sub(" ", t)
    t = WS_RE.sub(" ", t)
    return t.strip()

def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))

def iou(a: Tuple[int,int], b: Tuple[int,int]) -> float:
    a1,a2 = a; b1,b2 = b
    inter = max(0, min(a2,b2) - max(a1,b1))
    union = (a2-a1) + (b2-b1) - inter
    return inter/union if union>0 else 0.0

# -------------------------- Default archetypes (sv+en) --------------------------
# Varje arketyp: severity (0..1), risk, recommendation, patterns (regex), keywords (fallback)
DEFAULT_ARCHETYPES: Dict[str, Dict[str, Any]] = {
    "💔 Gaslighting": {
        "severity": 0.9, "risk_level": "HIGH",
        "recommendation": "Notera tecken på gaslighting – sätt gränser och sök stöd.",
        "patterns": [
            r"\b(du|you)\s+(minns fel|hittar på|inbillar dig|overreact|remember wrong|imagine(d)? it)\b",
            r"\b(det|that)\s+(har aldrig hänt|never happened)\b",
            r"\b(du överreagerar|you're overreacting)\b"
        ],
        "keywords": ["minns fel","inbillar","överreagerar","remember wrong","imagining","never happened"]
    },
    "🔄 Förlåtelsecykel / Apology loop": {
        "severity": 0.6, "risk_level": "MEDIUM",
        "recommendation": "Upprepade svek kräver gränser och uppföljning på beteende, inte ord.",
        "patterns": [
            r"\b(säger förlåt|bad om ursäkt|apologiz(e|ed|ing))\b.*\b(igen|again)\b",
            r"\b(lovar|promise(s|d)?)\b.*\b(ändra|change|never again|aldrig mer)\b"
        ],
        "keywords": ["förlåt","ursäkt","lovar","igen","promise","apology","again"]
    },
    "🪞 Ojämlik spegling / Asymmetry": {
        "severity": 0.7, "risk_level": "MEDIUM",
        "recommendation": "Balansera omsorg och ansträngning – sätt konkreta förväntningar.",
        "patterns": [
            r"\bjag\s+(lyssnar|stödjer|hjälper)\s+alltid\b.*\b(han|hon|de)\s+(aldrig|inte)\b",
            r"\b(i always)\s+(listen|support|help).*\b(never|doesn'?t)\b"
        ],
        "keywords": ["alltid","aldrig","always","never","lyssnar","support","hjälper"]
    },
    "🧊 Avstängd kommunikation / Withdrawal": {
        "severity": 0.8, "risk_level": "HIGH",
        "recommendation": "Avstängd kommunikation skapar isolering – avtala svarsfönster och trygg paus.",
        "patterns": [
            r"\b(pratar inte|tystnar|svarar inte|ignorerar)\b",
            r"\b(i (don'?t )?want to talk|go(es)? silent|left (me )?on read|no response)\b"
        ],
        "keywords": ["tystnad","ignorera","svarar inte","left on read","no response"]
    },
    "💣 Verbalt våld / Verbal abuse": {
        "severity": 0.9, "risk_level": "HIGH",
        "recommendation": "Verbalt våld är aldrig okej – skydda dig och sök stöd.",
        "patterns": [
            r"\b(hån(ar)?|gör narr|förolämp(ar)?|kränk(er)?)\b",
            r"\b(mock(s|ing)?|insult(s|ing)?|demean(s|ing)?)\b"
        ],
        "keywords": ["hån","förolämp","kränk","mock","insult","demean"]
    },
    "⚖️ Maktobalans / Control": {
        "severity": 0.85, "risk_level": "HIGH",
        "recommendation": "Adresséra kontrollbeteenden – tydliga gränser och transparensregler.",
        "patterns": [
            r"\b(bestämmer|kontrollerar|styr|tvingar|förbjuder|hindrar)\b.*\b(mig|mina|vad jag)\b",
            r"\b(control(s|ling)?|forbid(s|ding)?|make(s)? you|force(s|d)?)\b"
        ],
        "keywords": ["bestämmer","kontrollerar","tvingar","förbjuder","control","forbid","force"]
    },
    "🧩 Undvikande anknytning / Avoidant": {
        "severity": 0.7, "risk_level": "MEDIUM",
        "recommendation": "Öva trygg närhet med små steg och förutsägbarhet.",
        "patterns": [
            r"\b(blir kall|drar sig undan|undviker|backar)\b",
            r"\b(withdraw(s|n)?|avoid(s|ing)?|pulls? away)\b"
        ],
        "keywords": ["kall","undviker","drar sig undan","withdraw","avoid"]
    },
    "💉 Beroendemönster / Entrapment": {
        "severity": 0.8, "risk_level": "HIGH",
        "recommendation": "Knyt stöd utanför relationen – planera säkra steg.",
        "patterns": [
            r"\b(kan inte (lämna|sluta)|måste stanna|känner mig skyldig)\b",
            r"\b(can('|no)t (leave|stop)|have to stay|feel guilty\b)"
        ],
        "keywords": ["kan inte lämna","måste","skyldig","cannot leave","have to stay","guilty"]
    },
    "💡 Självinsikt växer / Insight": {
        "severity": 0.3, "risk_level": "LOW",
        "recommendation": "Bra start – dokumentera mönster och formulera behov.",
        "patterns": [
            r"\b(börjar förstå|inser|för första gången|first time|i realize)\b"
        ],
        "keywords": ["börjar förstå","inser","first time","realize"]
    }
}

# -------------------------- Scoring & merge --------------------------
GAP_JOIN = 2
IOU_MERGE = 0.50
IOU_NMS = 0.80

def score_text_for_archetype(name: str, conf: Dict[str,Any], text: str) -> Tuple[float, List[Dict[str,Any]]]:
    severity = float(conf.get("severity", 0.5))
    spans: List[Dict[str,Any]] = []
    score = 0.0

    # 1) Regex-fraser (tyngst)
    for pat in conf.get("patterns", []):
        for m in re.finditer(pat, text, flags=re.I):
            s,e = m.start(), m.end()
            spans.append({"start": s, "end": e, "label": name, "source": "PHRASE", "text": text[s:e], "conf": 0.9})
            score += 2.0 * severity

    # 2) Fallback-nyckelord (lätt vikt)
    tl = text.lower()
    for kw in conf.get("keywords", []):
        pos = tl.find(kw.lower())
        if pos != -1:
            s,e = pos, pos+len(kw)
            spans.append({"start": s, "end": e, "label": name, "source": "KEYWORD", "text": text[s:e], "conf": 0.7})
            score += 0.75 * severity

    return score, spans

def merge_overlaps(spans: List[Dict[str,Any]]) -> List[Dict[str,Any]]:
    if not spans: return []
    spans = sorted(spans, key=lambda x: (x["label"], x["start"], x["end"]))
    out = []
    for s in spans:
        if not out:
            out.append(s); continue
        last = out[-1]
        if s["label"] == last["label"] and s["start"] <= last["end"] + GAP_JOIN:
            if iou((s["start"], s["end"]), (last["start"], last["end"])) >= IOU_MERGE:
                last["end"] = max(last["end"], s["end"])
                last["conf"] = max(last.get("conf",0.7), s.get("conf",0.7))
                last["text"] = None  # undvik megatexter; klient kan hämta från original
                continue
        out.append(s)
    return out

def nms(spans: List[Dict[str,Any]], limit:int) -> List[Dict[str,Any]]:
    spans = sorted(spans, key=lambda s: (s["end"]-s["start"]) * s.get("conf",0.8), reverse=True)
    kept: List[Dict[str,Any]] = []
    for s in spans:
        keep = True
        for t in kept:
            if iou((s["start"], s["end"]), (t["start"], t["end"])) >= IOU_NMS:
                keep = False; break
        if keep:
            kept.append(s)
        if len(kept) >= limit:
            break
    return kept

# -------------------------- Main analysis --------------------------
def analyze(text: str, meta: Dict[str,Any]) -> Dict[str,Any]:
    raw = text or ""
    norm = normalize(raw)
    if not norm:
        return {"archetypes": [], "spans": [], "confidence": 0.0}

    # Konfig
    top_k = int(meta.get("top_k", 3))
    score_thr = float(meta.get("score_threshold", 0.75))
    span_limit = int(meta.get("span_limit", 12))

    # Slå ihop default + ev. extra patterns från meta
    arche_cfg = dict(DEFAULT_ARCHETYPES)
    extra = meta.get("extra_patterns") or {}
    for k,v in extra.items():
        arche_cfg[k] = v

    # Scoring
    all_detected = []
    all_spans = []
    for name, conf in arche_cfg.items():
        sc, spans = score_text_for_archetype(name, conf, norm)
        if sc > 0:
            all_detected.append({
                "archetype": name,
                "score": round(sc,3),
                "severity": conf.get("severity", 0.5),
                "risk_level": conf.get("risk_level","LOW"),
                "recommendation": conf.get("recommendation","")
            })
            # Tagga span med kort label (utan emoji) för downstream
            short = name.split(" ", 1)[-1]
            for sp in spans:
                sp["label_short"] = short
            all_spans.extend(spans)

    # Merge och NMS på spans
    merged = merge_overlaps(all_spans)
    selected_spans = nms(merged, limit=span_limit)

    # Sortera arketypinsikter på (score, severity)
    all_detected.sort(key=lambda a: (a["score"], a.get("severity",0.5)), reverse=True)
    # threshold
    filtered = [a for a in all_detected if a["score"] >= score_thr]
    top = (filtered or all_detected)[:top_k]

    # Confidence: längd + toppscore
    tokens = max(1, len(norm.split()))
    top_score = top[0]["score"] if top else 0.0
    confidence = clamp01(0.35*min(1.0, tokens/80.0) + 0.65*min(1.0, top_score/4.0))

    # Samla recommendations för toppar
    recs = [a["recommendation"] for a in top if a.get("recommendation")]

    # Högsta risk i alla detekterade
    risk_order = {"LOW":0,"MEDIUM":1,"HIGH":2}
    max_risk = None
    if all_detected:
        max_risk = max((a["risk_level"] for a in all_detected), key=lambda r: risk_order.get(r,0))

    label = f"archetypes:{len(top)}/{len(all_detected)}|primary:{top[0]['archetype'] if top else 'none'}|risk:{max_risk or 'NA'}"

    return {
        "archetype_insights": top,
        "primary_archetype": top[0]["archetype"] if top else None,
        "archetype_count": len(all_detected),
        "all_detected": [a["archetype"] for a in all_detected],
        "spans": selected_spans,
        "max_risk_level": max_risk,
        "recommendations": recs,
        "label": label,
        "confidence": round(confidence,3)
    }

# -------------------------- Runner --------------------------
def run(payload: Dict[str,Any]) -> Dict[str,Any]:
    data = (payload.get("data") or {})
    meta = (payload.get("meta") or {})
    text = data.get("description") or data.get("text") or ""

    insights = analyze(text, meta)

    emits = {
        "archetype_insights": insights["archetype_insights"],
        "primary_archetype": insights["primary_archetype"],
        "archetype_count": insights["archetype_count"],
        "all_detected": insights["all_detected"],
        "archetype_spans": insights["spans"],
        "max_risk_level": insights["max_risk_level"],
        "recommendations": insights["recommendations"],
        "meta_label": insights["label"],
        "confidence": insights["confidence"]
    }

    checks = {
        "CHK-ARCHETYPE-01": {
            "pass": len(insights["archetype_insights"]) > 0,
            "score": min(len(insights["archetype_insights"]) / 3, 1.0)
        }
    }

    return {
        "ok": True,
        "version": f"{AGENT_ID}@{AGENT_VERSION}",
        "emits": emits,
        "checks": checks
    }

# -------------------------- Main --------------------------
if __name__ == "__main__":
    t0 = time.time()
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        res = run(payload)
        res["latency_ms"] = int((time.time() - t0) * 1000)
        res["cost"] = {"usd": 0.005}
        print(json.dumps(res, ensure_ascii=False), flush=True)
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"{AGENT_ID} error: {e}"}))
        sys.exit(1)
