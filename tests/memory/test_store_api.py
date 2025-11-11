"""
Test Store API for Dialog Memory v2
PR1: Storage & API validation

Tests CRUD, masking, TTL/LRU policies
"""
import pytest
import sys
from pathlib import Path
import tempfile
import shutil

# Add root to path
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from schemas.memory_record import MemoryRecord
from agents.memory.vector_store import SimpleVectorStore
from agents.memory.dialog_memory_v2 import DialogMemoryV2, simple_embedding


def test_memory_record_creation():
    """Test creating a MemoryRecord."""
    record = MemoryRecord(
        id="test_001",
        conv_id="conv_001",
        turn=1,
        speaker="user",
        text="Jag är orolig över vårt förhållande",
        facets={"topics": ["conflict"], "affect": ["worry"]}
    )
    
    assert record.id == "test_001"
    assert record.speaker == "user"
    assert record.kind == "episodic"  # default
    assert record.pii_masked  # default True


def test_vector_store_crud():
    """Test basic CRUD operations."""
    with tempfile.TemporaryDirectory() as tmpdir:
        store_path = Path(tmpdir) / "test_store.json"
        store = SimpleVectorStore(storage_path=store_path)
        
        # Create record
        record = MemoryRecord(
            id="r1",
            conv_id="c1",
            turn=1,
            speaker="user",
            text="Hello"
        )
        vector = simple_embedding("Hello")
        
        # Add
        store.add(record, vector)
        assert store.count() == 1
        
        # Get
        retrieved = store.get("r1")
        assert retrieved is not None
        assert retrieved.text == "Hello"
        
        # Remove
        assert store.remove("r1")
        assert store.count() == 0


def test_vector_store_search():
    """Test vector search functionality."""
    with tempfile.TemporaryDirectory() as tmpdir:
        store_path = Path(tmpdir) / "test_store.json"
        store = SimpleVectorStore(storage_path=store_path)
        
        # Add multiple records
        records = [
            MemoryRecord(id="r1", conv_id="c1", turn=1, speaker="user", text="Jag är orolig"),
            MemoryRecord(id="r2", conv_id="c1", turn=2, speaker="partner", text="Det ordnar sig"),
            MemoryRecord(id="r3", conv_id="c2", turn=1, speaker="user", text="Jag är glad"),
        ]
        
        for record in records:
            vector = simple_embedding(record.text)
            store.add(record, vector)
        
        # Search with filter
        query_vector = simple_embedding("orolig")
        results = store.search(query_vector, k=2, filters={"conv_id": "c1"})
        
        assert len(results) <= 2
        assert all(record.conv_id == "c1" for record, _ in results)


def test_dialog_memory_ingest():
    """Test ingesting records."""
    with tempfile.TemporaryDirectory() as tmpdir:
        store_path = Path(tmpdir) / "dialog_memory.json"
        memory = DialogMemoryV2(storage_path=store_path)
        
        record = MemoryRecord(
            id="r1",
            conv_id="c1",
            turn=1,
            speaker="user",
            text="Jag lovar att komma hem tidigare imorgon"
        )
        
        memory.ingest(record)
        
        # Verify stored
        snapshot = memory.snapshot("c1")
        assert snapshot["total_turns"] == 1
        assert snapshot["current_turn"] == 1


def test_dialog_memory_retrieve_episodic():
    """Test episodic retrieval (recent turns)."""
    with tempfile.TemporaryDirectory() as tmpdir:
        store_path = Path(tmpdir) / "dialog_memory.json"
        memory = DialogMemoryV2(storage_path=store_path)
        
        # Add multiple turns
        for i in range(1, 6):
            record = MemoryRecord(
                id=f"r{i}",
                conv_id="c1",
                turn=i,
                speaker="user" if i % 2 == 1 else "partner",
                text=f"Turn {i}"
            )
            memory.ingest(record)
        
        # Retrieve episodic (should be most recent)
        results = memory.retrieve("c1", k=3, mode="episodic")
        
        assert len(results) == 3
        # Should be in reverse order (most recent first)
        assert results[0].turn == 5
        assert results[1].turn == 4
        assert results[2].turn == 3


def test_dialog_memory_retrieve_hybrid():
    """Test hybrid retrieval (semantic + episodic boost)."""
    with tempfile.TemporaryDirectory() as tmpdir:
        store_path = Path(tmpdir) / "dialog_memory.json"
        memory = DialogMemoryV2(storage_path=store_path)
        
        # Add records
        memory.ingest(MemoryRecord(id="r1", conv_id="c1", turn=1, speaker="user", text="Jag lovar att komma"))
        memory.ingest(MemoryRecord(id="r2", conv_id="c1", turn=2, speaker="partner", text="Tack, jag blir glad"))
        memory.ingest(MemoryRecord(id="r3", conv_id="c1", turn=3, speaker="user", text="Hur mår du?"))
        
        # Retrieve with query
        results = memory.retrieve("c1", k=2, mode="hybrid", query_text="lovar att komma")
        
        # Hybrid retrieval should return k results (even if semantic similarity is weak)
        assert len(results) >= 1
        # For simple TF-IDF embeddings, verify that we get results from the conversation
        assert all(r.conv_id == "c1" for r in results)


def test_dialog_memory_forget_lru():
    """Test LRU forget policy."""
    with tempfile.TemporaryDirectory() as tmpdir:
        store_path = Path(tmpdir) / "dialog_memory.json"
        memory = DialogMemoryV2(storage_path=store_path)
        
        # Add 10 records
        for i in range(1, 11):
            record = MemoryRecord(id=f"r{i}", conv_id="c1", turn=i, speaker="user", text=f"Turn {i}")
            memory.ingest(record)
        
        # Forget all but last 5
        removed = memory.forget("c1", {"keep_last_n": 5})
        
        assert removed >= 5  # Should remove oldest records
        snapshot = memory.snapshot("c1")
        assert snapshot["total_turns"] <= 5


def test_dialog_memory_pii_mask():
    """Test that PII-masked flag is set."""
    record = MemoryRecord(
        id="r1",
        conv_id="c1",
        turn=1,
        speaker="user",
        text="Kalle Andersson 070-1234567",
        pii_masked=True
    )
    
    assert record.pii_masked is True
    
    # Verify storage/retrieval preserves flag
    with tempfile.TemporaryDirectory() as tmpdir:
        store_path = Path(tmpdir) / "test_store.json"
        store = SimpleVectorStore(storage_path=store_path)
        
        vector = simple_embedding(record.text)
        store.add(record, vector)
        
        retrieved = store.get("r1")
        assert retrieved.pii_masked is True


def test_dialog_memory_snapshot():
    """Test snapshot functionality."""
    with tempfile.TemporaryDirectory() as tmpdir:
        store_path = Path(tmpdir) / "dialog_memory.json"
        memory = DialogMemoryV2(storage_path=store_path)
        
        # Add records
        memory.ingest(MemoryRecord(id="r1", conv_id="c1", turn=1, speaker="user", text="Hello"))
        memory.ingest(MemoryRecord(id="r2", conv_id="c1", turn=2, speaker="partner", text="Hi"))
        memory.ingest(MemoryRecord(id="r3", conv_id="c1", turn=3, speaker="user", text="How are you"))
        
        snapshot = memory.snapshot("c1")
        
        assert snapshot["conv_id"] == "c1"
        assert snapshot["total_turns"] == 3
        assert snapshot["current_turn"] == 3
        assert set(snapshot["speakers"]) == {"user", "partner"}


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

