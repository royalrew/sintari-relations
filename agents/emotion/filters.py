"""
Stateful filtering for tone vector stabilization.
Implements median pre-filter, EMA smoothing, and slew-rate limiting.
"""
from typing import List, Tuple, Dict


def median3(history: List[Tuple[float, float, float]], current: Tuple[float, float, float]) -> Tuple[float, float, float]:
    """
    Median filter over 3 samples (history[-2], history[-1], current).
    Removes spikes while preserving signal shape.
    
    Args:
        history: List of previous tone vectors
        current: Current tone vector (empathy, warmth, clarity)
    
    Returns:
        Median-filtered tone vector
    """
    if len(history) >= 2:
        a = history[-2]
        b = history[-1]
        c = current
        buf = [
            sorted([a[0], b[0], c[0]])[1],  # Median of empathy values
            sorted([a[1], b[1], c[1]])[1],  # Median of warmth values
            sorted([a[2], b[2], c[2]])[1],  # Median of clarity values
        ]
        return (buf[0], buf[1], buf[2])
    return current


def ema(prev: Tuple[float, float, float], cur: Tuple[float, float, float], alpha: Tuple[float, float, float] = (0.35, 0.22, 0.22)) -> Tuple[float, float, float]:
    """
    Exponential Moving Average per dimension.
    
    Args:
        prev: Previous tone vector
        cur: Current tone vector
        alpha: Smoothing factor per dimension (empathy, warmth, clarity)
               Higher alpha = more responsive, lower alpha = more stable
    
    Returns:
        EMA-smoothed tone vector
    """
    return tuple(prev[i] * (1 - alpha[i]) + cur[i] * alpha[i] for i in range(3))


def slew_limit(prev: Tuple[float, float, float], cur: Tuple[float, float, float], dmax: Tuple[float, float, float] = (0.035, 0.025, 0.025)) -> Tuple[float, float, float]:
    """
    Slew-rate limiting: maximum allowed change per step.
    
    Args:
        prev: Previous tone vector
        cur: Current tone vector
        dmax: Maximum delta per dimension (empathy, warmth, clarity)
              With dmax=(0.035, 0.025, 0.025), theoretical max drift ≈ 0.043
    
    Returns:
        Slew-limited tone vector
    """
    out = []
    for i in range(3):
        lo = prev[i] - dmax[i]
        hi = prev[i] + dmax[i]
        out.append(min(max(cur[i], lo), hi))
    return tuple(out)


def adaptive_alpha(conf: float) -> Tuple[float, float, float]:
    """
    Adaptive EMA alpha based on confidence.
    Lower confidence (uncertainty) → lower alpha (more smoothing).
    
    Args:
        conf: Confidence score [0, 1]
    
    Returns:
        Adaptive alpha tuple (empathy, warmth, clarity)
    """
    base = (0.35, 0.22, 0.22)
    k = 0.5 + 0.5 * conf  # Scale factor: 0.5..1.0
    return tuple(a * k for a in base)


def big_change_signal(prev_feats: Dict[str, float], cur_feats: Dict[str, float]) -> bool:
    """
    Detect if there's a big change in features (change-point).
    If true, allow larger step in slew_limit.
    
    Args:
        prev_feats: Previous feature scores (worry, humor, irony)
        cur_feats: Current feature scores
    
    Returns:
        True if big change detected
    """
    return (
        abs(cur_feats.get("worry", 0) - prev_feats.get("worry", 0)) > 0.40
        or abs(cur_feats.get("irony", 0) - prev_feats.get("irony", 0)) > 0.35
        or abs(cur_feats.get("humor", 0) - prev_feats.get("humor", 0)) > 0.45
    )

