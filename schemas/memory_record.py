"""
Memory Record Schema
Dialog Memory v2 - Steg 113: Brain First Plan

Pydantic schema for episodic and semantic memory records.
"""
from pydantic import BaseModel, Field
from typing import Literal, Dict, Any, Optional
from datetime import datetime


class MemoryRecord(BaseModel):
    """Single memory record for dialog context."""
    
    id: str = Field(..., description="Unique record ID (UUID or slug)")
    conv_id: str = Field(..., description="Conversation ID")
    turn: int = Field(..., ge=0, description="Turn number in conversation")
    speaker: Literal["user", "partner", "system"] = Field(..., description="Speaker role")
    text: str = Field(..., min_length=1, description="Text content (masked if PII)")
    facets: Dict[str, Any] = Field(
        default_factory=dict,
        description="Extracted facets: topics, intents, entities, affect"
    )
    tstamp_iso: str = Field(
        default_factory=lambda: datetime.now().isoformat(),
        description="ISO timestamp"
    )
    pii_masked: bool = Field(default=True, description="Whether PII has been masked")
    kind: Literal["episodic", "semantic"] = Field(default="episodic", description="Memory type")
    
    # Optional fields
    turn_distance: Optional[int] = Field(
        default=None,
        description="Distance to current turn (for recency boost)"
    )
    vector: Optional[list[float]] = Field(
        default=None,
        description="Embedding vector for semantic search"
    )
    
    def model_dump_for_storage(self) -> Dict[str, Any]:
        """Serialize for storage (JSON-safe)."""
        return self.model_dump(exclude={"vector"}, exclude_none=True)
    
    @classmethod
    def from_storage(cls, data: Dict[str, Any], vector: Optional[list[float]] = None) -> "MemoryRecord":
        """Deserialize from storage."""
        if vector:
            data["vector"] = vector
        return cls(**data)

