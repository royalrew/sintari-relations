"""
Model Router for 3-tier pyramid routing (80/15/5 distribution).

Routes cases to appropriate tier (base/mid/top) based on:
- Initial confidence estimation
- Complexity heuristics
- Safety requirements
- Cost optimization
"""

from __future__ import annotations

import json
import pathlib
import os
import re
import hashlib
from typing import Dict, Any, Literal, Optional

# Load routing configuration
ROOT = pathlib.Path(__file__).resolve().parents[3]
CONFIG_PATH = ROOT / "config" / "model_routing.json"

# Top-tier counter för minsta-kvot (per block)
_top_counter = {"count": 0}


def load_config() -> Dict[str, Any]:
    """Load routing configuration."""
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    # Default fallback config
    return {
        "tiers": {
            "base": {"confidence_min": 0.0, "confidence_max": 0.80},
            "mid": {"confidence_min": 0.80, "confidence_max": 0.95},
            "top": {"confidence_min": 0.95, "confidence_max": 1.0},
        },
        "routing_rules": {
            "promotion_threshold": 0.85,
            "safety_first": True,
        },
    }


def estimate_confidence(
    text: str,
    lang: str = "sv",
    has_dialog: bool = False,
    complexity_hints: Optional[Dict[str, Any]] = None,
) -> float:
    """
    Estimate initial confidence for routing decision.
    
    Returns confidence score (0.0-1.0) indicating how confident
    we can be that base tier will handle this case successfully.
    
    HIGH confidence (0.8-1.0) = simple case = base tier
    MEDIUM confidence (0.6-0.8) = medium case = mid tier  
    LOW confidence (0.0-0.6) = complex case = top tier
    """
    if not text or len(text.strip()) < 10:
        return 0.85  # High confidence for very short input (simple)
    
    # Base confidence level (höjd för mer Base, matchar BASE_THR=0.83)
    confidence = 0.83
    
    # Adjust based on text length (longer = more complex = lower confidence)
    text_len = len(text)
    if text_len > 200:
        confidence -= 0.23  # Very long = complex (mild sänkt för mer Base)
    elif text_len > 100:
        confidence -= 0.15  # Medium = somewhat complex (mild sänkt för mer Base)
    elif text_len < 50:
        confidence += 0.07  # Very short = simpler (up to ~0.89 -> base tier)
    
    # Små signaler mot mid
    if '\n' in text:  # fler rader = mer komplext
        confidence -= 0.02
    if text.count('?') >= 1:
        confidence -= 0.02
    
    # Keyword-based complexity detection
    text_lower = text.lower()
    complex_keywords = [
        "överväger", "lämna", "konflikter", "reparera", "djupa problem",
        "förtroende", "kommunikation", "tvingad", "kontrollerande", "missförstådd",
        "ignorerar", "ekonomi", "framtiden"
    ]
    complex_count = sum(1 for kw in complex_keywords if kw in text_lower)
    if complex_count >= 3:
        confidence -= 0.27  # Very complex keywords (mild sänkt)
    elif complex_count >= 2:
        confidence -= 0.13  # Some complex keywords (mild sänkt)
    elif complex_count >= 1:
        confidence -= 0.05  # A few complex keywords (mild sänkt)
    
    # Dialog reduces confidence (more complex)
    if has_dialog:
        confidence -= 0.22  # Lättade straff
    
    # Complexity hints from other agents
    if complexity_hints:
        if complexity_hints.get("high_risk", False):
            confidence -= 0.40  # High risk = much lower confidence
        if complexity_hints.get("ambiguous", False):
            confidence -= 0.20
        if complexity_hints.get("cultural_context", False):
            confidence -= 0.15
    
    # Language: Swedish has better coverage (higher confidence)
    if lang != "sv":
        confidence -= 0.10  # Lättade straff
    
    # Ensure confidence is in valid range
    return max(0.0, min(1.0, confidence))


def complexity_flags(text: str, lang: str = "sv") -> Dict[str, Any]:
    """
    Detect complexity signals for epsilon-promotion to top tier.
    
    Returns flags indicating if case should be considered complex.
    """
    text_len = len(text)
    lines = text.count("\n") + 1
    
    # Rough NER count (capitalized words that might be names/entities)
    words = text.split()
    capitalized = [w for w in words if len(w) > 2 and w[0].isupper() and not w.isupper()]
    ents = len(set(capitalized))  # Unique capitalized words
    
    # Conflict/stark affekt keywords
    has_conflict = bool(re.search(
        r"(gräl|bråk|hot|svek|otrohet|abuse|threat|gaslight|manipulera|kontrollerande)",
        text, re.IGNORECASE
    ))
    
    # Mixed language (Swedish + English)
    mixed_lang = bool(re.search(
        r"[A-Za-z].*[åäöÅÄÖ]|[åäöÅÄÖ].*[A-Za-z]",
        text
    ))
    
    # Komplexitetssignaler (generösare för att fånga fler golden cases):
    # - Väldigt lång text (>280 chars, ner från 500)
    # - Många rader (≥3, ner från 4)
    # - Många entiteter (≥3, ner från 4)
    # - Konflikt/stark affekt
    # - Blandade språk
    is_complex = (
        text_len > 300 or   # Höjd från 280
        lines >= 4 or       # Höjd från 3
        ents >= 4 or        # Höjd från 3
        has_conflict or
        mixed_lang
    )
    
    return {
        "is_complex": is_complex,
        "text_len": text_len,
        "lines": lines,
        "entities": ents,
        "has_conflict": has_conflict,
        "mixed_lang": mixed_lang,
    }


def route_case(
    text: str,
    lang: str = "sv",
    has_dialog: bool = False,
    complexity_hints: Optional[Dict[str, Any]] = None,
    safety_flags: Optional[Dict[str, Any]] = None,
    previous_tier: Optional[str] = None,
    previous_failed: bool = False,
) -> Dict[str, Any]:
    """
    Route a case to appropriate tier.
    
    Args:
        text: Input text
        lang: Language code
        has_dialog: Whether input contains dialog structure
        complexity_hints: Hints from other agents about complexity
        safety_flags: Safety-related flags (if present, always route to top)
        previous_tier: Previous tier if this is a retry
        previous_failed: Whether previous tier failed
    
    Returns:
        {
            "tier": "base" | "mid" | "top",
            "confidence": float,
            "reason": str,
            "model": str,
            "cost_multiplier": float
        }
    """
    config = load_config()
    tiers = config["tiers"]
    rules = config.get("routing_rules", {})
    
    # HEDERSFLAGGA FRÅN BRIDGE/NODE (LÄNGST UPP - innan safety/prev-fail)
    # Säkerställ att inget senare kan "promota ner" till base/mid
    if isinstance(complexity_hints, dict) and complexity_hints.get("__forceTop"):
        import sys
        sys.stderr.write(f"[FORCE-TOP-PY] Early return: tier=top for text: {text[:60]}...\n")
        sys.stderr.flush()
        return {
            "tier": "top",
            "confidence": 0.99,
            "reason": "forceTop_hint",
            "model": tiers["top"].get("model", "gpt-4-turbo-preview"),
            "cost_multiplier": tiers["top"].get("cost_multiplier", 10.0),
            "complexity_flags": {"forced": True},
        }
    
    # Fallback: env var (för testing)
    if os.getenv("ROUTER_FORCE_TOP") == "1":
        return {
            "tier": "top",
            "confidence": 0.99,
            "reason": "forceTop_env",
            "model": tiers["top"].get("model", "gpt-4-turbo-preview"),
            "cost_multiplier": tiers["top"].get("cost_multiplier", 10.0),
        }
    
    # Safety first: Always route to top if safety concerns
    if safety_flags:
        safety_level = safety_flags.get("level", "OK")
        if safety_level in ("RED", "WARN"):
            return {
                "tier": "top",
                "confidence": 1.0,
                "reason": f"safety_first: {safety_level}",
                "model": tiers["top"].get("model", "gpt-4-turbo-preview"),
                "cost_multiplier": tiers["top"].get("cost_multiplier", 10.0),
            }
    
    # If previous tier failed, promote
    if previous_failed and previous_tier:
        tier_order = ["base", "mid", "top"]
        try:
            current_idx = tier_order.index(previous_tier)
            if current_idx < len(tier_order) - 1:
                next_tier = tier_order[current_idx + 1]
                return {
                    "tier": next_tier,
                    "confidence": 1.0,
                    "reason": "promotion_after_failure",
                    "model": tiers[next_tier].get("model", "gpt-4-turbo-preview"),
                    "cost_multiplier": tiers[next_tier].get("cost_multiplier", 10.0),
                }
        except ValueError:
            pass  # Invalid tier, fall through
    
    # Estimate confidence
    estimated_conf = estimate_confidence(text, lang, has_dialog, complexity_hints)
    
    # Route based on confidence thresholds
    # HIGH confidence (>=0.80) = simple case = base tier
    # MEDIUM confidence (0.65-0.80) = medium case = mid tier
    # LOW confidence (<0.65) = complex case = top tier
    # FIX: Använd env vars eller hårdkodade trösklar (config har confidence_min=0.0 vilket är fel)
    BASE_THR = float(os.getenv("ROUTER_BASE_THR", "0.80"))
    MID_THR = float(os.getenv("ROUTER_MID_THR", "0.65"))
    base_min = BASE_THR  # Spara för near-base nudge
    
    if estimated_conf >= BASE_THR:  # >= 0.80 -> base tier
        tier = "base"
        reason = f"high_confidence_base: {estimated_conf:.2f}"
    elif estimated_conf >= MID_THR:  # 0.65-0.80 -> mid tier
        tier = "mid"
        reason = f"medium_confidence_mid: {estimated_conf:.2f}"
    else:  # < 0.65 -> top tier
        tier = "top"
        reason = f"low_confidence_top: {estimated_conf:.2f}"
    
    # Near-base nudge: Begränsa till extremt korta, okomplicerade cases
    flags = complexity_flags(text, lang)  # Hämta flags för is_complex-check
    if tier == "mid" and (base_min - estimated_conf) <= 0.01 and not flags.get("is_complex", False) and flags.get("text_len", 0) < 80:
        tier = "base"
        reason = f"near_base_nudge: {estimated_conf:.2f}"
    
    # EPSILON-PROMOTION: Promotera komplexa fall till top tier med låg sannolikhet
    # Säkerställer 4-6% top utan att förlita sig på slump i datat
    # Deterministisk via hash: ger stabil ~ε-andel även för små batcher
    exploration = config.get("exploration", {})
    epsilon_top = float(os.getenv("ROUTER_EPS_TOP", str(exploration.get("epsilon_top", 0.04))))
    
    # "Near-top" fallback: STÄNGD AV för stabilt <6% top
    near_top = False
    
    # Säker epsilon: endast komplexa fall med tillräcklig längd (inga triviala kortsvar)
    eligible_for_epsilon = flags["is_complex"] and flags.get("text_len", 0) >= 220
    
    # Extra spärr: promota endast komplexa, långa cases till top
    if tier in ("base", "mid") and eligible_for_epsilon:
        # Deterministisk "random": hash av text → [0,1) för stabil promotion även i små batcher
        h = int(hashlib.blake2b(text.encode("utf-8"), digest_size=8).hexdigest(), 16)
        r = (h % 10_000) / 10_000.0
        
        if r < epsilon_top:
            tier = "top"
            reason = f"epsilon_promotion_complex:{estimated_conf:.2f}"
    
    # Minsta-top-kvot per block (garanterar ~3% per 100 utan att överskrida guard)
    # NOTE: Denna logik flyttas till Node (forceTop-hint) eftersom Python spawnas per case
    # Behålls här som fallback men primär logik är i batch_run_sample.mjs
    
    result = {
        "tier": tier,
        "confidence": estimated_conf,
        "reason": reason,
        "model": tiers[tier].get("model", "gpt-3.5-turbo"),
        "cost_multiplier": tiers[tier].get("cost_multiplier", 1.0),
        "complexity_flags": flags,  # Include for debugging
    }
    
    # Log när tier=="top" och forced (för debugging)
    if tier == "top" and ("forceTop" in reason.lower() or "forceTop" in str(complexity_hints).lower()):
        import sys
        sys.stderr.write(f"[FORCE-TOP-PY] {reason}\n")
        sys.stderr.flush()
    
    return result


def get_distribution_stats(routing_history: list[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Calculate actual distribution from routing history.
    
    Args:
        routing_history: List of routing decisions
        
    Returns:
        {
            "base": float,  # Percentage
            "mid": float,
            "top": float,
            "total": int
        }
    """
    if not routing_history:
        return {"base": 0.0, "mid": 0.0, "top": 0.0, "total": 0}
    
    counts = {"base": 0, "mid": 0, "top": 0}
    for decision in routing_history:
        tier = decision.get("tier", "base")
        if tier in counts:
            counts[tier] += 1
    
    total = sum(counts.values())
    if total == 0:
        return {"base": 0.0, "mid": 0.0, "top": 0.0, "total": 0}
    
    return {
        "base": counts["base"] / total * 100,
        "mid": counts["mid"] / total * 100,
        "top": counts["top"] / total * 100,
        "total": total,
    }


__all__ = ["route_case", "estimate_confidence", "get_distribution_stats", "load_config"]

