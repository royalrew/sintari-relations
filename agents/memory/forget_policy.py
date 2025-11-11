"""
Forget Policy Module - Steg 3
LRU + TTL eviction policies for memory management
"""

import json
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from pathlib import Path


class ForgetPolicy:
    """
    Manages memory eviction using TTL and LRU policies.
    """
    
    def __init__(self, storage_path: Path):
        self.storage_path = storage_path
        self.store: Dict[str, Dict[str, Any]] = {}
        self._load_store()
    
    def _load_store(self):
        """Load store from disk."""
        store_file = self.storage_path / "memory_store.json"
        if store_file.exists():
            try:
                with open(store_file, 'r', encoding='utf-8') as f:
                    self.store = json.load(f)
            except Exception as e:
                print(f"[ForgetPolicy] Failed to load store: {e}")
                self.store = {}
    
    def _save_store(self):
        """Save store to disk."""
        store_file = self.storage_path / "memory_store.json"
        store_file.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(store_file, 'w', encoding='utf-8') as f:
                json.dump(self.store, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[ForgetPolicy] Failed to save store: {e}")
    
    def forget_expired(self, now_ts: Optional[datetime] = None) -> int:
        """
        Remove expired items based on TTL.
        
        Args:
            now_ts: Current timestamp (default: now)
        
        Returns:
            Number of items removed
        """
        if now_ts is None:
            now_ts = datetime.now()
        
        removed_count = 0
        expired_keys = []
        
        for key, item in self.store.items():
            ttl_days = item.get('ttl_days', 90)
            tstamp_iso = item.get('tstamp_iso', '')
            
            if not tstamp_iso:
                continue
            
            try:
                item_dt = datetime.fromisoformat(tstamp_iso.replace('Z', '+00:00'))
                age_days = (now_ts - item_dt.replace(tzinfo=None)).total_seconds() / 86400.0
                
                if age_days > ttl_days:
                    expired_keys.append(key)
            except Exception:
                # Invalid timestamp, remove it
                expired_keys.append(key)
        
        for key in expired_keys:
            self.store.pop(key, None)
            removed_count += 1
        
        if removed_count > 0:
            self._save_store()
        
        return removed_count
    
    def touch(self, item_id: str):
        """
        Update last_access timestamp for an item.
        
        Args:
            item_id: Item ID to touch
        """
        if item_id in self.store:
            self.store[item_id]['last_access'] = datetime.now().isoformat()
            self._save_store()
    
    def enforce_cap(self, thread_id: str, cap: int = 500) -> int:
        """
        Enforce LRU cap for a thread.
        
        Args:
            thread_id: Thread ID
            cap: Maximum number of items per thread
        
        Returns:
            Number of items removed
        """
        # Filter items for this thread
        thread_items = [
            (key, item) for key, item in self.store.items()
            if item.get('conv_id') == thread_id
        ]
        
        if len(thread_items) <= cap:
            return 0
        
        # Sort by last_access (oldest first)
        thread_items.sort(key=lambda x: x[1].get('last_access', '1970-01-01'))
        
        # Remove oldest items
        to_remove = len(thread_items) - cap
        removed_count = 0
        
        for key, _ in thread_items[:to_remove]:
            self.store.pop(key, None)
            removed_count += 1
        
        if removed_count > 0:
            self._save_store()
        
        return removed_count
    
    def cleanup(self, now_ts: Optional[datetime] = None) -> Dict[str, int]:
        """
        Run full cleanup (TTL + LRU).
        
        Args:
            now_ts: Current timestamp
        
        Returns:
            Dict with cleanup stats
        """
        if now_ts is None:
            now_ts = datetime.now()
        
        # TTL cleanup
        ttl_evicted = self.forget_expired(now_ts)
        
        # LRU cleanup per thread
        thread_ids = set(item.get('conv_id') for item in self.store.values() if item.get('conv_id'))
        lru_evicted = 0
        
        for thread_id in thread_ids:
            lru_evicted += self.enforce_cap(thread_id, cap=500)
        
        return {
            'ttl_evicted': ttl_evicted,
            'lru_evicted': lru_evicted,
            'total_evicted': ttl_evicted + lru_evicted,
            'remaining_items': len(self.store)
        }


def pii_mask_check(item: Dict[str, Any]) -> bool:
    """
    Check if item has PII properly masked.
    
    Args:
        item: Memory item
    
    Returns:
        True if PII is properly masked
    """
    pii_masked = item.get('pii_masked', False)
    text = item.get('text', '')
    
    # Check for common PII patterns (should be masked)
    import re
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b'
    phone_pattern = r'\b(?:\+?\d{1,3}[\s\-]?)?(?:\(?0\)?[\s\-]?)?(?:\d[\s\-]?){7,15}\b'
    
    has_email = bool(re.search(email_pattern, text))
    has_phone = bool(re.search(phone_pattern, text))
    
    # If PII detected but not masked, return False
    if (has_email or has_phone) and not pii_masked:
        return False
    
    return True

