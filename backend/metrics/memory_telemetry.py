#!/usr/bin/env python3
"""
Memory Telemetry - Steg 7
Logs memory usage metrics to JSON-lines files
"""

import json
import time
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional


class MemoryTelemetry:
    """Telemetry logger for memory system."""
    
    def __init__(self, log_dir: Path = None):
        self.log_dir = log_dir or Path("logs/memory")
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.log_file = self.log_dir / f"memory_{datetime.now().strftime('%Y%m%d')}.jsonl"
    
    def log_retrieve(
        self,
        used: bool,
        k: int,
        weights: Dict[str, float],
        hit_at_k: float,
        scores: List[float],
        latency_ms: float,
        items_before: int,
        items_after: int,
        errors: List[str] = None
    ):
        """Log retrieve operation."""
        entry = {
            'ts': datetime.now().isoformat(),
            'operation': 'retrieve',
            'memory': {
                'used': used,
                'k': k,
                'weights': weights,
                'hit_at_k': hit_at_k,
                'scores': scores,
            },
            'latency_ms': {
                'retrieve': latency_ms,
            },
            'items': {
                'before_cleanup': items_before,
                'after_cleanup': items_after,
            },
            'errors': errors or [],
        }
        
        self._write_entry(entry)
    
    def log_ingest(
        self,
        used: bool,
        latency_ms: float,
        pii_masked_ratio: float,
        items_before: int,
        items_after: int,
        ttl_evicted: int,
        lru_evicted: int,
        errors: List[str] = None
    ):
        """Log ingest operation."""
        entry = {
            'ts': datetime.now().isoformat(),
            'operation': 'ingest',
            'memory': {
                'used': used,
            },
            'latency_ms': {
                'ingest': latency_ms,
            },
            'items': {
                'before_cleanup': items_before,
                'after_cleanup': items_after,
            },
            'cleanup': {
                'ttl_evicted': ttl_evicted,
                'lru_evicted': lru_evicted,
            },
            'pii_masked_ratio': pii_masked_ratio,
            'errors': errors or [],
        }
        
        self._write_entry(entry)
    
    def _write_entry(self, entry: Dict[str, Any]):
        """Write entry to log file."""
        try:
            with open(self.log_file, 'a', encoding='utf-8') as f:
                f.write(json.dumps(entry, ensure_ascii=False) + '\n')
        except Exception as e:
            print(f"[Telemetry] Failed to write entry: {e}")


# Global instance
_telemetry_instance: Optional[MemoryTelemetry] = None


def get_telemetry() -> MemoryTelemetry:
    """Get global telemetry instance."""
    global _telemetry_instance
    if _telemetry_instance is None:
        _telemetry_instance = MemoryTelemetry()
    return _telemetry_instance

