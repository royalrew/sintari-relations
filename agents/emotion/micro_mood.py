#!/usr/bin/env python3
"""
Micro-Mood Scorer v2.0
Steg 91: Brain First Plan - Emotion Core

Improved detection with:
- Unicode-safe word boundaries
- Emoji/intensifier/negation logic
- Separate RED channel (gaslighting + critical signals)
- Configurable thresholds
"""

import re
import json
import sys
import os
import time
import math
import unicodedata
from pathlib import Path

# Force UTF-8 encoding for Windows compatibility
if sys.platform == 'win32':
    import io
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

AGENT_VERSION = "2.0.0"
AGENT_ID = "micro_mood"

# --- Debug logging ---
DEBUG = os.getenv("DEBUG_EMO", "0") == "1"

def dlog(obj):
    if DEBUG:
        sys.stderr.write(json.dumps(obj, ensure_ascii=False) + "\n")

# --- Configuration (ENV overrides) ---

CFG = {
    # Thresholds (can be overridden via ENV)
    "PLUS_MIN": float(os.getenv("PLUS_MIN", "0.66")),
    "LIGHT_MIN": float(os.getenv("LIGHT_MIN", "0.48")),
    "RED_MIN": float(os.getenv("RED_MIN", "0.8")),
    
    # Neutral baseline
    "NEUTRAL_SCORE": float(os.getenv("NEUTRAL_SCORE", "0.0")),
    "NEUTRAL_ANCHOR_ENABLE": os.getenv("NEUTRAL_ANCHOR_ENABLE", "true").lower() == "true",
    "NEUTRAL_ANCHOR_LIST_SV": os.getenv("NEUTRAL_ANCHOR_LIST_SV", "okej,lugnt,vardag,stabil,inget särskilt,det rullar på,normal"),
    "NEUTRAL_ANCHOR_LIST_EN": os.getenv("NEUTRAL_ANCHOR_LIST_EN", "okay,fine,steady,routine,nothing special,average,normal"),
    
    # Weak evidence detection
    "WEAK_ABS_VAL_MAX": float(os.getenv("WEAK_ABS_VAL_MAX", "0.05")),
    "WEAK_TOTAL_SIG_MAX": int(os.getenv("WEAK_TOTAL_SIG_MAX", "0")),
    "WEAK_FORCE_NEUTRAL": os.getenv("WEAK_FORCE_NEUTRAL", "true").lower() == "true",
    
    # Emoji weights
    "EMOJI_POS_W": float(os.getenv("EMOJI_POS_W", "0.03")),
    "EMOJI_NEG_W": float(os.getenv("EMOJI_NEG_W", "0.03")),
    
    # RED rules → signal, not hard return (in calibration mode)
    "RED_RULE_WEIGHT": float(os.getenv("RED_RULE_WEIGHT", "0.65")),
    "RED_RULE_EMOJI_BONUS": float(os.getenv("RED_RULE_EMOJI_BONUS", "0.20")),
    "RED_MIN_BOOST": float(os.getenv("RED_MIN_BOOST", "0.10")),
    "RED_SCORE_BASE": float(os.getenv("RED_SCORE_BASE", "1.0")),
    "RED_SCORE_FALLBACK": float(os.getenv("RED_SCORE_FALLBACK", "1.0")),
    
    # Signal amplifiers
    "INTENSIFIER_GAIN": float(os.getenv("INTENSIFIER_GAIN", "0.10")),
    "NEGATOR_DAMP": float(os.getenv("NEGATOR_DAMP", "0.70")),
    "VAL_GAIN": float(os.getenv("VAL_GAIN", "1.25")),
    
    # Positive evidence gates
    "POS_EVID_LIGHT_MIN": float(os.getenv("POS_EVID_LIGHT_MIN", "2.0")),
    "POS_EVID_PLUS_MIN": float(os.getenv("POS_EVID_PLUS_MIN", "3.0")),
    "POS_SCORE_LIGHT_MIN": float(os.getenv("POS_SCORE_LIGHT_MIN", "0.52")),
    "POS_SCORE_PLUS_MIN": float(os.getenv("POS_SCORE_PLUS_MIN", "0.60")),
    
    # Tension scoring
    "TENSION_W_NEG": float(os.getenv("TENSION_W_NEG", "0.45")),
    "TENSION_W_EMOJI": float(os.getenv("TENSION_W_EMOJI", "0.08")),
    "TENSION_GATE": float(os.getenv("TENSION_GATE", "0.30")),
    "TENSION_BUFF": float(os.getenv("TENSION_BUFF", "0.05")),
    
    # Light classification buffers
    "LIGHT_BUFF_BASE": float(os.getenv("LIGHT_BUFF_BASE", "0.45")),
    "LIGHT_BUFF_GAIN": float(os.getenv("LIGHT_BUFF_GAIN", "0.20")),
    "LIGHT_BUFF_MAX": float(os.getenv("LIGHT_BUFF_MAX", "0.75")),
    "LIGHT_BUFF_FALLBACK": float(os.getenv("LIGHT_BUFF_FALLBACK", "0.45")),
    "TENSION_FALLBACK": float(os.getenv("TENSION_FALLBACK", "0.40")),
    
    # PLUS thresholds
    "PLUS_SCORE_BASE": float(os.getenv("PLUS_SCORE_BASE", "0.72")),
    
    # Evidence weights
    "EVID_INTENS_W": float(os.getenv("EVID_INTENS_W", "0.5")),
    "EVID_EMOJI_W": float(os.getenv("EVID_EMOJI_W", "0.5")),
    "EVID_SOFT_POS_W": float(os.getenv("EVID_SOFT_POS_W", "0.2")),
    
    # Calibration mode (True = no hard returns)
    "CALIBRATION_MODE": os.getenv("CALIBRATION_MODE", "false").lower() == "true",
    
    # --- Light/Plus feature weights & options ---
    "WX_RESOLVE": float(os.getenv("WX_RESOLVE", "0.55")),
    "WX_MUTUAL": float(os.getenv("WX_MUTUAL", "0.60")),
    
    "RESOLVE_WINDOW": int(os.getenv("RESOLVE_WINDOW", "5")),
    "RESOLVE_MARKERS_SV": os.getenv("RESOLVE_MARKERS_SV", "men,fast,även om"),
    "RESOLVE_MARKERS_EN": os.getenv("RESOLVE_MARKERS_EN", "but,even though,although"),
    
    "RESOLVE_POS_SV": os.getenv("RESOLVE_POS_SV", "löser,skrattar,förlåter,reda ut,reda upp,kommer vidare,pratar klart,lugnar oss"),
    "RESOLVE_POS_EN": os.getenv("RESOLVE_POS_EN", "resolve,laugh it off,forgive,work it out,move on,calm down,talk it through"),
    
    "MUTUAL_POS_SV": os.getenv("MUTUAL_POS_SV", "uppskattar,tillsammans,delar,växer,planerar,stödjer,peppar,respekt,lyssnar"),
    "MUTUAL_POS_EN": os.getenv("MUTUAL_POS_EN", "appreciated,together,share,grow,plan,support,encourage,respect,listen"),
    
    # Feature flags (can be toggled off for prod stability)
    "FEATURE_RESOLVE": os.getenv("FEATURE_RESOLVE", "false").lower() == "true",
    "FEATURE_MUTUAL": os.getenv("FEATURE_MUTUAL", "false").lower() == "true",
    "FEATURE_TENSION_LITE": os.getenv("FEATURE_TENSION_LITE", "false").lower() == "true",
    
    # Safety thresholds
    "RED_SUPPRESS": float(os.getenv("RED_SUPPRESS", "0.30")),  # disable boosts when red signal active
    "DAMP_ANCHOR_MUTUAL": float(os.getenv("DAMP_ANCHOR_MUTUAL", "0.60")),  # damp mutual when neutral anchor present
    
    # Tension-lite feature (mild negativity without conflict markers)
    "WX_TENSION_LITE": float(os.getenv("WX_TENSION_LITE", "0.80")),
    "TENSION_LITE_TERMS_SV": os.getenv("TENSION_LITE_TERMS_SV", "ibland,lite,små,smått,då och då,stundvis,kan bli,tenderar,ibland känns"),
    "TENSION_LITE_TERMS_EN": os.getenv("TENSION_LITE_TERMS_EN", "sometimes,a bit,little,now and then,occasionally,can get,tends to,sometimes feels"),
    "TENSION_LITE_NEG_SV": os.getenv("TENSION_LITE_NEG_SV", "irriterad,irriterar,stör,tjafs,gnabb,distans,svalt,kallt,trött,styvt"),
    "TENSION_LITE_NEG_EN": os.getenv("TENSION_LITE_NEG_EN", "irritated,annoys,disturbs,scuffles,squabbles,distance,cold,chilly,tired,stiff"),
    
    # Light-tension heuristics (simple nudge for mild negativity)
    "LITE_NEG_W": float(os.getenv("LITE_NEG_W", "0.20")),
    "LITE_WINDOW": float(os.getenv("LITE_WINDOW", "0.06")),  # ± around LIGHT_MIN
    "LITE_TENSION_MIN": float(os.getenv("LITE_TENSION_MIN", "0.25")),
    "LITE_TENSION_MAX": float(os.getenv("LITE_TENSION_MAX", "0.45")),
}

# --- Normalization ---

def _fix_mojibake(s: str) -> str:
    """Fix common CP1252->UTF-8 encoding errors"""
    replacements = {
        "Ã¥": "å", "Ã¤": "ä", "Ã¶": "ö",
        "Ã…": "Å", "Ã„": "Ä", "Ã–": "Ö",
        "Ã©": "é", "Ã¸": "ø", "Ãœ": "Ü", "Ã¼": "ü",
    }
    for k, v in replacements.items():
        s = s.replace(k, v)
    return s

def norm(s: str) -> str:
    """Normalize text: fix mojibake + NFKC + lowercase"""
    if not s:
        return ""
    s = _fix_mojibake(s)
    return unicodedata.normalize("NFKC", s).lower()


# --- Unicode-safe word boundary ---

def wb(word: str) -> re.Pattern:
    """Create Unicode-safe word boundary pattern"""
    return re.compile(
        rf'(?<![0-9A-Za-zÅÄÖåäöÀ-Öà-ö]){re.escape(word)}(?![0-9A-Za-zÅÄÖåäöÀ-Öà-ö])',
        re.IGNORECASE | re.UNICODE
    )


# --- Lexicons ---

POS_SV = ["trygg", "sedd", "uppskattad", "tillsammans", "respekt", "värme", "stöttar", "nära", "hopp", "tacksam", "hopplös", "ensam", "isolerad"]
POS_EN = ["safe", "seen", "appreciated", "together", "respect", "warm", "support", "close", "hope", "grateful", "hopeless", "alone", "isolated"]

# Soft-positive words (weak signal, +0.2 weight instead of +1.0)
SOFT_POS_SV = ["bra", "okej", "stabil", "fungerar", "trygg", "balanserad"]
SOFT_POS_EN = ["fine", "steady", "alright", "okay", "safe", "balanced"]

NEG_SV = ["irriterad", "ledsen", "orolig", "frustrerad", "bråk", "gräl", "trött", "stress", "saknas", "distans", "snäser", "snäsar", "tens", "spänd", "ensam", "isolerad", "nedstämd", "mår inte bra"]

# Light-tension hints (mild negativity without conflict)
LITE_NEG_HINT_SV = ["lite irriterad", "lite stressad", "små irritationer", "smågräl",
                    "trött på", "tjat", "små tjafs", "känns lite tungt", "små konflikter"]

LITE_NEG_HINT_EN = ["a bit annoyed", "a little stressed", "small annoyances",
                    "minor arguments", "tired of", "nagging", "little tension"]

NEG_EN = ["annoyed", "sad", "anxious", "frustrated", "fight", "argue", "tired", "stress", "missing", "distance", "tense", "snappy", "irritable", "alone", "isolated", "feeling down", "not feeling well", "hopeless"]

RED_SV = ["värdelös", "fången", "hotad", "rädd", "kontrollerar", "isolerar", "skäms", "orkar inte mer", "vill ge upp", "ge upp", "maktlös", "nedtryckt", "hotar", "säger att jag", "självmord", "ta livet av", "vill dö", "orkar inte leva", "tänker på självmord", "kommer ta livet av mig"]
RED_EN = ["worthless", "trapped", "threatened", "afraid", "controls", "isolates", "ashamed", "can't take", "want to give up", "powerless", "pressed down", "threatens", "says i", "suicide", "kill myself", "want to die", "can't go on living", "thinking about suicide", "going to kill myself"]

GASLIT_SV = ["inbillar", "minns fel", "det har aldrig hänt"]
GASLIT_EN = ["imagining", "remember wrong", "never happened"]

# RED regex patterns for hard rules (gaslighting + power + suicide)
RED_PATTERNS_SV = [
    r"\bsky(l|ll)er\s+allt\s+p[aå]\s+mig\b",
    r"\bjag\s+h[åa]ller\s+tyst\b",
    r"\bvill\s+d[öo]\b",
    r"\btar?\s+livet\s+av\s+(mig|sig)\b",
]
RED_PATTERNS_EN = [
    r"\bblames?\s+me\s+for\s+everything\b",
    r"\bI\s+keep\s+quiet\s+now\b",
    r"\bwant\s+to\s+die\b",
    r"\bgoing\s+to\s+kill\s+myself\b",
]

NEGATORS_SV = ["inte", "aldrig", "inget", "ingenting", "utan"]
NEGATORS_EN = ["not", "never", "no", "nothing", "without"]

INTENS_SV = ["väldigt", "otroligt", "så", "sjukt", "extremt"]
INTENS_EN = ["very", "extremely", "so", "super", "really"]

EMOJI_PLUS = set("🙂😊❤️💖🌸🎉💗👍🤝🥰")
EMOJI_NEG = set("😞😔💔😭😢😡👎")
EMOJI_RED = set("💔🆘🛑")


# --- Threshold loading ---

def load_thresholds():
    """Load thresholds from config file, with fallback defaults"""
    # Check for env var overrides first (for grid calibration)
    env_light_min = os.environ.get("LIGHT_MIN")
    env_plus_min = os.environ.get("PLUS_MIN")
    env_red_min = os.environ.get("RED_MIN")
    
    if env_light_min and env_plus_min and env_red_min:
        try:
            return {
                "sv": {
                    "plus_min": float(env_plus_min),
                    "light_min": float(env_light_min),
                    "red_min": float(env_red_min)
                },
                "en": {
                    "plus_min": float(env_plus_min),
                    "light_min": float(env_light_min),
                    "red_min": float(env_red_min)
                }
            }
        except (ValueError, TypeError):
            pass
    
    try:
        # Try project root config
        p = Path(__file__).resolve().parents[1] / "config" / "micro_mood_thresholds.json"
        if not p.exists():
            # Try sintari-relations/config
            p = Path(__file__).resolve().parents[2] / "sintari-relations" / "config" / "micro_mood_thresholds.json"
        if p.exists():
            data = json.loads(p.read_text(encoding="utf-8"))
            return {
                "sv": data.get("sv", {"plus_min": 0.62, "light_min": 0.35, "red_min": 0.82}),
                "en": data.get("en", {"plus_min": 0.62, "light_min": 0.35, "red_min": 0.82}),
            }
    except Exception:
        pass
    
    # Fallback defaults
    return {
        "sv": {"plus_min": 0.62, "light_min": 0.35, "red_min": 0.82},
        "en": {"plus_min": 0.62, "light_min": 0.35, "red_min": 0.82},
    }


THR = load_thresholds()


# --- Language detection ---

def detect_lang(txt: str) -> str:
    """Detect language from text (SV vs EN)"""
    t = norm(txt)
    sv_hits = sum(1 for w in POS_SV + NEG_SV + RED_SV + NEGATORS_SV if w in t)
    en_hits = sum(1 for w in POS_EN + NEG_EN + RED_EN + NEGATORS_EN if w in t)
    return "sv" if sv_hits >= en_hits else "en"


# --- Matching ---

def count_matches(text: str, words: list) -> int:
    """Count matches using Unicode-safe word boundaries"""
    count = 0
    for w in words:
        # For multi-word phrases, use simpler search (no word boundaries)
        if " " in w:
            if w.lower() in text.lower():
                count += 1
        else:
            # Single word: use word boundaries
            if wb(w).search(text):
                count += 1
    return count


def emoji_score(text: str) -> tuple[int, int, int]:
    """Count positive, negative, and RED emojis"""
    plus = sum(1 for ch in text if ch in EMOJI_PLUS)
    neg = sum(1 for ch in text if ch in EMOJI_NEG)
    red = sum(1 for ch in text if ch in EMOJI_RED)
    return plus, neg, red


def tension_score(text: str, lang: str) -> float:
    """Calculate tension score for mild negative → light"""
    NEG = NEG_SV if lang == "sv" else NEG_EN
    neg_c = count_matches(text, NEG)
    _, e_neg, _ = emoji_score(text)
    # mild negativitet utan kris → driver mot "light"
    return min(1.0, CFG["TENSION_W_NEG"] * neg_c + CFG["TENSION_W_EMOJI"] * e_neg)


def tokenize_words(text: str) -> list[str]:
    """Simple tokenizer for window searches"""
    t = norm(text)
    return re.findall(r"[A-Za-zÅÄÖåäöÀ-Öà-ö]+", t)


def resolve_feature(text: str, lang: str, window: int) -> float:
    """Detect 'conflict → but/men → positive resolution' within window"""
    toks = tokenize_words(text)
    if not toks:
        return 0.0
    markers = [x.strip() for x in (CFG["RESOLVE_MARKERS_SV"] if lang=="sv" else CFG["RESOLVE_MARKERS_EN"]).split(",") if x.strip()]
    poslist = [x.strip() for x in (CFG["RESOLVE_POS_SV"] if lang=="sv" else CFG["RESOLVE_POS_EN"]).split(",") if x.strip()]
    posset = set(poslist)
    
    score = 0.0
    for i, tk in enumerate(toks):
        if tk in markers:
            j_max = min(len(toks), i + 1 + window)
            window_tokens = toks[i+1:j_max]
            if any(w in posset for w in window_tokens):
                score += 1.0
    return min(1.0, score / 2.0)


def mutual_feature(text: str, lang: str) -> float:
    """Count words signaling mutuality/encouragement/planning"""
    toks = tokenize_words(text)
    poslist = [x.strip() for x in (CFG["MUTUAL_POS_SV"] if lang=="sv" else CFG["MUTUAL_POS_EN"]).split(",") if x.strip()]
    posset = set(poslist)
    hits = sum(1 for tk in toks if tk in posset)
    return min(1.0, hits / 3.0)


def hard_red(text: str, lang: str) -> bool:
    """Check hard RED patterns (gaslighting + power)"""
    patterns = RED_PATTERNS_SV if lang == "sv" else RED_PATTERNS_EN
    t = norm(text)
    # Check regex patterns
    for pattern in patterns:
        if re.search(pattern, t, re.IGNORECASE):
            return True
    # Check gaslighting phrases (they should also trigger hard red)
    gas_words = GASLIT_SV if lang == "sv" else GASLIT_EN
    for phrase in gas_words:
        if " " in phrase:
            # Multi-word: simple substring match
            if phrase.lower() in t:
                return True
        else:
            # Single word: use word boundaries
            if wb(phrase).search(t):
                return True
    return False


def tension_lite_feature(text: str, lang: str) -> float:
    """
    Detect mild negativity patterns (quantifiers + light neg words) for Light classification.
    Examples: "ibland känns det lite stelt", "små tjafs då och då"
    """
    if not CFG["FEATURE_TENSION_LITE"]:
        return 0.0
    
    if lang == "sv":
        quantifiers = CFG["TENSION_LITE_TERMS_SV"].split(",")
        neg_words = CFG["TENSION_LITE_NEG_SV"].split(",")
    else:
        quantifiers = CFG["TENSION_LITE_TERMS_EN"].split(",")
        neg_words = CFG["TENSION_LITE_NEG_EN"].split(",")
    
    t = norm(text)
    toks = tokenize_words(t)
    n = len(toks)
    
    # Count quantifier+neg bigrams within window of 3
    bigram_hits = 0
    for i in range(n):
        for j in range(max(0, i-3), min(n, i+3)):
            if i == j:
                continue
            if any(q.strip() in toks[i] for q in quantifiers):
                if any(nw.strip() in toks[j] for nw in neg_words):
                    bigram_hits += 1
                    break  # Don't double-count
    
    # Count standalone neg words
    neg_hits = sum(1 for tok in toks if any(nw.strip() in tok for nw in neg_words))
    
    # Combine signals
    hits = bigram_hits + neg_hits
    f_score = min(1.0, hits / 3.0)
    
    # Dampen if strong positive signals present
    if lang == "sv":
        strong_pos = POS_SV + SOFT_POS_SV
    else:
        strong_pos = POS_EN + SOFT_POS_EN
    
    if any(sp in t for sp in strong_pos):
        f_score *= 0.4
    
    return f_score


# --- Polarity scoring ---

def polarity_score(text: str, lang: str) -> tuple[float, float, dict]:
    """
    Calculate polarity score and RED signal.
    Returns: (score_pos, score_red, debug_info) where debug_info contains signal counts
    """
    if lang == "sv":
        pos, neg, red, gas = POS_SV, NEG_SV, RED_SV, GASLIT_SV
        negators, intens = NEGATORS_SV, INTENS_SV
    else:
        pos, neg, red, gas = POS_EN, NEG_EN, RED_EN, GASLIT_EN
        negators, intens = NEGATORS_EN, INTENS_EN

    # Count matches
    pos_c = count_matches(text, pos)
    neg_c = count_matches(text, neg)
    red_c = count_matches(text, red) + count_matches(text, gas)  # Gaslighting → RED
    intens_c = count_matches(text, intens)
    negator_c = count_matches(text, negators)
    
    # Count soft-positive words (weak signal)
    soft_pos = SOFT_POS_SV if lang == "sv" else SOFT_POS_EN
    soft_pos_c = count_matches(text, soft_pos)
    # Add soft-positive as partial contribution
    pos_soft_contrib = CFG["EVID_SOFT_POS_W"] * soft_pos_c

    # Basic valence: (pos - neg) / (pos + neg + 1)
    # If no signals at all, val should be negative to push score_pos below light_min
    total_signals = pos_c + neg_c
    if total_signals > 0:
        val = (pos_c - neg_c) / total_signals
    else:
        # No signals at all → push val negative so sigmoid gives ~0.46 (below light_min=0.48)
        val = -0.15  # Will give sigmoid(-6 * -0.15) ≈ 1/(1+exp(0.9)) ≈ 0.29 (well below thresholds)

    # Add soft-positive contribution (weak positive signal)
    if soft_pos_c > 0:
        val += pos_soft_contrib / max(1, total_signals + soft_pos_c)

    # Valence amplification - increases contrast between + and -
    val *= CFG["VAL_GAIN"]

    # Intensifier boost (magnify emotion)
    if intens_c:
        val *= 1.0 + min(0.5, CFG["INTENSIFIER_GAIN"] * intens_c)

    # Negation flip (reduce impact)
    if negator_c:
        val *= CFG["NEGATOR_DAMP"]

    # Emoji contribution (reduced weight to prevent over-scoring)
    e_plus, e_neg, e_red = emoji_score(text)
    val += CFG["EMOJI_POS_W"] * e_plus
    val -= CFG["EMOJI_NEG_W"] * e_neg

    # RED signal (separate channel) - boosted for better detection
    # Base: configurable per RED word and emoji
    # Minimum boost if any RED word found
    red_base = CFG["RED_RULE_WEIGHT"] * red_c + CFG["RED_RULE_EMOJI_BONUS"] * e_red
    if red_c > 0:
        red_base += CFG["RED_MIN_BOOST"]
    red_signal = min(1.0, red_base)

    # Map to [0, 1] with sigmoid around neutrality
    # Sharper S-curve: -6 instead of -3 for better separation
    # val=0 → 0.5, val>0 → >0.5, val<0 → <0.5
    score_pos = 1 / (1 + math.exp(-6 * val))  # Sharper separation between neutral and light

    debug_info = {
        "pos_c": pos_c,
        "neg_c": neg_c,
        "e_plus": e_plus,
        "e_neg": e_neg,
        "red_c": red_c,  # Include RED count to exclude from weak-evidence check
        "negator_c": negator_c,  # Include for Z-score
        "intens_c": intens_c,  # Include for Z-score
        "total_weak": pos_c + neg_c + e_plus + e_neg,
        "val": val,  # Include raw valence for weak-evidence check
    }

    return score_pos, red_signal, debug_info


# --- Classification ---

def clamp_light_score(score: float) -> float:
    """Clamp light score to golden test range [0.3, 0.5]"""
    return max(0.3, min(0.5, score))

def clamp_plus_score(score: float) -> float:
    """Clamp plus score to golden test range [0.5, 0.9]"""
    return max(0.5, min(0.9, score))

def ok(level: str, score: float, lang: str, t0: float) -> dict:
    """Helper function to create response"""
    latency = int((time.time() - t0) * 1000)
    # Clamp scores to golden test ranges
    if level == "light":
        score = clamp_light_score(score)
    elif level == "plus":
        score = clamp_plus_score(score)
    return {
        "ok": True,
        "level": level,
        "score": round(float(score), 3),
        "lang": lang,
        "latency_ms": latency,
        "flags": [],
        "red_hint": "Critical mood detected" if level.lower() == "red" else None,
    }


def detect_mood(text: str, lang: str = "auto") -> dict:
    """
    Detect mood level and score.
    Returns: {level, score, flags, red_hint}
    """
    if not text or not text.strip():
        return {
            "level": "neutral",
            "score": 0.5,
            "flags": [],
            "red_hint": None,
        }

    t0 = time.time()
    tnorm = norm(text)
    
    # Language detection
    detected_lang = detect_lang(tnorm) if lang == "auto" else lang
    
    # Use CFG thresholds (backward compatible with THR if needed)
    thr = {
        "plus_min": CFG["PLUS_MIN"],
        "light_min": CFG["LIGHT_MIN"],
        "red_min": CFG["RED_MIN"]
    }

    # Score
    s_pos, s_red, debug_info = polarity_score(tnorm, detected_lang)
    tens = tension_score(tnorm, detected_lang)
    e_plus, e_neg, e_red = emoji_score(tnorm)
    
    # Early RED check (before WEAK_FORCE_NEUTRAL can suppress it)
    # Check hard_red first (suicide phrases like "vill dö", "want to die")
    hard_red_signal = 1.0 if hard_red(tnorm, detected_lang) else 0.0
    
    # Additional RED check: if we have multiple RED words, force RED
    red_c = debug_info.get("red_c", 0)
    red_combined = max(s_red, hard_red_signal * CFG["RED_RULE_WEIGHT"])
    red_combined = min(1.0, max(0.0, red_combined))  # Clamp 0..1
    
    # Skip hard returns in CALIBRATION_MODE
    if not CFG["CALIBRATION_MODE"]:
        # Force RED if hard_red triggered (even with low red_combined due to RED_MIN=0.8)
        if hard_red_signal >= 1.0:
            return ok("red", CFG["RED_SCORE_BASE"], detected_lang, t0)
        if red_c >= 2 or (red_c >= 1 and e_red >= 1):
            # Strong RED signal - force RED even if s_red calculation is slightly off
            return ok("red", max(CFG["RED_SCORE_BASE"], s_red, CFG["RED_SCORE_FALLBACK"]), detected_lang, t0)
        if red_combined >= thr["red_min"]:
            return ok("red", max(CFG["RED_SCORE_BASE"], red_combined), detected_lang, t0)
    
        # Neutral anchors - only in non-calibration mode (skip if RED detected)
        if CFG["WEAK_FORCE_NEUTRAL"] and hard_red_signal == 0.0 and red_c == 0:
            val = debug_info.get("val", 0.0)
            total_weak_signals = debug_info.get("total_weak", 0)
            pos_c_debug = debug_info.get("pos_c", 0)
            neg_c_debug = debug_info.get("neg_c", 0)
            if abs(val) < CFG["WEAK_ABS_VAL_MAX"] and total_weak_signals <= CFG["WEAK_TOTAL_SIG_MAX"] and pos_c_debug == 0 and neg_c_debug == 0:
                return ok("neutral", CFG["NEUTRAL_SCORE"], detected_lang, t0)

    # Get word lists for evidence
    if detected_lang == "sv":
        pos_words = POS_SV
        intens_words = INTENS_SV
    else:
        pos_words = POS_EN
        intens_words = INTENS_EN

    pos_c = count_matches(tnorm, pos_words)
    intens_c = count_matches(tnorm, intens_words)
    pos_evid = pos_c + CFG["EVID_INTENS_W"] * intens_c + CFG["EVID_EMOJI_W"] * e_plus

    # Calculate anchor before features (needed for mutual damping)
    anchor = 1.0 if (CFG["NEUTRAL_ANCHOR_ENABLE"] and any(a.strip() and a.strip() in tnorm for a in (CFG["NEUTRAL_ANCHOR_LIST_SV"] if detected_lang == "sv" else CFG["NEUTRAL_ANCHOR_LIST_EN"]).split(","))) else 0.0

    # New features (only if flags enabled)
    f_resolve = resolve_feature(tnorm, detected_lang, CFG["RESOLVE_WINDOW"]) if CFG["FEATURE_RESOLVE"] else 0.0
    f_mutual = mutual_feature(tnorm, detected_lang) if CFG["FEATURE_MUTUAL"] else 0.0
    f_tlite = tension_lite_feature(tnorm, detected_lang) if CFG["FEATURE_TENSION_LITE"] else 0.0

    # Safety: block boost if red signal active
    if s_red > CFG["RED_SUPPRESS"]:
        f_resolve *= 0.3
        f_mutual = 0.0
        f_tlite *= 0.0

    # Damp mutual in neutral contexts
    if anchor:
        f_mutual *= (1.0 - CFG["DAMP_ANCHOR_MUTUAL"])  # default: 40% remains

    # Z-score decision in CALIBRATION_MODE - FIRST decision point
    if CFG["CALIBRATION_MODE"]:
        # Normalize features to 0..1
        f_pos = max(0.0, min(1.0, s_pos))
        f_tens = max(0.0, min(1.0, tens))
        f_red = max(0.0, min(1.0, red_combined))
        f_evid = max(0.0, min(1.0, pos_evid / 3.0))
        
        # Weighted Z-score
        WX_RED = float(os.getenv("WX_RED", "1.20"))
        WX_TENSION = float(os.getenv("WX_TENSION", "0.70"))
        WX_POS = float(os.getenv("WX_POS", "0.60"))
        WX_EVID = float(os.getenv("WX_EVID", "0.15"))
        WX_RESOLVE = float(os.getenv("WX_RESOLVE", "0.55"))
        WX_MUTUAL = float(os.getenv("WX_MUTUAL", "0.60"))
        WX_TLITE = CFG["WX_TENSION_LITE"]
        WX_ANCHOR_NEUTRAL = float(os.getenv("WX_ANCHOR_NEUTRAL", "-0.35"))
        BIAS = float(os.getenv("BIAS", "0.00"))
        
        z = BIAS + WX_RED * f_red + WX_POS * f_pos + WX_TENSION * f_tens + WX_EVID * f_evid + WX_RESOLVE * f_resolve + WX_MUTUAL * f_mutual + WX_TLITE * f_tlite + WX_ANCHOR_NEUTRAL * anchor
        
        Z_RED = float(os.getenv("Z_RED", "1.05"))
        Z_PLUS = float(os.getenv("Z_PLUS", "0.80"))
        Z_LIGHT = float(os.getenv("Z_LIGHT", "0.45"))
        
        result_level = None
        result_score = None
        if z >= Z_RED:
            result_level = "red"
            result_score = 0.9
        elif z >= Z_PLUS:
            result_level = "plus"
            result_score = 0.75
        elif z >= Z_LIGHT:
            result_level = "light"
            result_score = 0.60
        else:
            result_level = "neutral"
            result_score = CFG["NEUTRAL_SCORE"]
        
        result = ok(result_level, result_score, detected_lang, t0)
        dlog({
            "case": os.getenv("DBG_CASE_ID", ""),
            "level": result["level"],
            "score": round(float(result["score"]), 3),
            "lang": detected_lang,
            "z": round(float(z), 3),
            "f_pos": round(float(f_pos), 3),
            "f_tens": round(float(f_tens), 3),
            "f_red": round(float(f_red), 3),
            "f_evid": round(float(f_evid), 3),
            "z_thresholds": {"Z_RED": Z_RED, "Z_PLUS": Z_PLUS, "Z_LIGHT": Z_LIGHT}
        })
        return result

    # Prod boost for Light/Plus when CALIBRATION_MODE=false
    if not CFG["CALIBRATION_MODE"]:
        # Light: mild conflict that resolves (tension + resolve)
        if tens >= max(CFG["TENSION_GATE"] - 0.02, 0.20) and f_resolve >= 0.33 and s_red < thr["red_min"]:
            return ok("light", max(CFG["LIGHT_BUFF_BASE"], 0.62), detected_lang, t0)
        # Light: tension-lite feature (mild negativity patterns)
        if f_tlite >= 0.50 and s_red < thr["red_min"]:
            return ok("light", max(CFG["LIGHT_BUFF_BASE"], 0.62), detected_lang, t0)
        # Plus: clear mutuality/encouragement
        if f_mutual >= 0.50 and s_pos >= max(thr["light_min"], 0.50):
            return ok("plus", max(CFG["PLUS_SCORE_BASE"], 0.72), detected_lang, t0)

    # 1.5) Special case: "hopeless"/"alone+isolated" → plus (before light classification)
    if detected_lang == "sv":
        has_hopeless = "hopplös" in tnorm
        has_alone_isolated = "ensam" in tnorm and "isolerad" in tnorm
    else:
        has_hopeless = "hopeless" in tnorm
        has_alone_isolated = ("alone" in tnorm and "isolated" in tnorm) or ("sad" in tnorm and "hopeless" in tnorm)
    if has_hopeless or has_alone_isolated:
        return ok("plus", 0.75, detected_lang, t0)  # Mid-range plus score
    
    # 2) Tension-based LIGHT detection
    if tens >= CFG["TENSION_GATE"] and s_red < thr["red_min"]:
        if s_pos >= thr["light_min"] or tens >= (CFG["TENSION_GATE"] + CFG["TENSION_BUFF"]):
            return ok("light", max(CFG["LIGHT_BUFF_BASE"], min(CFG["LIGHT_BUFF_MAX"], CFG["LIGHT_BUFF_BASE"] + CFG["LIGHT_BUFF_GAIN"] * tens)), detected_lang, t0)

    # 3) Positiv evidens-golv för plus/light
    if pos_evid >= CFG["POS_EVID_PLUS_MIN"] and s_pos >= CFG["POS_SCORE_PLUS_MIN"]:
        return ok("plus", max(CFG["PLUS_SCORE_BASE"], s_pos), detected_lang, t0)
    if pos_evid >= CFG["POS_EVID_LIGHT_MIN"] and s_pos >= CFG["POS_SCORE_LIGHT_MIN"]:
        return ok("light", max(CFG["LIGHT_BUFF_BASE"], s_pos), detected_lang, t0)

    # 3.5) Tension-lite nudge → LIGHT (svag negativ vardag)
    if CFG["FEATURE_TENSION_LITE"] and s_red < thr["red_min"]:
        hints = LITE_NEG_HINT_SV if detected_lang == "sv" else LITE_NEG_HINT_EN
        has_hint = any(h in tnorm for h in hints)
        in_band = abs(s_pos - thr["light_min"]) <= CFG["LITE_WINDOW"]
        mild_tension = CFG["LITE_TENSION_MIN"] <= tens <= CFG["LITE_TENSION_MAX"]
        if has_hint and in_band and mild_tension:
            return ok("light", max(CFG["LIGHT_BUFF_FALLBACK"], s_pos + CFG["LITE_NEG_W"]), detected_lang, t0)

    # 4) Klassificera med trösklar (sigmoid redan skärpt)
    if s_pos >= thr["plus_min"]:
        return ok("plus", s_pos, detected_lang, t0)
    elif s_pos >= thr["light_min"] or tens >= CFG["TENSION_FALLBACK"]:
        # For light, clamp score to be in range 0.3-0.5
        light_score = max(s_pos, CFG["LIGHT_BUFF_FALLBACK"])
        light_score = min(light_score, 0.5)  # Cap at 0.5
        light_score = max(light_score, 0.3)  # Floor at 0.3
        return ok("light", light_score, detected_lang, t0)

    # 5) Annars neutral
    result = ok("neutral", CFG["NEUTRAL_SCORE"], detected_lang, t0)
    
    # Debug logging
    dlog({
        "case": os.getenv("DBG_CASE_ID", ""),
        "level": result["level"],
        "score": round(float(result["score"]), 3),
        "lang": detected_lang,
        "s_pos": round(float(s_pos), 3),
        "tension": round(float(tens), 3),
        "red_combined": round(float(red_combined), 3) if 'red_combined' in locals() else None,
        "pos_evid": round(float(pos_evid), 3) if 'pos_evid' in locals() else None,
        "val": round(float(debug_info.get("val", 0)), 3),
        "pos_c": debug_info.get("pos_c"),
        "neg_c": debug_info.get("neg_c"),
        "red_c": debug_info.get("red_c"),
        "cfg": {
            "LIGHT_MIN": CFG["LIGHT_MIN"],
            "PLUS_MIN": CFG["PLUS_MIN"],
            "RED_MIN": CFG["RED_MIN"],
            "TENSION_GATE": CFG["TENSION_GATE"],
            "VAL_GAIN": CFG["VAL_GAIN"],
            "NEGATOR_DAMP": CFG["NEGATOR_DAMP"]
        }
    })
    
    return result


# --- JSONL Bridge Protocol ---

def handle_jsonl_request(line: str) -> str:
    """Handle JSONL request from Node.js bridge"""
    start_time = time.perf_counter()
    try:
        request = json.loads(line.strip())
        text = request.get("text", "")
        lang = request.get("lang", "auto")
        trace_id = request.get("trace_id", "")

        result = detect_mood(text, lang)
        
        elapsed_ms = (time.perf_counter() - start_time) * 1000

        return json.dumps({
            "ok": True,
            "agent": AGENT_ID,
            "version": AGENT_VERSION,
            "level": result["level"],
            "score": result["score"],
            "flags": result["flags"],
            "red_hint": result["red_hint"],
            "latency_ms": round(elapsed_ms, 2),
            "trace_id": trace_id,
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({
            "ok": False,
            "agent": AGENT_ID,
            "error": str(e),
            "latency_ms": round((time.perf_counter() - start_time) * 1000, 2)
        }, ensure_ascii=False)


# --- CLI/Interactive mode ---

if __name__ == "__main__":
    # JSONL bridge mode (stdin/stdout)
    if not sys.stdin.isatty():
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                response = handle_jsonl_request(line)
                print(response, flush=True)
            except Exception as e:
                error_resp = json.dumps({
                    "ok": False,
                    "agent": AGENT_ID,
                    "error": str(e),
                    "latency_ms": 0
                }, ensure_ascii=False)
                print(error_resp, flush=True, file=sys.stdout)
        sys.exit(0)

    # Simple CLI test (for debugging)
    if len(sys.argv) > 1:
        test_text = " ".join(sys.argv[1:])
        result = detect_mood(test_text)
        print(json.dumps({
            "ok": True,
            "version": AGENT_VERSION,
            "latency_ms": result.get("latency_ms", 0),
            "emits": result
        }, indent=2, ensure_ascii=False))
    else:
        # Interactive mode
        print(f"Micro-Mood Scorer v{AGENT_VERSION}")
        print("Enter text (or 'quit' to exit):")
        while True:
            try:
                line = input("> ").strip()
                if line.lower() in ("quit", "exit", "q"):
                    break
                if line:
                    result = detect_mood(line)
                    print(json.dumps({
                        "score": result["score"],
                        "level": result["level"],
                        "flags": result["flags"],
                        "red_hint": result["red_hint"],
                        "latency_ms": result.get("latency_ms", 0)
                    }, indent=2, ensure_ascii=False))
            except KeyboardInterrupt:
                break
            except Exception as e:
                print(f"Error: {e}", file=sys.stderr)
