from __future__ import annotations

from typing import Dict, Any


def allow(usage: Dict[str, Any], budget_usd: float) -> Dict[str, Any]:
    spent = float(usage.get("cost_usd", 0))
    ok = spent <= budget_usd
    return {"ok": ok, "spent": spent, "budget": budget_usd}


__all__ = ["allow"]


