from __future__ import annotations

import json
import pathlib
from typing import Dict, Any, Optional
from datetime import datetime, timedelta

ROOT = pathlib.Path(__file__).resolve().parents[2]
METRICS_DIR = ROOT / "runs" / "metrics"
METRICS_DIR.mkdir(parents=True, exist_ok=True)

COST_LOG = METRICS_DIR / "cost_guard.log"
WEEKLY_LOG = METRICS_DIR / "weekly_budget.json"


def load_weekly_totals() -> Dict[str, Any]:
    """Load weekly budget totals."""
    if WEEKLY_LOG.exists():
        try:
            with open(WEEKLY_LOG, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"total_spent": 0.0, "week_start": datetime.now().isoformat()}


def save_weekly_totals(data: Dict[str, Any]) -> None:
    """Save weekly budget totals."""
    try:
        with open(WEEKLY_LOG, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass


def log_cost(run_id: str, cost_usd: float, tier: str, metadata: Dict[str, Any]) -> None:
    """Log cost to file."""
    try:
        with open(COST_LOG, "a", encoding="utf-8") as f:
            log_entry = {
                "timestamp": datetime.now().isoformat(),
                "run_id": run_id,
                "cost_usd": cost_usd,
                "tier": tier,
                "metadata": metadata,
            }
            f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")
    except Exception:
        pass


def allow(
    usage: Dict[str, Any],
    budget_usd: Optional[float] = None,
    weekly_budget_usd: Optional[float] = None,
    run_id: Optional[str] = None,
    tier: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Check if usage is within budget limits.
    
    Args:
        usage: Current usage dict with 'cost_usd'
        budget_usd: Per-run budget limit (defaults to RUN_LIMIT_USD env var or 0.10)
        weekly_budget_usd: Weekly budget limit (defaults to WEEKLY_LIMIT_USD env var or 10.0)
        run_id: Run ID for logging
        tier: Tier name for logging
    
    Returns:
        {
            "ok": bool,
            "spent": float,
            "budget": float,
            "weekly_spent": float,
            "weekly_budget": float,
            "action": "allow" | "deny" | "escalate"
        }
    """
    import os
    
    # Priority: Explicit params > env vars > defaults
    if budget_usd is not None:
        run_limit = budget_usd
    else:
        run_limit = float(os.getenv("RUN_LIMIT_USD", "0.10"))
    
    if weekly_budget_usd is not None:
        weekly_limit = weekly_budget_usd
    else:
        weekly_limit = float(os.getenv("WEEKLY_LIMIT_USD", "10.0"))
    
    spent = float(usage.get("cost_usd", 0))
    
    # Check per-run budget
    run_ok = spent <= run_limit
    
    # Check weekly budget (only if weekly_budget_usd is set)
    weekly_ok = True
    weekly_spent = 0.0
    weekly_data = None
    
    if weekly_budget_usd is not None:
        weekly_data = load_weekly_totals()
        weekly_start = datetime.fromisoformat(weekly_data.get("week_start", datetime.now().isoformat()))
        
        # Reset if new week
        if datetime.now() - weekly_start > timedelta(days=7):
            weekly_data = {"total_spent": 0.0, "week_start": datetime.now().isoformat()}
        
        weekly_spent = weekly_data.get("total_spent", 0.0)
        weekly_ok = weekly_spent + spent <= weekly_limit
    
    # Determine action
    if not run_ok:
        action = "deny"
    elif weekly_budget_usd is not None and not weekly_ok:
        action = "escalate"
    else:
        action = "allow"
    
    # Log block events to separate file (Fas 3 requirement)
    if action != "allow" and run_id:
        block_log_file = METRICS_DIR / "cost_guard_blocks.jsonl"
        try:
            with open(block_log_file, "a", encoding="utf-8") as f:
                block_entry = {
                    "timestamp": datetime.now().isoformat(),
                    "run_id": run_id,
                    "tier": tier or "unknown",
                    "spent": spent,
                    "run_limit": run_limit,
                    "weekly_spent": weekly_spent,
                    "weekly_limit": weekly_limit if weekly_budget_usd is not None else None,
                    "action": action,
                }
                f.write(json.dumps(block_entry, ensure_ascii=False) + "\n")
        except Exception:
            pass
    
    # Log if run_id provided
    if run_id:
        log_cost(run_id, spent, tier or "unknown", usage)
        
        # Update weekly totals if allowed and weekly budget is active
        if action == "allow" and weekly_budget_usd is not None and weekly_data is not None:
            weekly_data["total_spent"] = weekly_spent + spent
            save_weekly_totals(weekly_data)
    
    return {
        "ok": run_ok and weekly_ok,
        "spent": spent,
        "budget": run_limit,
        "weekly_spent": weekly_spent,
        "weekly_budget": weekly_limit,
        "action": action,
    }


__all__ = ["allow", "log_cost", "load_weekly_totals"]


