#!/usr/bin/env python3
"""Explain Emotion Agent.

This agent converts tone vectors, memory facets and salient spans into
an explanation payload without giving råd (advice).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple
import json
import os
import sys


ROOT_DIR = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT_DIR / "config" / "explain.json"


@dataclass
class ExplainConfig:
    """Runtime configuration for the explain agent."""

    style: str = "warm"
    max_len: int = 160
    levels: Tuple[str, ...] = ("brief", "standard", "deep")
    no_advice: bool = True
    sv_en_parity: bool = True
    evidence_links: bool = True
    tone_terms: Dict[str, List[str]] = field(
        default_factory=lambda: {
            "empathy": ["empati", "känslighet", "närvaro"],
            "warmth": ["värme", "mjukt", "omtanke"],
            "clarity": ["klarhet", "tydlighet", "fokus"],
        }
    )

    @staticmethod
    def load() -> "ExplainConfig":
        if CONFIG_PATH.exists():
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            return ExplainConfig(**data)
        return ExplainConfig()


CFG = ExplainConfig.load()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _style_template(style: str) -> Dict[str, str]:
    """Returnerar korta text-byggstenar baserat på stil."""
    style = (style or "warm").lower()
    if style == "neutral":
        return {
            "lead": "Jag observerar att",
            "why": "Det tyder på att",
            "reflect": "Stämmer det om vi formulerar det så här?",
        }
    if style == "coach":
        return {
            "lead": "Här är ett skifte jag ser",
            "why": "Det pekar mot",
            "reflect": "Vill du utforska vilket av dessa som känns mest sant nu?",
        }
    return {
        "lead": "Det du delar visar",
        "why": "Det verkar som",
        "reflect": "Vill du stanna upp vid den känslan en stund?",
    }


def _mk_patterns(
    tone: Tuple[float, float, float],
    risk_flags: Dict[str, Any],
    facets: Iterable[str],
) -> List[str]:
    e, w, c = tone
    facets_lower = {str(f).lower() for f in facets or []}
    pats: List[str] = []

    if e > 0.7 and w < 0.4:
        pats.append("empati utan värme → risk för utmattning")
    if c < 0.35 and ("boundary" in facets_lower or risk_flags.get("coercion")):
        pats.append("gräns-oskärpa i känsligt samtal")
    if risk_flags.get("selfharm"):
        pats.append("akut risksignal – observerad, ej tolkning")

    if not pats:
        pats.append("tolkningsmönster: värde/tempo‑missmatch")
    return pats


def _mk_why(
    tone: Tuple[float, float, float],
    spans: List[Dict[str, Any]],
    tpl: Dict[str, str],
) -> str:
    e, w, c = tone
    highlights: List[str] = []
    if e >= 0.6:
        highlights.append("hög empati")
    if w <= 0.4:
        highlights.append("lägre värme")
    if c <= 0.5:
        highlights.append("minskad klarhet")

    bit = ", ".join(highlights) if highlights else "en blandad känsla"
    evidence = ""
    if spans:
        phrases = "; ".join(s.get("text", "").strip()[:48] for s in spans[:2] if s.get("text"))
        if phrases:
            evidence = f" – (spår: {phrases})"
    return f"{tpl['lead']} {bit}. {tpl['why']} vissa delar väger tyngre idag{evidence}."


def _mk_reflection(tpl: Dict[str, str], tone: Tuple[float, float, float]) -> str:
    e, w, c = tone
    if e < 0.35:
        addon = "Vad väcker det här i dig just nu?"
    elif c < 0.4:
        addon = "Vad skulle göra läget lite tydligare för dig?"
    else:
        addon = "Vad vill du sätta ord på först?"
    return f"{tpl['reflect']} {addon}"


# ---------------------------------------------------------------------------
# Main API
# ---------------------------------------------------------------------------


def explain_emotion(
    tone_vector: Tuple[float, float, float],
    salient_spans: List[Dict[str, Any]] | None = None,
    memory_facets: List[str] | None = None,
    risk_flags: Dict[str, Any] | None = None,
    level: str = "standard",
    style: str | None = None,
    lang: str = "sv",
) -> Dict[str, Any]:
    """Returnerar en förklaring utan råd, med evidens (om aktivt)."""

    cfg = CFG
    env_style = os.getenv("EXPLAIN_STYLE")
    env_level = os.getenv("EXPLAIN_LEVEL")

    style = style or env_style or cfg.style
    level = level or env_level or cfg.levels[1]
    tpl = _style_template(style)
    spans = salient_spans or []
    facets = memory_facets or []
    risks = risk_flags or {}

    # sanitet
    e, w, c = map(_clamp01, tone_vector)
    tone = (e, w, c)

    max_len = int(cfg.max_len or 160)

    why = _mk_why(tone, spans, tpl)[:max_len]
    patterns = _mk_patterns(tone, risks, facets)
    reflection = _mk_reflection(tpl, tone)

    # nivåer
    if level == "brief":
        patterns = patterns[:1]
        reflection = reflection[:max_len]
    elif level == "deep":
        deep_append = " Om du vill kan vi lägga märke till vad som känns viktigast i detta."
        reflection = f"{reflection} {deep_append[: max_len]}".strip()

    evidence = spans[:2] if cfg.evidence_links else []

    return {
        "style": style,
        "level": level,
        "why": why,
        "patterns": patterns,
        "reflection": reflection[:max_len],
        "evidence": evidence,
        "no_advice": cfg.no_advice,
        "language": lang,
    }


if __name__ == "__main__":  # pragma: no cover - CLI entry
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw or "{}")
    except json.JSONDecodeError:
        payload = {}

    tone = tuple(payload.get("tone_vector", (0.6, 0.5, 0.5)))  # type: ignore
    spans = payload.get("salient_spans") or payload.get("spans") or []
    facets = payload.get("memory_facets") or []
    risks = payload.get("risk_flags") or {}
    level = payload.get("level") or None
    style = payload.get("style") or None
    lang = payload.get("lang") or "sv"

    result = explain_emotion(tone, spans, facets, risks, level=level, style=style, lang=lang)
    print(json.dumps(result, ensure_ascii=False))
