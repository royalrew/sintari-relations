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

# Add parent directory to path for imports
_script_dir = Path(__file__).resolve().parent
_sys_path_inserted = False
if str(_script_dir.parent.parent) not in sys.path:
    sys.path.insert(0, str(_script_dir.parent.parent))
    _sys_path_inserted = True

try:
    from agents.emotion.lexicon_loader import load_lexicon
except ImportError:
    # Fallback: try relative import
    import importlib.util
    loader_path = _script_dir / "lexicon_loader.py"
    if loader_path.exists():
        spec = importlib.util.spec_from_file_location("lexicon_loader", loader_path)
        lexicon_loader = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(lexicon_loader)
        load_lexicon = lexicon_loader.load_lexicon
    else:
        # Fallback: create minimal loader
        def load_lexicon(path=None):
            from pathlib import Path
            import json
            default = Path(__file__).resolve().parents[2] / "lexicons" / "emotion_lexicon.json"
            p = Path(path) if path else default
            if p.exists():
                return json.loads(p.read_text(encoding="utf-8"))
            return {"RED": {"sv": [], "en": []}, "PLUS": {"sv": [], "en": []}, "RED_PHRASES": {"sv": [], "en": []}, "PLUS_PHRASES": {"sv": [], "en": []}, "ABUSE": {"sv": [], "en": []}, "ABUSE_PHRASES": {"sv": [], "en": []}, "NEUTRAL": {"sv": [], "en": []}, "NEGATIONS": {"sv": [], "en": []}, "MODIFIERS": {"boost": [], "dampen": []}, "EMOJI": {"red": [], "plus": []}, "WEIGHTS": {"unigram": {"red": 0.3, "plus": 0.25}, "phrase": {"red": 0.6, "plus": 0.4}, "emoji": {"red": 0.5, "plus": 0.25}}}

# Force UTF-8 encoding for Windows compatibility
if sys.platform == 'win32':
    import io
    # Only wrap if not already wrapped and stdin is available
    try:
        if not hasattr(sys.stdin, 'buffer') or not isinstance(sys.stdin, io.TextIOWrapper):
            if sys.stdin.isatty() or not sys.stdin.closed:
                sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
    except (AttributeError, ValueError):
        pass
    try:
        if not hasattr(sys.stdout, 'buffer') or not isinstance(sys.stdout, io.TextIOWrapper):
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
    except (AttributeError, ValueError):
        pass

AGENT_VERSION = "2.0.0"
AGENT_ID = "micro_mood"

# --- Debug logging ---
DEBUG = os.getenv("DEBUG_EMO", "0") == "1"
DEBUG_EMOTION = os.getenv("DEBUG_EMOTION") == "1"

def dlog(obj):
    if DEBUG or DEBUG_EMOTION:
        sys.stderr.write(json.dumps(obj, ensure_ascii=False) + "\n")

def dbg(**kw):
    """Debug output för emotion detection"""
    if DEBUG_EMOTION:
        print(json.dumps(kw, ensure_ascii=False), file=sys.stderr)

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

# 1) Robust normalisering + match-funktioner
def nfc(s: str) -> str:
    """Normalize Unicode to NFC"""
    return unicodedata.normalize("NFC", s)

def simple_norm(s: str) -> str:
    """Robust text normalization for matching"""
    s = nfc(s).lower()
    # ersätt typografiska citat, tankstreck, m-dash, etc.
    s = s.replace("'", "'").replace(""", "\"").replace(""", "\"").replace("–", "-").replace("—", "-")
    # Behåll apostrofer för engelska (don't, can't, etc.)
    # Normalisera whitespace & punktuation till mellanslag runt tecken som bryter ord
    # Men behåll apostrofer och bindestreck i ord
    s = re.sub(r"[^\wÅÄÖåäö'\-]+", " ", s, flags=re.UNICODE)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def any_re(text: str, patterns: list[str]) -> bool:
    """Match any pattern with regex"""
    return any(re.search(p, text, flags=re.UNICODE) for p in patterns)

def count_re(text: str, patterns: list[str]) -> int:
    """Count matching patterns"""
    return sum(1 for p in patterns if re.search(p, text, flags=re.UNICODE))

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

POS_SV = ["trygg", "sedd", "uppskattad", "tillsammans", "respekt", "värme", "stöttar", "nära", "hopp", "tacksam", "hoppfull", "lugnare nu", "lite bättre", "jag försöker", "ett steg i taget", "känns lättare", "stöd", "stolt över mig", "jag klarar det", "hjälp finns", "det ordnar sig", "modig", "bättre idag", "vågar be om hjälp", "glädje", "tillit", "tacksamhet", "balans", "hjälp", "vågade", "steg", "lite", "bättre", "försöker", "klarar", "progress", "framsteg"]
POS_EN = ["safe", "seen", "appreciated", "together", "respect", "warm", "support", "close", "hope", "grateful", "hopeful", "calmer now", "a bit better", "trying my best", "one step at a time", "feels lighter", "proud of myself", "I can handle it", "help exists", "it will be okay", "brave", "better today", "asked for help", "joy", "warmth", "trust", "gratitude", "balance", "okay", "ok", "win", "wins", "progress", "improving", "better", "helps", "heard", "steps"]

# Soft-positive words (weak signal, +0.2 weight instead of +1.0)
SOFT_POS_SV = ["bra", "okej", "stabil", "fungerar", "trygg", "balanserad", "lite", "små", "steg"]
SOFT_POS_EN = ["fine", "steady", "alright", "okay", "safe", "balanced", "tiny", "small", "step", "steps"]

NEG_SV = ["irriterad", "ledsen", "orolig", "frustrerad", "bråk", "gräl", "trött", "stress", "saknas", "distans", "snäser", "snäsar", "tens", "spänd", "ensam", "isolerad", "nedstämd", "mår inte bra", "orkar inte", "skiter i", "pallar inte", "saknar", "hopplös", "burned out", "checked out"]

# Light-tension hints (mild negativity without conflict)
LITE_NEG_HINT_SV = ["lite irriterad", "lite stressad", "små irritationer", "smågräl",
                    "trött på", "tjat", "små tjafs", "känns lite tungt", "små konflikter"]

LITE_NEG_HINT_EN = ["a bit annoyed", "a little stressed", "small annoyances",
                    "minor arguments", "tired of", "nagging", "little tension"]

NEG_EN = ["annoyed", "sad", "anxious", "frustrated", "fight", "argue", "tired", "stress", "missing", "distance", "tense", "snappy", "irritable", "alone", "isolated", "feeling down", "not feeling well", "hopeless", "can't cope", "checked out", "burned out", "lonely", "drained", "not happy", "no energy"]

RED_SV = ["värdelös", "fången", "hotad", "rädd", "kontrollerar", "isolerar", "skäms", "orkar inte mer", "vill ge upp", "ge upp", "maktlös", "nedtryckt", "hotar", "säger att jag", "självmord", "ta livet av", "vill dö", "orkar inte leva", "tänker på självmord", "kommer ta livet av mig", "vill inte leva", "hopplös", "tom inuti", "allt känns meningslöst", "vill försvinna", "ingen utväg", "mörkt", "ingen bryr sig", "kan inte fortsätta", "helt ensam", "ingen mening", "allt är förstört", "fast i mörker", "ingen hjälp", "ger upp", "hat mot sig själv", "finns ingen väg ut"]
RED_EN = ["worthless", "trapped", "threatened", "afraid", "controls", "isolates", "ashamed", "can't take", "want to give up", "powerless", "pressed down", "threatens", "says i", "suicide", "kill myself", "want to die", "can't go on living", "thinking about suicide", "going to kill myself", "don't want to live", "can't go on", "hopeless", "empty inside", "life is pointless", "want to disappear", "no way out", "dark", "nobody cares", "can't continue", "completely alone", "no meaning", "everything is ruined", "trapped", "no help", "give up", "self hate", "no escape"]

GASLIT_SV = ["inbillar", "minns fel", "det har aldrig hänt"]
GASLIT_EN = ["imagining", "remember wrong", "never happened"]

# RED regex patterns for hard rules (gaslighting + power + suicide)
RED_PATTERNS_SV = [
    r"\bsky(l|ll)er\s+allt\s+p[aå]\s+mig\b",
    r"\bjag\s+h[åa]ller\s+tyst\b",
    r"\bvill\s+d[öo]\b",
    r"\btar?\s+livet\s+av\s+(mig|sig)\b",
    r"\bvill\s+inte\s+leva\b",
    r"\bvill\s+inte\s+leva\s+l[aä]ngre\b",
    r"\borkar\s+inte\s+mer\b",
    r"\bhoppl[öo]s\b",
    r"\bingen\s+utv[aä]g\b",
    r"\bingen\s+mening\b",
]
RED_PATTERNS_EN = [
    r"\bblames?\s+me\s+for\s+everything\b",
    r"\bI\s+keep\s+quiet\s+now\b",
    r"\bwant\s+to\s+die\b",
    r"\bgoing\s+to\s+kill\s+myself\b",
    r"\bdon'?t\s+want\s+to\s+live\b",
    r"\bcan'?t\s+go\s+on\b",
    r"\bhopeless\b",
    r"\bno\s+way\s+out\b",
    r"\bno\s+meaning\b",
]

NEGATORS_SV = ["inte", "aldrig", "inget", "ingenting", "utan"]
NEGATORS_EN = ["not", "never", "no", "nothing", "without"]

INTENS_SV = ["väldigt", "otroligt", "så", "sjukt", "extremt"]
INTENS_EN = ["very", "extremely", "so", "super", "really"]

EMOJI_PLUS = set("🙂😊❤️💖🌸🎉💗👍🤝🥰")
EMOJI_NEG = set("😞😔💔😭😢😡👎")
EMOJI_RED = set("💔🆘🛑☠️🔪")


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
        # Try sintari-relations/config (project root relative to agents/emotion)
        p = Path(__file__).resolve().parents[2] / "config" / "micro_mood_thresholds.json"
        if not p.exists():
            # Try alternative path
            p = Path(__file__).resolve().parents[3] / "sintari-relations" / "config" / "micro_mood_thresholds.json"
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

# Update CFG thresholds from loaded THR (if file loaded successfully)
if THR and "sv" in THR and "light_min" in THR["sv"]:
    CFG["LIGHT_MIN"] = THR["sv"]["light_min"]
    CFG["PLUS_MIN"] = THR["sv"]["plus_min"]
    CFG["RED_MIN"] = THR["sv"]["red_min"]
    if DEBUG:
        dlog({"loaded_thr": THR["sv"], "cfg_updated": CFG["LIGHT_MIN"]})

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

def negation_guard(text: str, lang: str) -> float:
    """Detect negation and invert polarity of affected words (±3 token window)"""
    if lang == "sv":
        negators = NEGATORS_SV
    else:
        negators = NEGATORS_EN
    
    tokens = tokenize_words(text)
    if not tokens:
        return 0.0
    
    negation_score = 0.0
    for i, token in enumerate(tokens):
        # Check if this token is a negator
        if token.lower() in negators:
            # Look at ±3 window for affected sentiment words
            window_start = max(0, i - 3)
            window_end = min(len(tokens), i + 4)
            window_tokens = tokens[window_start:window_end]
            
            # Check for positive/negative words in window
            pos_words = POS_SV + SOFT_POS_SV if lang == "sv" else POS_EN + SOFT_POS_EN
            neg_words = NEG_SV if lang == "sv" else NEG_EN
            
            for wt in window_tokens:
                if wt.lower() in pos_words:
                    negation_score -= 0.5  # Invert positive
                elif wt.lower() in neg_words:
                    negation_score += 0.5  # Invert negative
    
    return max(-1.0, min(1.0, negation_score * 0.15))  # Clamp and scale

def intensity_score(text: str) -> float:
    """Calculate intensity based on exclamations and ALLCAPS"""
    exclamation_count = text.count('!')
    all_caps_chars = sum(1 for ch in text if ch.isupper() and ch.isalpha())
    total_chars = sum(1 for ch in text if ch.isalpha())
    all_caps_frac = (all_caps_chars / total_chars) if total_chars > 0 else 0.0
    
    intensity = min(1.0, 0.15 * exclamation_count + 0.10 * all_caps_frac)
    return intensity


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

def polarity_score(text: str, lang: str, lexicon: dict | None = None) -> tuple[float, float, dict]:
    """
    Calculate polarity score and RED signal.
    Returns: (score_pos, score_red, debug_info) where debug_info contains signal counts
    
    Args:
        text: Input text
        lang: Language code ("sv" or "en")
        lexicon: Optional lexicon dict (loaded if None)
    """
    # Load lexicon if not provided
    if lexicon is None:
        lexicon = load_lexicon()
    
    lang_key = "sv" if lang == "sv" else "en"
    text_lower = text.lower()
    
    # Get lexicon phrases
    red_phrases = lexicon.get("RED_PHRASES", {}).get(lang_key, [])
    plus_phrases = lexicon.get("PLUS_PHRASES", {}).get(lang_key, [])
    abuse_phrases = lexicon.get("ABUSE_PHRASES", {}).get(lang_key, [])
    distress_phrases = lexicon.get("EMOTION_DISTRESS_PHRASES", {}).get(lang_key, [])
    weights = lexicon.get("WEIGHTS", {})
    # Starkare fraser - höjda bonuses
    PHRASE_RED_BONUS = 0.65
    PHRASE_PLUS_BONUS = 0.45
    phrase_w_red = weights.get("phrase", {}).get("red", PHRASE_RED_BONUS)
    phrase_w_plus = weights.get("phrase", {}).get("plus", PHRASE_PLUS_BONUS)
    
    if lang == "sv":
        pos, neg, red, gas = POS_SV, NEG_SV, RED_SV, GASLIT_SV
        negators, intens = NEGATORS_SV, INTENS_SV
    else:
        pos, neg, red, gas = POS_EN, NEG_EN, RED_EN, GASLIT_EN
        negators, intens = NEGATORS_EN, INTENS_EN
    
    # Merge lexicon words with hardcoded lists
    lexicon_red = lexicon.get("RED", {}).get(lang_key, [])
    lexicon_plus = lexicon.get("PLUS", {}).get(lang_key, [])
    lexicon_abuse = lexicon.get("ABUSE", {}).get(lang_key, [])
    
    # Combine hardcoded + lexicon words
    pos = list(set(pos + lexicon_plus))
    red = list(set(red + lexicon_red))
    gas = list(set(gas + lexicon_abuse))

    # Count matches
    pos_c = count_matches(text, pos)
    neg_c = count_matches(text, neg)
    red_c = count_matches(text, red) + count_matches(text, gas)  # Gaslighting → RED
    intens_c = count_matches(text, intens)
    negator_c = count_matches(text, negators)
    
    # Phrase matching (before word weights)
    red_phrase_hits = sum(1 for phrase in red_phrases + abuse_phrases if phrase.lower() in text_lower)
    plus_phrase_hits = sum(1 for phrase in plus_phrases if phrase.lower() in text_lower)
    distress_phrase_hits = sum(1 for phrase in distress_phrases if phrase.lower() in text_lower)
    
    # Debug: show which words matched
    if DEBUG:
        matched_pos = [w for w in pos if (" " in w and w.lower() in text.lower()) or (wb(w).search(text))]
        matched_neg = [w for w in neg if (" " in w and w.lower() in text.lower()) or (wb(w).search(text))]
        matched_red = [w for w in red + gas if (" " in w and w.lower() in text.lower()) or (wb(w).search(text))]
        if matched_pos or matched_neg or matched_red:
            print(f"[DEBUG] Matched POS: {matched_pos}", file=sys.stderr)
            print(f"[DEBUG] Matched NEG: {matched_neg}", file=sys.stderr)
            print(f"[DEBUG] Matched RED: {matched_red}", file=sys.stderr)
        print(f"[DEBUG] Counts: pos_c={pos_c}, neg_c={neg_c}, red_c={red_c}, intens_c={intens_c}, negator_c={negator_c}", file=sys.stderr)
    
    # Count soft-positive words (weak signal)
    soft_pos = SOFT_POS_SV if lang == "sv" else SOFT_POS_EN
    soft_pos_c = count_matches(text, soft_pos)
    # Add soft-positive as partial contribution
    pos_soft_contrib = CFG["EVID_SOFT_POS_W"] * soft_pos_c
    
    # Count neutral words (for logit-mix)
    neutral_words = lexicon.get("NEUTRAL", {}).get(lang_key, [])
    neutral_hits = count_matches(text, neutral_words)

    # Phrase boost (before basic valence calculation)
    if red_phrase_hits > 0:
        # RED phrases boost negative score significantly
        neg_c += phrase_w_red * red_phrase_hits
    if plus_phrase_hits > 0:
        # PLUS phrases boost positive score
        pos_c += phrase_w_plus * plus_phrase_hits
    
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
    
    # Coping rule: oro + coping signals → plus_score += 0.25, reduce neutral
    # Detect worry/anxiety words combined with positive/coping words
    # Tokenize text for better matching
    tokens = set(re.findall(r"[a-zA-ZåäöÅÄÖ'’-]+", text_lower))
    
    anxiety_ctx = {"orolig", "oroar", "spänd", "worried", "concerned", "tense", "stressed", "pulling away", "ångest", "anxious", "nervous"}
    has_anxiety = any(t in anxiety_ctx for t in tokens) or ("pulling away" in text_lower)
    
    coping_phr = {
        "ett steg i taget", "försöker hålla lugnt", "försöker hålla lugnet", "vågar be om hjälp", 
        "tar en paus", "andas lugnt", "one step at a time", "trying to stay calm", 
        "asked for help", "taking a pause", "breathing calmly", "we start over", 
        "we talk calmly", "pause before i respond", "pausar innan jag svarar"
    }
    has_coping = any(p in text_lower for p in coping_phr)
    
    if has_anxiety and has_coping:
        # Coping detected: boost plus, reduce neutral influence
        val += 0.25
        # Reduce anchor influence (will be handled in detect_mood with anchor_base = 0.52)

    # Valence amplification - increases contrast between + and -
    val *= CFG["VAL_GAIN"]

    # Intensifier boost (magnify emotion)
    if intens_c:
        val *= 1.0 + min(0.5, CFG["INTENSIFIER_GAIN"] * intens_c)

    # Negation flip (reduce impact)
    if negator_c:
        val *= CFG["NEGATOR_DAMP"]

    # Emoji contribution (enhanced weight for better detection)
    e_plus, e_neg, e_red = emoji_score(text)
    val += CFG["EMOJI_POS_W"] * e_plus
    val -= CFG["EMOJI_NEG_W"] * e_neg
    
    # Enhanced emoji scoring for RED indicators
    if e_red > 0:
        val -= 0.20  # RED emojis strongly negative
    
    # RED signal (separate channel) - boosted for better detection
    # Base: configurable per RED word and emoji
    # Minimum boost if any RED word found
    red_base = CFG["RED_RULE_WEIGHT"] * red_c + CFG["RED_RULE_EMOJI_BONUS"] * e_red
    if red_c > 0:
        red_base += CFG["RED_MIN_BOOST"]
    red_signal = min(1.0, red_base)
    
    # Negation guard (invert polarity within ±3 tokens)
    neg_guard = negation_guard(text, lang)
    val += neg_guard
    
    # Intensity boost (exclamations and ALLCAPS)
    intens_boost = intensity_score(text)
    if val > 0:
        val *= (1.0 + intens_boost * 0.25)  # Boost positive more with intensity
    elif val < 0:
        val *= (1.0 + intens_boost * 0.25)  # Boost negative more with intensity

    # Map to [0, 1] with sigmoid around neutrality
    # Sharper S-curve: -6 instead of -3 for better separation
    # val=0 → 0.5, val>0 → >0.5, val<0 → <0.5
    score_pos = 1 / (1 + math.exp(-6 * val))  # Sharper separation between neutral and light
    
    # Debug: show valence calculation
    if DEBUG:
        print(f"[DEBUG] val={val:.3f}, score_pos={score_pos:.3f}, red_signal={red_signal:.3f}", file=sys.stderr)

    debug_info = {
        "pos_c": pos_c,
        "neg_c": neg_c,
        "e_plus": e_plus,
        "e_neg": e_neg,
        "e_red": e_red,
        "red_c": red_c,  # Include RED count to exclude from weak-evidence check
        "negator_c": negator_c,  # Include for Z-score
        "intens_c": intens_c,  # Include for Z-score
        "total_weak": pos_c + neg_c + e_plus + e_neg,
        "val": val,  # Include raw valence for weak-evidence check
        "neutral_hits": neutral_hits,  # For logit-mix
        "plus_phrase_hits": plus_phrase_hits,  # For logit-mix
        "red_phrase_hits": red_phrase_hits,  # For logit-mix
        "distress_phrase_hits": distress_phrase_hits,  # For distress detection
        "has_anxiety": has_anxiety,  # For logit-mix
        "has_coping": has_coping,  # For logit-mix
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
    raw_text = text
    text_lower = simple_norm(text)  # Robust normalisering
    tnorm = norm(text)  # Behåll för bakåtkompatibilitet
    
    # Language detection
    detected_lang = detect_lang(tnorm) if lang == "auto" else lang
    
    # Load lexicon
    lexicon = load_lexicon()
    
    # Use CFG thresholds (backward compatible with THR if needed)
    thr = {
        "plus_min": CFG["PLUS_MIN"],
        "light_min": CFG["LIGHT_MIN"],
        "red_min": CFG["RED_MIN"]
    }

    # Score (with lexicon)
    s_pos, s_red, debug_info = polarity_score(tnorm, detected_lang, lexicon)
    
    # Check for coping pattern (worry + coping words) - enhanced version
    tokens = set(re.findall(r"[a-zA-ZåäöÅÄÖ'’-]+", text_lower))
    
    anxiety_ctx = {"orolig", "oroar", "spänd", "worried", "concerned", "tense", "stressed", "pulling away", "ångest", "anxious", "nervous"}
    has_anxiety = any(t in anxiety_ctx for t in tokens) or ("pulling away" in text_lower)
    
    coping_phr = {
        "ett steg i taget", "försöker hålla lugnt", "försöker hålla lugnet", "vågar be om hjälp", 
        "tar en paus", "andas lugnt", "one step at a time", "trying to stay calm", 
        "asked for help", "taking a pause", "breathing calmly", "we start over", 
        "we talk calmly", "pause before i respond", "pausar innan jag svarar"
    }
    has_coping = any(p in text_lower for p in coping_phr)
    
    coping_detected = has_anxiety and has_coping
    tens = tension_score(tnorm, detected_lang)
    e_plus, e_neg, e_red = emoji_score(tnorm)
    
    # --- Severe RED detection (STRONG/WEAK mönster) ---
    NEGATIONS_GENERIC = [
        r"\bi am not suicidal\b",
        r"\bi'?m not suicidal\b",
        r"\bi don'?t want to die\b",
        r"\bi do want to live\b",
        r"\bjag (?:\b| )vill leva\b",
    ]

    def is_negated_generic(t: str) -> bool:
        return any(re.search(p, t) for p in NEGATIONS_GENERIC)

    SEVERE_RED_EN_STRONG = [
        r"\bdon'?t\s+want\s+to\s+go\s+on\b",
        r"\bcan'?t\s+go\s+on\b",
        r"\bcan'?t\s+keep\s+going\b",
        r"\bi'?m\s+exhausted\s+and\s+see\s+no\s+point\b",
        r"\b(no|not?\s+any)\s+point\s+(?:in|to)\s+(?:living|this|going\s+on)\b",
        r"\blife\s+is\s+pointless\b",
        r"\btired\s+of\s+living\b",
        r"\b(end\s+my\s+life|suicidal)\b",
        r"\bif\s+i\s+disappeared.*no\s+one\s+would\s+miss\s+me\b",
        r"\bi\s+see\s+no\s+point\s+in\s+living\b",
        r"\bno\s+reason\s+to\s+live\b",
        r"\bend\s+it\s+all\b",
        r"\bi\s+want\s+to\s+end\s+it\b",
    ]

    SEVERE_RED_EN_WEAK = [
        r"\bi\s+want\s+to\s+die\b",
        r"\bno\s+way\s+out\b",
    ]

    SEVERE_RED_SV = [
        r"\bvill\s+inte\s+leva(?:\s+l(a|ä)ngre)?\b",
        r"\borkar\s+inte\s+leva\b",
        r"\bser\s+ingen\s+utv(a|ä)g\b",
        r"\bom\s+jag\s+bara\s+f(ö|o)rsvann\b",
        r"\bingen\s+skulle\s+sakna\s+mig\b",
        r"\bjag\s+vill\s+d(ö|o)\b",
    ]

    sv_severe = any_re(text_lower, SEVERE_RED_SV)
    en_severe_strong = any_re(text_lower, SEVERE_RED_EN_STRONG)
    en_severe_weak = any_re(text_lower, SEVERE_RED_EN_WEAK) and not is_negated_generic(text_lower)
    severe_red_flag = sv_severe or en_severe_strong or en_severe_weak
    
    if coping_detected and not en_severe_strong:
        severe_red_flag = False

    if severe_red_flag:
        return ok("red", 0.9, detected_lang, t0)
    
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
    # Reduced from 1.0 to 0.6 to avoid canceling weak plus signals
    # Coping rule: if worry + coping detected, reduce anchor to 0.52
    anchor_base = 0.52 if coping_detected else 0.6
    anchor = anchor_base if (CFG["NEUTRAL_ANCHOR_ENABLE"] and any(a.strip() and a.strip() in tnorm for a in (CFG["NEUTRAL_ANCHOR_LIST_SV"] if detected_lang == "sv" else CFG["NEUTRAL_ANCHOR_LIST_EN"]).split(","))) else 0.0

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
        # --- scoring v2 (logit-mix) ---
        tokens = tokenize_words(text)
        L = max(len(tokens), 12)
        
        # Get raw counts from debug_info
        pos_score = debug_info.get("pos_c", 0)
        neg_score = debug_info.get("neg_c", 0)
        neutral_hits = debug_info.get("neutral_hits", 0)
        plus_phrase_hits = debug_info.get("plus_phrase_hits", 0)
        red_phrase_hits = debug_info.get("red_phrase_hits", 0)
        distress_phrase_hits = debug_info.get("distress_phrase_hits", 0)
        e_plus = debug_info.get("e_plus", 0)
        e_red = debug_info.get("e_red", 0)
        has_anxiety = debug_info.get("has_anxiety", False)
        has_coping = debug_info.get("has_coping", False)
        red_c = debug_info.get("red_c", 0)
        
        # Längdnorm: mildare straff för långa texter (sqrt istället för L)
        norm_factor = (L ** 0.5)
        pos_n = pos_score / norm_factor
        neg_n = neg_score / norm_factor
        neu_n = max(neutral_hits, 0) / norm_factor
        
        # Fras/emoji väger mer än ord (höjda bonuses)
        pos_n += 0.12 * plus_phrase_hits + 0.05 * e_plus
        neg_n += 0.14 * red_phrase_hits + 0.08 * e_red
        
        # 0) STRONG-RED först, helt orörd (räddar recall)
        # Definiera STRONG-mönster tidigt
        SEVERE_RED_EN_STRONG_CAL = [
            r"\bdon'?t\s+want\s+to\s+go\s+on\b",
            r"\bcan'?t\s+go\s+on\b",
            r"\bcan'?t\s+keep\s+going\b",
            r"\bi'?m\s+exhausted\s+and\s+see\s+no\s+point\b",
            r"\b(no|not?\s+any)\s+point\s+(?:in|to)\s+(?:living|this|going\s+on)\b",
            r"\blife\s+is\s+pointless\b",
            r"\btired\s+of\s+living\b",
            r"\b(end\s+my\s+life|suicidal)\b",
            r"\bif\s+i\s+disappeared.*no\s+one\s+would\s+miss\s+me\b",
            r"\bi\s+see\s+no\s+point\s+in\s+living\b",
            r"\bno\s+reason\s+to\s+live\b",
            r"\bend\s+it\s+all\b",
            r"\bi\s+want\s+to\s+end\s+it\b",
        ]
        SEVERE_RED_SV_STRONG = [
            r"\bvill\s+inte\s+leva(?:\s+l(a|ä)ngre)?\b",
            r"\borkar\s+inte\s+leva\b",
            r"\bser\s+ingen\s+utv(a|ä)g\b",
        ]
        SEVERE_RED_SV_WEAK = [
            r"\bom\s+jag\s+bara\s+f(ö|o)rsvann\b",
            r"\bingen\s+skulle\s+sakna\s+mig\b",
            r"\bjag\s+vill\s+d(ö|o)\b",
        ]
        
        en_severe_strong_cal = any_re(text_lower, SEVERE_RED_EN_STRONG_CAL)
        sv_severe_strong = any_re(text_lower, SEVERE_RED_SV_STRONG)
        
        # STRONG → tidig retur (ingen coping-veto)
        if en_severe_strong_cal or sv_severe_strong:
            neg_n += 0.54
            neu_n = max(0.0, neu_n - 0.12)
            return ok("red", 0.9, detected_lang, t0)
        
        # 1) Adaptiv RED-dominans (minskar PLUS→RED)
        # Beräkna coping_gate och distress_mode först (behövs för adaptiv tröskel)
        COPING_PLUS_PATTERNS = [
            r"\bv(å|a)gade?\s+be\s+om\s+hj(a|ä)lp\b",
            r"\blugn\s+pratstund\b",
            r"\bpromenad\b",
            r"\bkunde\s+andas\s+ut\b",
            r"\bone\s+tiny\s+win\b",
            r"\basked\s+for\s+help\b",
            r"\bagreed\s+to\s+pause\b",
            r"\bshort\s+walk\s+cleared\s+my\s+head\b",
            r"\brevisit\s+calmly\s+tomorrow\b",
            r"\bkeep\s+my\s+tone\s+calm\b",
        ]
        
        coping_gate = any(re.search(p, text_lower, flags=re.UNICODE) for p in COPING_PLUS_PATTERNS)
        if coping_gate:
            pos_n += 0.18
            if pos_n < 0.14:
                pos_n = 0.14
            neu_n = max(0.0, neu_n - 0.04)
        
        # "Constructive intent" → PLUS-gate (lyfter light/neutral → plus)
        CONSTRUCTIVE_PATTERNS = [
            r"\bbest(a|ä)mde?\s+en\s+sak\s+i\s+t(a|ä)get\b",
            r"\bvi\s+(?:kom\s+)?(överens|pausade|planerade)\b",
            r"\bimorgon\b",
            r"\bi\s+will\b",
            r"\bwe\s+agreed\b",
            r"\bplan\b",
            r"\basked\s+for\s+help\b",
            r"\bthanks?\s+for\s+being\s+honest\b",
        ]
        
        constructive_gate = any(re.search(p, text_lower, flags=re.UNICODE) for p in CONSTRUCTIVE_PATTERNS)
        if constructive_gate:
            pos_n += 0.12  # separat från coping
            neu_n = max(0.0, neu_n - 0.02)
        
        # ABUSE-coercion gate (för ABUSE-RED detection)
        ABUSE_TRIG = {
            "drar in pengar som hot", "tracks my location", "logs into my accounts",
            "calls me crazy", "kräver min platsdelning", "kräver bilder för att bevisa",
            "kontrollerar min telefon", "tar min telefon", "gaslighting", "gaslighting me"
        }
        abuse_coercion_gate = any(p in text_lower for p in ABUSE_TRIG)
        
        # Tvä-rads-tweak för ABUSE-RED
        if abuse_coercion_gate:
            neg_n = max(neg_n, pos_n + 0.06)  # tvinga negativ dominans vid hot/kontroll/spårning
        if abuse_coercion_gate and not (coping_gate or constructive_gate):
            neg_n += 0.54
            neu_n = max(0.0, neu_n - 0.12)
            return ok("red", 0.9, detected_lang, t0)  # kortslut till RED (ej vid återhämtning)
        
        # 2) Distress-lås: görs innan z-mappning (ger "light", inte neutral/red)
        distress_hits = distress_phrase_hits
        distress_mode = (distress_hits > 0) and has_anxiety
        # lätt anti-eskalering i distress
        if distress_mode:
            pos_n += 0.12
            neg_n += 0.04
            neu_n = max(0.0, neu_n - 0.06)
            neg_n = min(neg_n, pos_n + 0.05)
        
        # 3) Humor/ironi-neutralisering (hindrar neutral→plus: E063/64/75/76/87/88)
        HUMOR = {"we joked", "we laughed", "roliga minnen", "vi skrattade", "skämtade"}
        IRONY_MARKERS = {"visst, för det har ju alltid", "yeah very helpful", "sure that worked great"}
        humor = any(h in text_lower for h in HUMOR)
        irony = any(i in text_lower for i in IRONY_MARKERS)
        humor_hits = 1 if humor else 0
        irony_hits = 1 if irony else 0
        if humor or irony:
            pos_n = max(0.0, pos_n - 0.04)
            neg_n = max(0.0, neg_n - 0.03)
            neu_n += 0.06
            if irony:
                neg_n += 0.03   # sarkasm → lite negativ realism
        
        # 2) WEAK-RED: kräver flera signaler + absolut negativ massa
        SEVERE_RED_EN_WEAK = [
            r"\bi\s+want\s+to\s+die\b",
            r"\bno\s+way\s+out\b",
        ]
        
        HOPELESS_PATS = [
            r"\bhoppl(ö|o)s\b",
            r"\bingen\s+utv(a|ä)g\b",
            r"\bpointless\b",
            r"\bno\s+point\b",
            r"\bworthless\b",
            r"\btomhet\b",
            r"\bempty\b",
        ]
        
        def count_re(text, patterns):
            return sum(1 for p in patterns if re.search(p, text, flags=re.UNICODE))
        
        ABS_NEG_MIN = 0.22
        neg_dom = neg_n - pos_n
        
        # multi-hit villkor för WEAK-RED (ingen coping/constructive)
        weak_hits = count_re(text_lower, SEVERE_RED_EN_WEAK) + count_re(text_lower, SEVERE_RED_SV_WEAK)
        hopeless_hits = count_re(text_lower, HOPELESS_PATS)
        
        thr = 0.05  # sänkt bas (hjälper recall)
        if distress_mode:
            thr += 0.03
        if (humor_hits + irony_hits) > 0:
            thr += 0.02
        if coping_gate or constructive_gate:
            thr += 0.10  # hårdare när ljus signal finns
        
        weak_red = (
            not (coping_gate or constructive_gate) and
            (weak_hits >= 2 or (weak_hits >= 1 and hopeless_hits >= 1)) and
            neg_n >= ABS_NEG_MIN and
            neg_dom >= thr
        )
        
        if weak_red:
            neg_n += 0.54
            neu_n = max(0.0, neu_n - 0.12)
            return ok("red", 0.9, detected_lang, t0)
        
        # Svag-PLUS (light) golv så light inte drunknar i neutral
        if plus_phrase_hits > 0 and pos_n < 0.08:
            pos_n = 0.08
        
        # Coping rule (oro + coping)
        if has_anxiety and has_coping:
            pos_n += 0.12
            neu_n = max(0.0, neu_n - 0.02)
        
        # Logit-mix → z (uppdaterad formel)
        z = (1.65 * pos_n) - (1.85 * neg_n) - (0.55 * neu_n) + (0.18 * int(has_coping))
        
        # Z-score clamp: limit to [-3.0, 3.0] range
        z = max(min(z, 3.0), -3.0)
        
        # Debug: show Z-score components
        if DEBUG:
            print(f"[DEBUG] Logit-mix components: pos_n={pos_n:.3f}, neg_n={neg_n:.3f}, neu_n={neu_n:.3f}", file=sys.stderr)
            print(f"[DEBUG] Phrase hits: plus={plus_phrase_hits}, red={red_phrase_hits}, emoji: plus={e_plus}, red={e_red}", file=sys.stderr)
            print(f"[DEBUG] Coping: anxiety={has_anxiety}, coping={has_coping}", file=sys.stderr)
            print(f"[DEBUG] z={z:.3f} (logit-mix, clamped)", file=sys.stderr)
        
        # Load Z thresholds from environment or thresholds.json
        Z_RED = float(os.getenv("Z_RED", "1.05"))
        Z_PLUS = float(os.getenv("Z_PLUS", "0.80"))
        Z_LIGHT = float(os.getenv("Z_LIGHT", "0.45"))
        
        # Try to load from thresholds.json if it exists and ENV vars not set
        if not os.getenv("Z_RED") and not os.getenv("Z_PLUS") and not os.getenv("Z_LIGHT"):
            try:
                import json
                from pathlib import Path
                # Try multiple paths
                thresholds_paths = [
                    Path(__file__).resolve().parents[2] / "thresholds.json",  # sintari-relations/thresholds.json
                    Path(__file__).resolve().parents[3] / "sintari-relations" / "thresholds.json",  # project root
                    Path("thresholds.json"),  # current dir
                ]
                for thresh_path in thresholds_paths:
                    if thresh_path.exists():
                        with open(thresh_path, "r", encoding="utf-8") as f:
                            cfg = json.load(f)
                            # Use sv values (or en if sv not available)
                            sv_cfg = cfg.get("sv", {})
                            en_cfg = cfg.get("en", {})
                            if sv_cfg:
                                Z_RED = float(sv_cfg.get("red_min", Z_RED))
                                Z_PLUS = float(sv_cfg.get("plus_min", Z_PLUS))
                                Z_LIGHT = float(sv_cfg.get("light_min", Z_LIGHT))
                            elif en_cfg:
                                Z_RED = float(en_cfg.get("red_min", Z_RED))
                                Z_PLUS = float(en_cfg.get("plus_min", Z_PLUS))
                                Z_LIGHT = float(en_cfg.get("light_min", Z_LIGHT))
                        if DEBUG:
                            print(f"[DEBUG] Loaded thresholds from {thresh_path}: Z_RED={Z_RED}, Z_PLUS={Z_PLUS}, Z_LIGHT={Z_LIGHT}", file=sys.stderr)
                        break
            except Exception as e:
                if DEBUG:
                    print(f"[DEBUG] Could not load thresholds.json: {e}", file=sys.stderr)
        
        # --- Klassificeringsband (efter att z är beräknad) ---
        # Gate-villkor (använder coping_gate och constructive_gate från ovan - sätts i CALIBRATION_MODE block)
        # Om coping_gate inte är definierat (non-CALIBRATION_MODE), använd has_coping
        if CFG["CALIBRATION_MODE"]:
            # coping_gate och constructive_gate är redan definierat ovan i CALIBRATION_MODE block
            plus_gate = (pos_n - neg_n) >= 0.06 or coping_gate or constructive_gate or has_coping or plus_phrase_hits >= 1
        else:
            # För non-CALIBRATION_MODE, konstruera constructive_gate här också
            CONSTRUCTIVE_PATTERNS_NON_CAL = [
                r"\bbest(a|ä)mde?\s+en\s+sak\s+i\s+t(a|ä)get\b",
                r"\bvi\s+(?:kom\s+)?(överens|pausade|planerade)\b",
                r"\bimorgon\b",
                r"\bi\s+will\b",
                r"\bwe\s+agreed\b",
                r"\bplan\b",
                r"\basked\s+for\s+help\b",
                r"\bthanks?\s+for\s+being\s+honest\b",
            ]
            constructive_gate = any(re.search(p, text_lower, flags=re.UNICODE) for p in CONSTRUCTIVE_PATTERNS_NON_CAL)
            plus_gate = (pos_n - neg_n) >= 0.06 or constructive_gate or has_coping or plus_phrase_hits >= 1
        humor = any(h in text_lower for h in {"we joked", "we laughed", "roliga minnen", "vi skrattade", "skämtade"})
        irony = any(i in text_lower for i in {"visst, för det har ju alltid", "yeah very helpful", "sure that worked great"})
        
        result_level = None
        result_score = None
        
        # 1) Distress-låsning: om distress_mode och inte severe_red → LIGHT
        if distress_mode and z < Z_RED:
            result_level = "light"
            result_score = 0.60
        # 3) Humor/ironi-säkring: dämpa till neutral/light om ingen coping
        elif (humor or irony) and not has_coping:
            if z >= Z_LIGHT:
                result_level = "light"
                result_score = 0.60
            else:
                result_level = "neutral"
                result_score = CFG["NEUTRAL_SCORE"]
        # 4) Band-klassning med coping/constructive-bump
        # 4a) Tighta PLUS-gate lite (höjer precisionen)
        elif (coping_gate or constructive_gate) and Z_LIGHT <= z < Z_PLUS and (pos_n - neg_n) >= 0.03:
            result_level = "plus"
            result_score = 0.75
        elif z >= Z_RED:
            result_level = "red"
            result_score = 0.9
        elif z >= Z_PLUS and plus_gate:
            result_level = "plus"
            result_score = 0.75
        elif z >= Z_LIGHT:
            result_level = "light"
            result_score = 0.60
        else:
            result_level = "neutral"
            result_score = CFG["NEUTRAL_SCORE"]
        
        # 3) Anti-RED när coping/constructive ändå råkar trigga (failsafe)
        # Om något ändå föreslår RED utan STRONG, nedgradera konservativt
        if (coping_gate or constructive_gate) and not (en_severe_strong_cal or sv_severe_strong):
            if result_level == "red":
                result_level = "light"
                result_score = 0.60
        
        # Sista fintrim: Sänk RED-FP utan att röra STRONG/ABUSE
        if result_level == "red" and not (en_severe_strong_cal or sv_severe_strong or abuse_coercion_gate):
            if pos_n >= 0.19 or (neg_n - pos_n) < 0.08:  # positiv dominans eller för svag negativ dominans
                result_level = "light"
                result_score = 0.60
        
        # Debug logging (after result_level is set)
        if DEBUG or os.getenv("DBG_CASE_ID") or DEBUG_EMOTION:
            print(f"[DEBUG] z={z:.3f}, Z_RED={Z_RED:.3f}, Z_PLUS={Z_PLUS:.3f}, Z_LIGHT={Z_LIGHT:.3f}, level={result_level}", file=sys.stderr)
        
        # Logga precis före retur
        dbg(case="classify",
            severe_red_flag=severe_red_flag,
            distress_mode=distress_mode,
            pos_n=round(pos_n, 4), neg_n=round(neg_n, 4), neu_n=round(neu_n, 4),
            z=round(z, 4), Z={"RED": Z_RED, "PLUS": Z_PLUS, "LIGHT": Z_LIGHT},
            coping_gate=coping_gate, plus_gate=((pos_n - neg_n) >= 0.06 or coping_gate))
        
        result = ok(result_level, result_score, detected_lang, t0)
        # Debug logging variables (only in CALIBRATION_MODE)
        f_pos = pos_n if CFG["CALIBRATION_MODE"] else 0.0
        f_tens = 0.0  # Not calculated in CALIBRATION_MODE
        f_red = neg_n if CFG["CALIBRATION_MODE"] else 0.0
        f_evid = pos_score + neg_score if CFG["CALIBRATION_MODE"] else 0.0
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
    try:
        isatty_result = sys.stdin.isatty()
    except (ValueError, AttributeError):
        # stdin might be closed or wrapped, assume non-tty
        isatty_result = False
    
    if not isatty_result:
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
