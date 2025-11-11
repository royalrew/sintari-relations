"""
Vector Store for Dialog Memory v2
Steg 113: Brain First Plan - Memory & Persona

Simple cosine similarity-based vector store for semantic search.
No external dependencies - uses TF-IDF + cosine for now.
"""
import json
import math
import os
from typing import List, Dict, Any, Tuple, Optional
from pathlib import Path
from schemas.memory_record import MemoryRecord


class SimpleVectorStore:
    """
    Simple in-memory vector store with cosine similarity.
    
    For production, replace with FAISS or Annoy later.
    """
    
    def __init__(self, storage_path: Optional[Path] = None):
        self.storage_path = storage_path or Path("runtime/dialog_memory_v2.json")
        self.records: Dict[str, MemoryRecord] = {}
        self.vectors: Dict[str, List[float]] = {}
        self._load()
    
    def _load(self) -> None:
        """Load records from disk if exists."""
        if self.storage_path.exists():
            try:
                with open(self.storage_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    records_data = data.get("records", {})
                    vectors_data = data.get("vectors", {})
                    
                    for record_id, record_dict in records_data.items():
                        record = MemoryRecord.from_storage(record_dict, vectors_data.get(record_id))
                        self.records[record_id] = record
                        if record.vector:
                            self.vectors[record_id] = record.vector
            except Exception as e:
                print(f"WARN: Could not load vector store: {e}")
    
    def _save(self) -> None:
        """Save records to disk (atomic write)."""
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        
        records_data = {
            record_id: record.model_dump_for_storage()
            for record_id, record in self.records.items()
        }
        
        data = {
            "records": records_data,
            "vectors": self.vectors,
        }
        
        # Atomic write: write to temp file, then replace
        temp_path = self.storage_path.with_suffix(self.storage_path.suffix + '.tmp')
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        # Atomically replace
        os.replace(temp_path, self.storage_path)
    
    def add(self, record: MemoryRecord, vector: List[float]) -> None:
        """Add a record with its embedding vector."""
        self.records[record.id] = record
        self.vectors[record.id] = vector
        self._save()
    
    def get(self, record_id: str) -> Optional[MemoryRecord]:
        """Get record by ID."""
        return self.records.get(record_id)
    
    def remove(self, record_id: str) -> bool:
        """Remove record by ID."""
        if record_id in self.records:
            del self.records[record_id]
            if record_id in self.vectors:
                del self.vectors[record_id]
            self._save()
            return True
        return False
    
    def cosine_similarity(self, a: List[float], b: List[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        if not a or not b or len(a) != len(b):
            return 0.0
        
        dot_product = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x ** 2 for x in a))
        norm_b = math.sqrt(sum(y ** 2 for y in b))
        
        if norm_a == 0 or norm_b == 0:
            return 0.0
        
        return dot_product / (norm_a * norm_b)
    
    def search(
        self,
        query_vector: List[float],
        k: int = 8,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Tuple[MemoryRecord, float]]:
        """
        Search for most similar records.
        
        Args:
            query_vector: Query embedding vector
            k: Number of results to return
            filters: Optional filters (conv_id, speaker, kind, etc.)
        
        Returns:
            List of (record, similarity_score) tuples, sorted by similarity
        """
        candidates: List[Tuple[MemoryRecord, float]] = []
        
        # Filter records if needed
        records_to_search = self.records.values()
        if filters:
            if "conv_id" in filters:
                records_to_search = [r for r in records_to_search if r.conv_id == filters["conv_id"]]
            if "speaker" in filters:
                records_to_search = [r for r in records_to_search if r.speaker == filters["speaker"]]
            if "kind" in filters:
                records_to_search = [r for r in records_to_search if r.kind == filters["kind"]]
        
        # Calculate similarity for each candidate
        for record in records_to_search:
            if record.id not in self.vectors:
                continue
            
            vector = self.vectors[record.id]
            similarity = self.cosine_similarity(query_vector, vector)
            
            # Apply filters
            if filters and "min_similarity" in filters:
                if similarity < filters["min_similarity"]:
                    continue
            
            candidates.append((record, similarity))
        
        # Sort by similarity (descending) and return top-k
        candidates.sort(key=lambda x: x[1], reverse=True)
        return candidates[:k]
    
    def count(self, filters: Optional[Dict[str, Any]] = None) -> int:
        """Count records matching filters."""
        if not filters:
            return len(self.records)
        
        records_to_count = self.records.values()
        if "conv_id" in filters:
            records_to_count = [r for r in records_to_count if r.conv_id == filters["conv_id"]]
        if "speaker" in filters:
            records_to_count = [r for r in records_to_count if r.speaker == filters["speaker"]]
        if "kind" in filters:
            records_to_count = [r for r in records_to_count if r.kind == filters["kind"]]
        
        return len(records_to_count)
    
    def list_all(self, filters: Optional[Dict[str, Any]] = None) -> List[MemoryRecord]:
        """List all records matching filters."""
        if not filters:
            return list(self.records.values())
        
        records_to_list = self.records.values()
        if "conv_id" in filters:
            records_to_list = [r for r in records_to_list if r.conv_id == filters["conv_id"]]
        if "speaker" in filters:
            records_to_list = [r for r in records_to_list if r.speaker == filters["speaker"]]
        if "kind" in filters:
            records_to_list = [r for r in records_to_list if r.kind == filters["kind"]]
        
        return sorted(records_to_list, key=lambda r: r.turn)

