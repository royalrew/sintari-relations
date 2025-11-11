"""
Minimum Persona Agent Tests
PR4: Persona Agent validation

Tests latency ≤ 1ms and tone stability
"""
import pytest
import sys
import time
from pathlib import Path

# Add root to path
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agents.persona.persona_agent import detect_persona, analyze
from schemas.persona_profile import PersonaProfile


def test_persona_latency_under_1ms():
    """Test that persona detection is ≤ 1ms."""
    text = "Hej! Hur är läget?"
    
    start = time.perf_counter()
    profile = detect_persona(text)
    elapsed_ms = (time.perf_counter() - start) * 1000
    
    assert elapsed_ms <= 1.0, f"Latency {elapsed_ms:.2f}ms > 1ms"
    assert isinstance(profile, PersonaProfile)


def test_persona_informal_detection():
    """Test informal language detection."""
    profile = detect_persona("Hej du! Hur går det?", lang="sv")
    
    assert profile.formality < 0.5, "Should detect informal"
    assert profile.lang == "sv"


def test_persona_formal_detection():
    """Test formal language detection."""
    profile = detect_persona("God morgon, herr Andersson. Ni ser utmärkt ut.", lang="sv")
    
    assert profile.formality > 0.5, "Should detect formal"
    assert profile.lang == "sv"


def test_persona_warmth_emoji():
    """Test warmth detection from emojis."""
    profile = detect_persona("Hej! 😊 Hur är det?")
    
    assert profile.warmth > 0.7, "Should detect warmth from emoji"


def test_persona_humor_detection():
    """Test humor detection."""
    profile = detect_persona("Haha, det var roligt! 😂")
    
    assert profile.humor > 0.5, "Should detect humor"


def test_persona_indirectness():
    """Test indirectness detection."""
    profile = detect_persona("Tja... hur skulle du... vilja...?")
    
    assert profile.directness < 0.7, "Should detect indirectness"


def test_persona_analyze_api():
    """Test analyze() API."""
    result = analyze("Hej du!")
    
    assert result["ok"] is True
    assert "persona_hints" in result
    assert "confidence" in result


def test_persona_lang_detection():
    """Test automatic language detection."""
    profile_sv = detect_persona("Hej, hur är läget?", lang="auto")
    profile_en = detect_persona("Hey, how are you?", lang="auto")
    
    assert profile_sv.lang == "sv"
    assert profile_en.lang == "en"


def test_persona_batch_latency():
    """Test batch latency for multiple requests."""
    texts = [
        "Hej du!",
        "God morgon, herr Andersson.",
        "LOL, det var skojigt! 😂",
        "Tja... hur gick det?",
        "Hey, what's up?"
    ]
    
    start = time.perf_counter()
    profiles = [detect_persona(text) for text in texts]
    elapsed_ms = (time.perf_counter() - start) * 1000
    
    # Should be fast (< 5ms for 5 requests)
    assert elapsed_ms < 5.0, f"Batch latency {elapsed_ms:.2f}ms > 5ms"
    assert len(profiles) == 5


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

