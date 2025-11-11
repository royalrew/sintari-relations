import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pytest

from backend.metrics.worldclass_live import log_explain_kpis
from agents.explain.explain_emotion_agent import explain_emotion


SV_SPANS = [
    {"text": "Jag försöker men vi missförstår varann."},
    {"text": "Det blir lätt fel ton."},
]
EN_SPANS = [{"text": "I try but we misunderstand each other."}]


def _has_advice(text: str) -> bool:
    bad_tokens = ["borde", "ska ", "måste", "you should", "do this", "fixa"]
    lower = text.lower()
    return any(token in lower for token in bad_tokens)


def test_explain_brief_no_advice():
    out = explain_emotion((0.7, 0.4, 0.45), SV_SPANS, ["boundary"], {}, level="brief", style="warm")
    assert out["no_advice"] is True
    blob = " ".join([out["why"], out["reflection"], " ".join(out["patterns"])])
    assert not _has_advice(blob)
    assert len(out["why"]) <= 160
    assert out["level"] == "brief"
    log_explain_kpis("test_explain_brief", out, path=ROOT / "reports" / "worldclass_live.jsonl")


@pytest.mark.parametrize("style", ["warm", "neutral", "coach"])
def test_styles_switchable(style: str):
    out = explain_emotion((0.65, 0.5, 0.5), SV_SPANS, [], {}, style=style)
    assert out["style"] == style


def test_styles_are_distinct():
    warm = explain_emotion((0.65, 0.5, 0.5), SV_SPANS, [], {}, style="warm")
    neutral = explain_emotion((0.65, 0.5, 0.5), SV_SPANS, [], {}, style="neutral")
    coach = explain_emotion((0.65, 0.5, 0.5), SV_SPANS, [], {}, style="coach")
    assert warm["why"] != neutral["why"] != coach["why"]


def test_sv_en_parity_shape():
    sv = explain_emotion((0.6, 0.4, 0.35), SV_SPANS, ["boundary"], {}, style="warm", lang="sv")
    en = explain_emotion((0.6, 0.4, 0.35), EN_SPANS, ["boundary"], {}, style="warm", lang="en")
    assert set(sv.keys()) == set(en.keys())
    assert len(sv["patterns"]) == len(en["patterns"]) == 1


def test_deep_level_adds_depth():
    out = explain_emotion((0.8, 0.3, 0.3), SV_SPANS, ["boundary"], {"coercion": True}, level="deep", style="warm")
    assert len(out["patterns"]) >= 1
    assert "evidence" in out and len(out["evidence"]) >= 1
    assert "Vill du" in out["reflection"]
    log_explain_kpis("test_explain_deep", out, path=ROOT / "reports" / "worldclass_live.jsonl")
