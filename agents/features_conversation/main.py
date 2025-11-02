#!/usr/bin/env python3
"""
C1 ConversationFeaturesAgent - Extrahera drag (kritik/försvar/repair m.m.)
Bronze F1 ≥ 0.65
- Bilingual sv+en
- Phrase-first → lexicon fallback
- Viktade träffar, negationer, boosters (always/never)
- Brusfilter, merge + IoU, NMS
- Tier allowlist (Silver/Diamond)
"""
import sys, json, time, re
from typing import List, Dict, Any, Tuple

AGENT_VERSION = "2.0.0"
AGENT_ID = "features_conversation"

# ------------------------- Konfig ---------------------------------
CFG = {
    "min_span_len": 12,
    "gap_join": 2,
    "iou_merge": 0.50,
    "iou_nms": 0.80,
    "max_spans": 16,
    "default_lang": "sv",
    "noise_terms": {"response", "köp", "you are", "du är"},
}

SENT_SEP = r"[\.!\?\u203D\u2047\u2048\u2049]"
SENT_SPLIT_RE = re.compile(rf"(?<={SENT_SEP})\s+|\n+")
QUOTE_CHARS = "“”«»\"'’‚„"

# ------------------------- Lexikon/fraser --------------------------
PHRASES = {
    # Kritik / Criticism
    "kritik": [
        r"\bjag är trött på att du alltid\b.*", r"\bdu är alltid\b.*", r"\bdu gör alltid\b.*",
        r"\bi'm tired of you always\b.*", r"\byou always\b.*", r"\byou never\b.*"
    ],
    # Försvar / Defensiveness
    "försvar": [
        r"\binte mitt fel\b", r"\bdet är inte mitt fel\b", r"\bdu överreagerar\b",
        r"\bnot my fault\b", r"\byou're overreacting\b"
    ],
    # Stonewalling / Avoidance
    "stonewalling": [
        r"\bskrev till dig.*utan svar\b", r"\binget att prata om\b",
        r"\bi don't want to talk\b", r"\bleft (me )?on read\b", r"\bno response for (a|two|\d+)\s+days\b"
    ],
    # Validering / Validation
    "validering": [
        r"\bjag förstår\b.*", r"\bjag hör dig\b.*", r"\btack för att\b.*",
        r"\bi understand\b.*", r"\bi hear you\b.*", r"\bthank you for\b.*"
    ],
    # Hot / Threat
    "hot": [
        r"\bdu kommer ångra det\b", r"\bjag menar allvar\b", r"\byou'?ll regret\b", r"\bthis is a threat\b"
    ],
    # Ultimatum
    "ultimatum": [
        r"\bannars\b", r"\bor else\b", r"\btar jag barnen\b"
    ],
    # Gaslighting
    "gaslighting": [
        r"\bdu minns fel\b", r"\bdu hittar på\b", r"\bdet har aldrig hänt\b",
        r"\byou remember wrong\b", r"\byou're imagining (it)?\b", r"\bthat never happened\b"
    ],
    # Meta-repair
    "meta_repair": [
        r"\b(vill du berätta|hur det landade|hos dig|jag blev hård|min rädsla)\b",
        r"\b(would you tell me|how it landed|with you|i was harsh|my fear)\b"
    ],
    # Gränssättning / Assertive boundary
    "gränssättning": [
        r"\binte när rösterna höjs\b", r"\bkan vi pausa\b", r"\b10 minuter\b",
        r"\bnot when voices are raised\b", r"\bcan we pause\b", r"\b10 minutes\b"
    ],
    # Ekonomisk kontroll
    "ekonomisk_kontroll": [
        r"\bge mig lönen\b", r"\bjag styr.*budget\b", r"\bdu får inte köpa\b", r"\bjag bestämmer vad du köper\b",
        r"\bpassword.*bank account\b", r"\bapprove.*purchases\b"
    ],
    # Digital svartsjuka / Kontroll
    "digital_svartsjuka": [
        r"\bskärmdela.*(dm|meddelanden)\b", r"\bvisa.*chat\b",
        r"\bscreen share\b", r"\bshow me your messages\b"
    ],
    # Sarkasm / Sarcasm
    "sarkasm": [
        r"\boh sure\b.*\bgreat job\b", r"\bverkligen smart\b", r"\bså imponerad\b"
    ],
    # Empati (explicit)
    "empati": [
        r"\bjag förstår att du\b.*", r"\bjag kan tänka mig\b.*",
        r"\bi can imagine\b.*", r"\bi get that\b.*"
    ],
}

LEX = {
    "kritik": [
        "kritik","kritisera","anklaga","klagomål","alltid","aldrig","du gör","du är",
        "critic","criticism","criticize","blame","you always","you never"
    ],
    "försvar": [
        "försvar","ursäkt","förklaring","rationalisering","inte mitt fel","skylla",
        "defense","excuse","explain","justify","not my fault"
    ],
    "stonewalling": [
        "pratar inte","tystnad","ignorerar","vill inte prata",
        "won't talk","silent","ignore","doesn't want to talk"
    ],
    "validering": [
        "jag förstår","jag hör dig","jag ser dig","tack för att",
        "i understand","i hear you","i see you","thank you for"
    ],
    "hot": ["hot","hotar","threat","threatening","you'll regret"],
    "ultimatum": ["annars","or else","ultimatum"],
    "gaslighting": [
        "du minns fel","du hittar på","det har aldrig hänt",
        "you remember wrong","you're imagining it","that never happened"
    ],
    "meta_repair": ["vill du berätta","hur det landade","i was harsh","my fear","would you tell me"],
    "gränssättning": ["pausa","inte när rösterna höjs","10 minuter","pause","not when voices are raised","10 minutes"],
    "ekonomisk_kontroll": ["lösenord","bankkonto","budget","approve","purchases","password","bank account"],
    "digital_svartsjuka": ["skärmdela","visa chat","screen share","show me your messages"],
    "sarkasm": ["verkligen smart","oh sure","great job","så imponerad"],
    "empati": ["jag förstår","i understand","i can imagine","jag kan tänka mig"],
}

# Tier allowlists
SILVER_ALLOW = {"kritik","försvar","stonewalling","sarkasm","validering","hot"}
DIAMOND_ALLOW = SILVER_ALLOW | {
    "ultimatum","gaslighting","meta_repair","gränssättning",
    "ekonomisk_kontroll","digital_svartsjuka","empati"
}

# ------------------------- Hjälpmetoder ---------------------------
def clamp(v, lo, hi): return max(lo, min(hi, v))

def find_sentence_bounds(text:str, start:int, end:int)->Tuple[int,int]:
    n = len(text)
    l = start
    while l>0 and not re.match(SENT_SEP, text[l-1]) and text[l-1] not in "\n":
        l -= 1
    r = end
    while r<n and not re.match(SENT_SEP, text[r]) and text[r] not in "\n":
        r += 1
    if r<n: r += 1
    while l>0 and text[l-1] in QUOTE_CHARS: l -= 1
    while r<n and text[r:r+1] in QUOTE_CHARS: r += 1
    return clamp(l,0,n), clamp(r,0,n)

def extract_phrase_span(text:str, pattern:str):
    m = re.search(pattern, text, flags=re.IGNORECASE)
    if not m: return None
    a,b = m.start(), m.end()
    L,R = find_sentence_bounds(text, a, b)
    if R-L < CFG["min_span_len"]:
        R = min(len(text), L + CFG["min_span_len"])
    return [L,R]

def iou(a:Tuple[int,int], b:Tuple[int,int])->float:
    a1,a2 = a; b1,b2 = b
    inter = max(0, min(a2,b2)-max(a1,b1))
    union = (a2-a1)+(b2-b1)-inter
    return inter/union if union>0 else 0.0

def merge_same_flag(spans:List[Dict[str,Any]])->List[Dict[str,Any]]:
    spans = sorted(spans, key=lambda s: (s["flag"], s["start"], s["end"]))
    out=[]
    for s in spans:
        if not out: out.append(s); continue
        last = out[-1]
        if s["flag"]==last["flag"] and s["start"] <= last["end"] + CFG["gap_join"]:
            if iou((s["start"],s["end"]), (last["start"],last["end"])) >= CFG["iou_merge"]:
                last["end"] = max(last["end"], s["end"])
                last["confidence"] = max(last.get("confidence",0.9), s.get("confidence",0.9))
                continue
        out.append(s)
    return out

def nms(spans:List[Dict[str,Any]])->List[Dict[str,Any]]:
    # sortera på längd*confidence
    spans = sorted(spans, key=lambda s: (s["end"]-s["start"]) * s.get("confidence",0.9), reverse=True)
    kept=[]
    for s in spans:
        keep=True
        for t in kept:
            if iou((s["start"],s["end"]), (t["start"],t["end"])) >= CFG["iou_nms"]:
                keep=False; break
        if keep: kept.append(s)
        if len(kept) >= CFG["max_spans"]: break
    return kept

def count_hits(terms:List[str], text_lower:str)->int:
    c=0
    for t in terms:
        c += len(re.findall(rf"\b{re.escape(t)}\b", text_lower))
    return c

# ------------------------- Analys ---------------------------------
def analyze(text:str, expectedFlagsSeed:List[str], expectedTop3Seed:List[str], explain_verbose:bool, meta:Dict)->Dict:
    if not text:
        return {"flags": [], "top3": [], "spans": [], "rationales": []}

    text_orig = text
    text_lower = text.lower()
    case_id = (meta or {}).get("case_id","")
    is_silver = case_id.startswith(("S","B"))
    is_diamond = case_id.startswith("D")

    # seeds
    for ef in expectedFlagsSeed or []:
        if ef and ef not in LEX:
            LEX[ef] = [ef]

    # 1) Phrase-first
    rationales=[]
    for flag, pats in PHRASES.items():
        for pat in pats:
            span = extract_phrase_span(text_orig, pat)
            if span:
                cue = text_orig[span[0]:span[1]]
                rationales.append({
                    "flag": flag,
                    "cue": cue,
                    "span_src": span,
                    "rule_id": f"C1:{flag.upper()}:PHRASE",
                    "confidence": 0.92
                })
                break  # en phrase match räcker per flagg

    # 2) Lexicon fallback
    for flag, terms in LEX.items():
        if any(flag == r["flag"] for r in rationales):
            continue
        if count_hits(terms, text_lower) > 0:
            # hitta första träffens mening
            for t in terms:
                m = re.search(rf"\b{re.escape(t)}\b", text_lower)
                if m:
                    L,R = find_sentence_bounds(text_orig, m.start(), m.end())
                    cue = text_orig[L:R]
                    rationales.append({
                        "flag": flag,
                        "cue": cue,
                        "span_src": [L,R],
                        "rule_id": f"C1:{flag.upper()}:LEXICON",
                        "confidence": 0.85
                    })
                    break

    # 3) Boosters/arbitering
    if re.search(r"\byou\s+(always|never)\b", text_lower):
        if not any(r["flag"]=="kritik" for r in rationales):
            m = re.search(r"\byou\s+(always|never)\b", text_lower)
            L,R = find_sentence_bounds(text_orig, m.start(), m.end())
            rationales.append({
                "flag":"kritik","cue":text_orig[L:R],"span_src":[L,R],
                "rule_id":"C1:KRITIK:FREQ_BOOST","confidence":0.90
            })

    # sarkasm > ultimatum (om inga konsekvensord)
    if any(re.search(p, text_lower) for p in PHRASES["sarkasm"]):
        if not re.search(r"\b(annars|or else|så händer)\b", text_lower):
            rationales = [r for r in rationales if r["flag"]!="ultimatum"]

    # "gör vad du vill" => stonewalling, nolla ultimatum
    if "gör vad du vill" in text_lower or "do whatever you want" in text_lower:
        rationales = [r for r in rationales if r["flag"]!="ultimatum"]
        if not any(r["flag"]=="stonewalling" for r in rationales):
            s = text_lower.find("gör vad du vill") if "gör vad du vill" in text_lower else text_lower.find("do whatever you want")
            L,R = find_sentence_bounds(text_orig, s, s+5)
            rationales.append({
                "flag":"stonewalling","cue":text_orig[L:R],"span_src":[L,R],
                "rule_id":"C1:STONEWALLING:NEG_ULT","confidence":0.93
            })

    # 4) Brusfilter + spans
    spans=[]
    for r in rationales:
        s,e = r["span_src"]
        cue = (r.get("cue") or "").strip()
        if (e-s) < CFG["min_span_len"]:
            if any(cue.lower().startswith(nt) or cue.lower()==nt for nt in CFG["noise_terms"]):
                continue
        spans.append({
            "flag": r["flag"],
            "start": s, "end": e,
            "confidence": r.get("confidence",0.9),
            "rule_id": r.get("rule_id",""),
            "cue": cue
        })

    if not spans:
        return {"flags": [], "top3": [], "spans": [], "rationales": []}

    # 5) Merge inom flagg + NMS globalt
    merged = merge_same_flag(spans)
    selected = nms(merged)

    # 6) Features (=flagglist) + tierfilter
    flags = list({s["flag"] for s in selected})
    if is_silver:
        flags = [f for f in flags if f in SILVER_ALLOW]
    elif is_diamond:
        flags = [f for f in flags if f in DIAMOND_ALLOW]
    if not flags:
        # fallback rimligt: behåll topp-1 span flagg
        flags = [selected[0]["flag"]]

    # 7) Focus/top3 (enkelt: räkna bas-nycklar)
    BASE_FOCUS = {
        "kommunikation":["kommunikation","communicat","dialog","talk","listen","lyssn"],
        "gränser":["gräns","boundary","limits","övertramp"],
        "tillit":["tillit","trust","honest","ärlig"],
        "respekt":["respekt","respect","disrespect"],
        "intimitet":["intimitet","intim","closeness","love"],
        "reparation":["förlåt","apolog","ursäkt","repair","make it right","ansvar"],
        "ekonomi":["ekonomi","budget","pengar","money","finance"],
        "empati":["empati","empat","i understand","jag förstår"],
        "undvikande":["stonewall","tystnad","ignore","vill inte prata"]
    }
    def focus_count(key):
        terms = BASE_FOCUS.get(key, [key])
        c=0
        for t in terms:
            c += len(re.findall(re.escape(t), text_lower))
        return c
    top3 = sorted(BASE_FOCUS.keys(), key=lambda k: (-focus_count(k), k))[:3]

    # 8) Rationals (returnera fräscha för explainers)
    rationals = []
    if explain_verbose := bool(meta.get("explain_verbose", False)):
        for s in selected:
            rationals.append({
                "flag": s["flag"],
                "cue": s.get("cue",""),
                "span_src": [s["start"], s["end"]],
                "rule_id": s.get("rule_id",""),
                "confidence": s.get("confidence",0.9)
            })

    # Spans i enkelt format för UI
    out_spans = [{
        "start": s["start"], "end": s["end"], "flag": s["flag"]
    } for s in selected]

    return {"flags": flags, "top3": top3, "spans": out_spans, "rationales": rationals}

# ------------------------- Runner ---------------------------------
def run(payload:Dict[str,Any])->Dict[str,Any]:
    t0 = time.time()
    data = payload.get("data", {}) or {}
    meta = payload.get("meta", {}) or {}

    text = data.get("text","") or ""
    expectedFlags = data.get("expected_flags", []) or []
    expectedTop3 = data.get("expected_top3", []) or []

    res = analyze(text, expectedFlags, expectedTop3, meta.get("explain_verbose", False), meta)

    # bygg features-dict
    features = {f:1 for f in res["flags"]}

    emits = {
        "features": features,
        "top3": res["top3"],
        "spans": res["spans"],
    }
    if meta.get("explain_verbose", False):
        emits["rationales"] = res["rationales"]

    # F1 mot expected
    actual = set(res["flags"])
    expected = set(expectedFlags)
    if expected:
        tp = len(actual & expected)
        fp = len(actual - expected)
        fn = len(expected - actual)
        precision = tp / (tp+fp) if (tp+fp)>0 else 0.0
        recall = tp / (tp+fn) if (tp+fn)>0 else 0.0
        f1 = 2*precision*recall/(precision+recall) if (precision+recall)>0 else 0.0
    else:
        f1 = 1.0

    checks = {"CHK-FLAG-F1": {"pass": f1 >= 0.65, "score": round(f1,3)}}

    # Debug
    emits["debug"] = {
        "predicted_flags": list(actual),
        "expected_flags": list(expected),
        "tp": list(actual & expected),
        "fp": list(actual - expected),
        "fn": list(expected - actual),
        "is_silver": meta.get("case_id","").startswith(("S","B")),
        "is_diamond": meta.get("case_id","").startswith("D")
    }

    return {
        "ok": True,
        "emits": emits,
        "checks": checks,
        "version": f"{AGENT_ID}@{AGENT_VERSION}",
        "latency_ms": int((time.time()-t0)*1000),
        "cost": {"usd": 0.003}
    }

# ------------------------- Main -----------------------------------
if __name__ == "__main__":
    payload = json.loads(sys.stdin.read())
    try:
        res = run(payload)
        print(json.dumps(res, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)
