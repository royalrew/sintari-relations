"""
Language bridge for SV/EN parity via canonical English representation.
Ensures consistent emotion detection across languages.
"""
import sys
import json
import subprocess
from pathlib import Path
from typing import Tuple

ROOT = Path(__file__).resolve().parents[2]


def detect_language(text: str) -> str:
    """
    Detect language of text.
    Returns: "sv", "en", or "und" (undetermined)
    """
    if not text or not text.strip():
        return "en"  # Default to English
    
    # Try to use lang_detect agent if available
    try:
        lang_agent_path = ROOT / "agents" / "lang_detect" / "main.py"
        if lang_agent_path.exists():
            request = json.dumps({
                "data": {"text": text}
            }, ensure_ascii=False)
            
            result = subprocess.run(
                [sys.executable, str(lang_agent_path)],
                input=request.encode('utf-8'),
                capture_output=True,
                timeout=5,
                cwd=str(ROOT)
            )
            
            if result.returncode == 0:
                response = json.loads(result.stdout.decode('utf-8'))
                if response.get("ok") and response.get("emits"):
                    detected = response["emits"].get("lang", "en")
                    if detected in ("sv", "en"):
                        return detected
    except Exception:
        # Fallback to simple heuristic
        pass
    
    # Simple heuristic fallback
    text_lower = text.lower()
    sv_indicators = ["och", "är", "har", "jag", "du", "vi", "de", "det", "som", "för"]
    en_indicators = ["and", "is", "are", "have", "i", "you", "we", "they", "that", "for"]
    
    sv_count = sum(1 for word in sv_indicators if word in text_lower)
    en_count = sum(1 for word in en_indicators if word in text_lower)
    
    if sv_count > en_count:
        return "sv"
    elif en_count > sv_count:
        return "en"
    else:
        return "en"  # Default to English


def translate(text: str, target: str = "en") -> str:
    """
    Simple translation wrapper.
    For now, returns text as-is (mock implementation).
    In production, integrate with real translation service.
    
    Args:
        text: Text to translate
        target: Target language ("en" or "sv")
    
    Returns:
        Translated text (or original if translation fails)
    """
    if not text:
        return text
    
    # Mock implementation - return as-is for now
    # TODO: Integrate with real translation API (e.g., Google Translate, DeepL)
    # For SV->EN: Use translation service
    # For EN->SV: Use translation service
    
    # For now, we'll use a simple approach:
    # If target is EN and text is SV, return as-is (will be handled by emotion agent)
    # The key is that emotion detection should work similarly on both languages
    
    return text


def to_canonical_en(text: str) -> Tuple[str, str]:
    """
    Convert text to canonical English representation for consistent emotion detection.
    
    Args:
        text: Input text (can be SV or EN)
    
    Returns:
        Tuple of (canonical_text_en, original_lang)
    """
    original_lang = detect_language(text)
    
    if original_lang.lower().startswith("sv"):
        # Translate SV to EN for canonical processing
        canonical_text = translate(text, target="en")
        return canonical_text, "sv"
    
    # Already English
    return text, "en"


def from_canonical(text_en: str, original_lang: str) -> str:
    """
    Convert canonical English text back to original language.
    
    Args:
        text_en: Canonical English text
        original_lang: Original language ("sv" or "en")
    
    Returns:
        Text in original language
    """
    if original_lang == "sv":
        return translate(text_en, target="sv")
    
    return text_en

