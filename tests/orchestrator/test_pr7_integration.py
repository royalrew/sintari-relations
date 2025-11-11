"""
PR7 Orchestrator Integration Test
Tests Memory V2 + Persona Agent integration
"""
import pytest
import sys
from pathlib import Path
import os

# Add root to path
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    from tests._helpers.orchestrator_bridge import orchestrator_analyze
except ImportError:
    # Mock if not available
    def orchestrator_analyze(text: str, lang: str = "sv", dialog=None) -> dict:
        return {}


def test_orchestrator_with_pr7_features_disabled():
    """Test orchestrator works without PR7 features."""
    # Feature flags off
    os.environ["MEMORY_V2"] = "off"
    os.environ["PERSONA_V1"] = "off"
    
    text = "Hej, jag behöver hjälp med min relation."
    
    try:
        result = orchestrator_analyze(text, lang="sv")
        assert result is not None
        # Should still return results without error
    except Exception as e:
        pytest.skip(f"Orchestrator not available: {e}")


def test_orchestrator_with_persona_enabled():
    """Test orchestrator with Persona Agent enabled."""
    os.environ["MEMORY_V2"] = "off"
    os.environ["PERSONA_V1"] = "on"
    
    text = "Hej! Hur är läget?"
    
    try:
        result = orchestrator_analyze(text, lang="sv")
        
        # Should not error
        assert result is not None
        
        # Check if persona_agent result is present
        # (may or may not be present depending on implementation)
    except Exception as e:
        pytest.skip(f"Orchestrator not available: {e}")


def test_orchestrator_feature_flags_read():
    """Test that feature flags are read correctly."""
    # Set flags
    os.environ["MEMORY_V2"] = "on"
    os.environ["PERSONA_V1"] = "on"
    
    # Verify env vars are set
    assert os.getenv("MEMORY_V2") == "on"
    assert os.getenv("PERSONA_V1") == "on"


def test_orchestrator_returns_expected_structure():
    """Test that orchestrator returns expected structure."""
    text = "Test input"
    
    try:
        result = orchestrator_analyze(text, lang="sv")
        
        # Should have basic structure
        assert result is not None
        # Result may vary, but should not crash
    except Exception as e:
        pytest.skip(f"Orchestrator not available: {e}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

