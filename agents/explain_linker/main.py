#!/usr/bin/env python3
"""
F3 explain_linker – span-kedja för Diamond/Silver/Gold
- phrase-first (före lexikon)
- smart sentence expand (., !, ?, radbryt, citation, semikolon)
- merge overlaps (gap + IoU per flagg)
- cross-flag NMS (greedy)
- remap (hook via meta.norm_map)
- prioritera efter flagg-prio, längd, confidence
- whitelist/blacklist + språk-gate
"""
import sys, json, time, re
from typing import List, Dict, Any, Tuple

AGENT_VERSION = "2.3.0"
AGENT_ID = "explain_linker"

# -------------------- Tweakbara parametrar --------------------
CFG = {
    "iou_thr_same_flag": 0.50,   # IoU för merge inom samma flagg (matchar evaluator)
    "iou_thr_cross_nms": 0.80,   # NMS-tröskel över flaggar
    "gap_join": 2,               # tecken att tillåta mellan spans vid merge
    "min_span_len": 5,           # kasta superkorta spans
    "max_spans": 8,              # hårt tak för hur många spans vi returnerar
    "score_len_pow": 0.35,       # längdvikt i score
    "score_conf_pow": 0.45,      # confidencevikt i score
    "score_prio_pow": 0.20,      # prioritetvikt i score
    "noise_cues": {"alltid","du är","köp","response"},  # brusord
    "allow_empty": True,         # om inga spans -> returnera tomt OK
    "default_lang": "sv",
}

# Flagg-prioritet (lägre index = högre prio)
FLAG_PRIORITY = [
    "threats_intimidation","hot","gaslighting","economic_control","ekonomisk_kontroll","bodily_autonomy",
    "kontroll","control","values_misalignment","anknytning_krock",
    "stonewalling","kritik","criticism","försvar","defensiveness",
    "gränssättning","boundary_setting","validering","validation",
    "ritual","mått","kommunikationsplan","communication_plan",
]

# Språk-gate
SV_FLAGS = {
    "kritik","försvar","hot","sarkasm","validering","gränssättning",
    "anknytning_krock","ekonomisk_kontroll","trauma_trigger",
    "trygghetsbegäran","kommunikationsplan","ritual","mått",
    "cykel","distansering","meta_repair","ansvar","trygg_paus",
    "föräldrastil","values_misalignment","gaslighting","kodväxling",
    "conditional_affection"
}
EN_FLAGS = {
    "criticism","defensiveness","threat","sarcasm","validation",
    "boundary_setting","attachment_mismatch","economic_control",
    "trauma_trigger","safety_request","communication_plan","ritual",
    "metric","cycle","distancing","meta_repair","accountability",
    "parenting_style","values_misalignment","gaslighting","code_switching",
    "conditional_affection"
}

# Valfri explicit whitelist/blacklist (lämna tomma om ej behövs)
WHITELIST: set = set()
BLACKLIST: set = set()

# -------------------- Hjälpfunktioner --------------------
SENT_SEP = r"[\.!\?\u203D\u2047\u2048\u2049]"  # ., !, ?, interrobang etc.
QUOTE_CHARS = "“”«»\"'’‚„"
SPLIT_RE = re.compile(rf"(?<={SENT_SEP})\s+|\n+")

def clamp(v, lo, hi): return max(lo, min(hi, v))

def iou(a:Tuple[int,int], b:Tuple[int,int])->float:
    a1,a2 = a; b1,b2 = b
    inter = max(0, min(a2,b2) - max(a1,b1))
    union = (a2-a1) + (b2-b1) - inter
    return inter/union if union>0 else 0.0

def find_sentence_bounds(text:str, start:int, end:int)->Tuple[int,int]:
    n = len(text)
    # vänster: gå bakåt till närmaste separator/ny rad
    l = start
    while l>0 and not re.match(SENT_SEP, text[l-1]) and text[l-1] not in "\n":
        l -= 1
    # höger: gå framåt till nästa separator/ny rad
    r = end
    while r<n and not re.match(SENT_SEP, text[r]) and text[r] not in "\n":
        r += 1
    if r < n: r += 1  # ta med separator
    # inkludera omgivande citattecken
    while l>0 and text[l-1] in QUOTE_CHARS: l -= 1
    while r<n and text[r:r+1] in QUOTE_CHARS: r += 1
    return clamp(l,0,n), clamp(r,0,n)

def merge_overlaps(spans:List[Dict[str,Any]])->List[Dict[str,Any]]:
    """Merge inom *samma flagg* med gap + IoU."""
    spans = sorted(spans, key=lambda s: (s["flag"], s["start"], s["end"]))
    out=[]
    for s in spans:
        if not out: out.append(s); continue
        last = out[-1]
        if s["flag"]==last["flag"]:
            # gap-join
            if s["start"] <= last["end"] + CFG["gap_join"]:
                # slå ihop om också någorlunda överlapp
                if iou((s["start"], s["end"]), (last["start"], last["end"])) >= CFG["iou_thr_same_flag"] or s["start"]<=last["end"]+CFG["gap_join"]:
                    last["end"] = max(last["end"], s["end"])
                    last["confidence"] = max(last.get("confidence",0), s.get("confidence",0))
                    continue
        out.append(s)
    return out

def prefer_phrase(rationals:List[Dict[str,Any]])->List[Dict[str,Any]]:
    """Behåll max en rationale per (flag, grov mening) – välj :PHRASE före LEXICON."""
    by_key={}
    for r in rationals:
        flag = r.get("flag")
        if not flag: continue
        span = r.get("span_src") or r.get("span")
        if not span or len(span)!=2: continue
        s,e = int(span[0]), int(span[1])
        bucket = (flag, s//100)  # grov bucketing
        prev = by_key.get(bucket)
        cur_is_phrase = ":PHRASE" in (r.get("rule_id","") or "")
        if prev is None:
            by_key[bucket]=r
        else:
            prev_is_phrase = ":PHRASE" in (prev.get("rule_id","") or "")
            if cur_is_phrase and not prev_is_phrase:
                by_key[bucket]=r
            elif cur_is_phrase==prev_is_phrase:
                # välj högre confidence eller längre span
                if r.get("confidence",0) > prev.get("confidence",0) or ((e-s) > ((prev.get('span_src') or prev.get('span'))[1]- (prev.get('span_src') or prev.get('span'))[0])):
                    by_key[bucket]=r
    return list(by_key.values())

def lang_gate(flag:str, lang:str)->bool:
    if flag in BLACKLIST: return False
    if WHITELIST and flag not in WHITELIST: return False
    if lang.startswith("sv"):
        return flag in SV_FLAGS or flag in {"values_misalignment","gaslighting","ritual","metric","economic_control"}
    if lang.startswith("en"):
        return flag in EN_FLAGS or flag in {"kritik","försvar","ekonomisk_kontroll"}
    return True

def is_noisy_short(cue:str, start:int, end:int)->bool:
    if (end-start) < CFG["min_span_len"]:
        norm = (cue or "").lower().strip()
        return any(norm == k or norm.startswith(k) for k in CFG["noise_cues"])
    return False

def remap_span(start:int, end:int, ctx:Dict[str,Any])->Tuple[int,int]:
    """
    Hook: remappa index om normalize-agenten förskjutit.
    Stödjer meta.norm_map = {"offset": +int} eller {"map":[[srcStart,srcEnd,dstStart,dstEnd],...]}
    """
    norm = (ctx.get("meta") or {}).get("norm_map") or {}
    if "offset" in norm:
        off = int(norm["offset"])
        return start+off, end+off
    # enkel segment-karta
    mapping = norm.get("map")
    if isinstance(mapping, list):
        for s1,e1,s2,e2 in mapping:
            if start>=s1 and end<=e1:
                # proportionellt till segmentet
                ratio_s = (start - s1)/max(1,(e1-s1))
                ratio_e = (end   - s1)/max(1,(e1-s1))
                ns = int(s2 + ratio_s*(e2-s2))
                ne = int(s2 + ratio_e*(e2-s2))
                return ns, ne
    return start, end

def span_score(s:Dict[str,Any])->float:
    """Sammanvägd score för selektion: längd + confidence + prio."""
    L = max(1, s["end"]-s["start"])
    conf = float(s.get("confidence", 0.9))
    prio_rank = FLAG_PRIORITY.index(s["flag"]) if s["flag"] in FLAG_PRIORITY else len(FLAG_PRIORITY)+1
    prio = 1.0 / (1.0 + prio_rank)  # högre prio -> större värde
    return (L**CFG["score_len_pow"]) * (conf**CFG["score_conf_pow"]) * (prio**CFG["score_prio_pow"])

# -------------------- Huvudkörning --------------------
def run(payload:Dict[str,Any])->Dict[str,Any]:
    t0 = time.time()
    ctx = payload or {}
    data = ctx.get("data", {}) or {}
    text = data.get("text", "") or ""
    lang = (ctx.get("meta", {}) or {}).get("lang", CFG["default_lang"])
    agent_results = (ctx.get("meta", {}) or {}).get("agent_results", {}) or {}
    debug = bool((ctx.get("meta", {}) or {}).get("debug", False))

    # 1) samla rationales
    rationales=[]
    for name,res in agent_results.items():
        emits = res.get("emits", {}) or {}
        if "rationales" in emits: rationales.extend(emits["rationales"])
        if "rationales" in res:   rationales.extend(res["rationales"])

    # 2) phrase-first + språkgate + brus
    filtered=[]
    for r in prefer_phrase(rationales):
        flag = r.get("flag","")
        if not flag: continue
        if not lang_gate(flag, lang): continue
        span = r.get("span_src") or r.get("span")
        if not span or len(span)!=2: continue
        s,e = int(span[0]), int(span[1])
        cue = (r.get("cue") or r.get("text") or "").strip()
        if is_noisy_short(cue, s, e): continue
        # expandera till mening
        es, ee = find_sentence_bounds(text, s, e)
        # remap
        rs, re = remap_span(es, ee, ctx)
        if (re-rs) < CFG["min_span_len"]: continue
        filtered.append({
            "flag": flag,
            "start": rs,
            "end": re,
            "rule_id": r.get("rule_id",""),
            "confidence": float(r.get("confidence", 0.9)),
            "cue": cue
        })

    if not filtered:
        if CFG["allow_empty"]:
            return {
                "ok": True,
                "version": f"{AGENT_ID}@{AGENT_VERSION}",
                "latency_ms": int((time.time()-t0)*1000),
                "cost": {"usd": 0.008},
                "emits": {"explain_spans": [], "rationales": [] if not debug else []},
                "checks": {"CHK-EXPLAIN-01": {"pass": True, "score": 0.0}}
            }
        # annars: tomt men fail
        return {"ok": False, "error": "No spans after filtering"}

    # 3) merge inom samma flagg
    merged = merge_overlaps(filtered)

    # 4) sortera på score (prio + längd + confidence)
    merged.sort(key=lambda s: span_score(s), reverse=True)

    # 5) greedy NMS över flaggar
    selected=[]
    for s in merged:
        keep=True
        for t in selected:
            if iou((s["start"], s["end"]), (t["start"], t["end"])) >= CFG["iou_thr_cross_nms"]:
                keep=False; break
        if keep:
            selected.append(s)
        if len(selected) >= CFG["max_spans"]:
            break

    # 6) bygg emits
    explain_spans=[]
    for s in selected:
        explain_spans.append({
            "flag": s["flag"],
            "start": s["start"],
            "end": s["end"],
            "span_src": [s["start"], s["end"]],
            "cue": s.get("cue",""),
            "rule_id": s.get("rule_id",""),
            "confidence": round(float(s.get("confidence",0.9)), 3),
            "score": round(span_score(s), 4)
        })

    emits = {
        "explain_spans": explain_spans,
    }
    if debug:
        emits["debug"] = {
            "filtered": filtered,
            "merged": merged[:16],
            "selected": selected
        }

    checks = {
        "CHK-EXPLAIN-01": {"pass": True, "score": min(1.0, len(explain_spans)/3.0)}
    }

    return {
        "ok": True,
        "version": f"{AGENT_ID}@{AGENT_VERSION}",
        "latency_ms": int((time.time()-t0)*1000),
        "cost": {"usd": 0.008},
        "emits": emits,
        "checks": checks
    }

# -------------------- Main --------------------
if __name__ == "__main__":
    payload = json.loads(sys.stdin.read())
    try:
        res = run(payload)
        print(json.dumps(res, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)
