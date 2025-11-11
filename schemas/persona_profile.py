"""
Persona Profile Schema
PR4: Persona Agent (rule-based v1)

Defines user persona characteristics for tone/tempo adjustments
"""
from pydantic import BaseModel, Field
from typing import Literal, Dict, Any, Optional


class PersonaProfile(BaseModel):
    """User persona characteristics."""
    
    lang: Literal["sv", "en"] = Field(default="sv", description="Language preference")
    formality: float = Field(
        default=0.3,
        ge=0.0,
        le=1.0,
        description="Formality level (0=casual, 1=formal)"
    )
    warmth: float = Field(
        default=0.8,
        ge=0.0,
        le=1.0,
        description="Warmth level (0=cold, 1=warm)"
    )
    directness: float = Field(
        default=0.8,
        ge=0.0,
        le=1.0,
        description="Directness level (0=indirect, 1=direct)"
    )
    humor: float = Field(
        default=0.2,
        ge=0.0,
        le=1.0,
        description="Humor preference (0=serious, 1=humorous)"
    )
    
    # Optional metadata
    confidence: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Confidence in persona profile"
    )
    
    def model_dump_hints(self) -> Dict[str, Any]:
        """Return persona hints for tone adjustment."""
        return {
            "formality": self.formality,
            "warmth": self.warmth,
            "directness": self.directness,
            "humor": self.humor,
            "lang": self.lang
        }

