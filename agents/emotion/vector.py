"""
Vector utilities for emotion detection (embedding and similarity).
Mock implementation - can be replaced with real embeddings later.
"""
import hashlib
import math
from typing import Dict, List


# Simple hash-based embedding for now (deterministic)
# In production, replace with real embedding model
def embed(text: str) -> List[float]:
    """
    Create a simple embedding vector from text.
    Mock implementation using hash-based features.
    """
    if not text:
        return [0.0] * 128
    
    # Simple hash-based features
    text_lower = text.lower()
    hash_obj = hashlib.md5(text_lower.encode('utf-8'))
    hash_hex = hash_obj.hexdigest()
    
    # Convert hex to float vector (128 dims)
    vector = []
    for i in range(0, len(hash_hex), 2):
        val = int(hash_hex[i:i+2], 16) / 255.0
        vector.append(val)
    
    # Pad to 128 dimensions
    while len(vector) < 128:
        vector.append(0.0)
    
    return vector[:128]


def cosine_sim(v1: List[float], v2: List[float]) -> float:
    """
    Calculate cosine similarity between two vectors.
    
    Returns:
        Similarity score in range [0, 1]
    """
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    
    dot_product = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    similarity = dot_product / (norm1 * norm2)
    # Normalize to [0, 1] range (cosine similarity is [-1, 1])
    return (similarity + 1.0) / 2.0


def blend(score: Dict[str, float], affinity: float, weight: float) -> Dict[str, float]:
    """
    Blend score with tone affinity to stabilize tone.
    
    Args:
        score: Dictionary of metric -> float
        affinity: Tone affinity score (0.0-1.0)
        weight: Blend weight (0.0-1.0)
    
    Returns:
        Blended score dictionary
    """
    out = score.copy()
    
    # Blend all components to reduce drift, but use lower weight for warmth/clarity
    # to preserve emotion sensitivity
    for k in out.keys():
        k_lower = k.lower()
        if "empathy" in k_lower or "empathic" in k_lower:
            # Full weight for empathy (helps stabilize drift)
            out[k] = out[k] * (1.0 - weight) + affinity * weight
        elif "warmth" in k_lower or "clarity" in k_lower:
            # Lower weight for warmth/clarity to preserve sensitivity
            blend_weight = weight * 0.5  # Half weight
            out[k] = out[k] * (1.0 - blend_weight) + affinity * blend_weight
    
    return out


# Tone anchor for stabilization
TONE_ANCHOR_TEXT = "varm, lugn, empatisk, mjuk, närvarande"
TONE_ANCHOR = embed(TONE_ANCHOR_TEXT)

