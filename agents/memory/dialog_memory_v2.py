"""
Dialog Memory v2
Steg 113: Brain First Plan - Memory & Persona

Episodic + semantic memory for multi-turn conversations.
Hybrid retrieval with recency boost and entity overlap.
"""
import json
import sys
import time
import hashlib
import re
from pathlib import Path
from typing import Dict, Any, List, Optional, Literal

# Add parent directory to path for imports
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from schemas.memory_record import MemoryRecord
from agents.memory.vector_store import SimpleVectorStore

# Force UTF-8 encoding for Windows compatibility
if sys.platform == 'win32':
    import io
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

AGENT_VERSION = "2.0.0"
AGENT_ID = "dialog_memory_v2"

# Configuration
MAX_NODES = 200
RETRIEVE_K = 8
TTL_DAYS = 30


def simple_embedding(text: str, max_dim: int = 128) -> List[float]:
    """
    Simple TF-IDF-like embedding for semantic search.
    
    For production, replace with sentence-transformers or OpenAI embeddings.
    """
    # Normalize text
    text = text.lower().strip()
    
    # Tokenize and count
    words = re.findall(r'\b\w+\b', text)
    
    # Simple frequency-based features
    word_freq: Dict[str, float] = {}
    for word in words:
        word_freq[word] = word_freq.get(word, 0) + 1.0
    
    # Normalize to unit vector
    total = sum(word_freq.values())
    if total == 0:
        return [0.0] * max_dim
    
    # Extract features up to max_dim
    sorted_words = sorted(word_freq.items(), key=lambda x: -x[1])
    vector = []
    
    for i in range(max_dim):
        if i < len(sorted_words):
            # Hash word to get distributed feature index
            word_hash = int(hashlib.md5(sorted_words[i][0].encode()).hexdigest(), 16)
            # Normalize frequency
            freq = sorted_words[i][1] / total
            vector.append(freq)
        else:
            vector.append(0.0)
    
    # L2 normalize
    norm = sum(x ** 2 for x in vector) ** 0.5
    if norm > 0:
        vector = [x / norm for x in vector]
    
    return vector


def extract_facets(text: str, lang: str = "sv") -> Dict[str, Any]:
    """
    Extract facets (topics, intents, entities, affect) from text.
    
    For now, simple heuristic extraction. Later: integrate with existing NER/intent agents.
    """
    facets = {
        "topics": [],
        "intents": [],
        "entities": [],
        "affect": []
    }
    
    text_lower = text.lower()
    
    # Simple topic extraction (keywords)
    topics = []
    if any(word in text_lower for word in ["problem", "konflikt", "conflict", "diskuter"]):
        topics.append("conflict")
    if any(word in text_lower for word in ["löfte", "promise", "kommer", "ska"]):
        topics.append("commitment")
    if any(word in text_lower for word in ["känslor", "emotions", "känna", "feel"]):
        topics.append("feelings")
    if any(word in text_lower for word in ["plan", "framtid", "future", "framöver"]):
        topics.append("planning")
    
    facets["topics"] = topics
    
    # Simple intent extraction
    intents = []
    if any(word in text_lower for word in ["förklara", "explain", "förstå", "understand"]):
        intents.append("clarification")
    if any(word in text_lower for word in ["skjuta", "postpone", "senare", "later"]):
        intents.append("postpone")
    if any(word in text_lower for word in ["möte", "meet", "ses", "see"]):
        intents.append("meeting")
    
    facets["intents"] = intents
    
    # Simple entity extraction (capitalized words, proper nouns)
    entities = []
    capitalized = re.findall(r'\b[A-ZÅÄÖ][a-zåäö]+\b', text)
    entities.extend(capitalized[:5])  # Limit to 5 entities
    
    facets["entities"] = entities
    
    # Affect extraction (very simple)
    affect = []
    if any(word in text_lower for word in ["oro", "worried", "stressad", "stressed"]):
        affect.append("worry")
    if any(word in text_lower for word in ["glad", "happy", "kul", "fun"]):
        affect.append("positive")
    
    facets["affect"] = affect
    
    return facets


class DialogMemoryV2:
    """
    Dialog Memory v2 - Main API
    
    Supports episodic and semantic memory with hybrid retrieval.
    """
    
    def __init__(self, storage_path: Optional[Path] = None):
        self.store = SimpleVectorStore(storage_path)
        self.conv_turn_cache: Dict[str, int] = {}  # Track current turn per conversation
    
    def ingest(self, record: MemoryRecord, embed_fn=None) -> None:
        """
        Ingest a new memory record.
        
        Args:
            record: MemoryRecord to store
            embed_fn: Optional embedding function (default: simple_embedding)
        """
        # Generate embedding if not provided
        if not record.vector:
            embed_fn = embed_fn or simple_embedding
            vector = embed_fn(record.text)
        else:
            vector = record.vector
        
        # Store with vector
        self.store.add(record, vector)
        
        # Update turn cache
        self.conv_turn_cache[record.conv_id] = max(
            self.conv_turn_cache.get(record.conv_id, 0),
            record.turn
        )
        
        # Enforce max nodes (remove oldest if needed)
        total_count = self.store.count()
        if total_count > MAX_NODES:
            self._evict_oldest(1)
    
    def retrieve(
        self,
        conv_id: str,
        k: int = RETRIEVE_K,
        mode: Literal["episodic", "semantic", "hybrid"] = "hybrid",
        query_text: Optional[str] = None,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[MemoryRecord]:
        """
        Retrieve relevant memory records.
        
        Args:
            conv_id: Conversation ID
            k: Number of results to return
            mode: Retrieval mode
            query_text: Optional query text for semantic search
            filters: Optional filters
        
        Returns:
            List of MemoryRecord sorted by relevance
        """
        # Combine filters
        all_filters = filters or {}
        all_filters["conv_id"] = conv_id
        
        if mode == "episodic":
            # Return most recent turns
            all_records = self.store.list_all(all_filters)
            sorted_by_turn = sorted(all_records, key=lambda r: r.turn, reverse=True)
            return sorted_by_turn[:k]
        
        elif mode == "semantic":
            # Pure vector search
            if not query_text:
                # Fallback: return recent
                return self.retrieve(conv_id, k, "episodic", filters=filters)
            
            query_vector = simple_embedding(query_text)
            results = self.store.search(query_vector, k=k, filters=all_filters)
            return [record for record, _ in results]
        
        else:  # hybrid
            # Combine episodic and semantic
            if not query_text:
                # Fallback to episodic
                return self.retrieve(conv_id, k, "episodic", filters=filters)
            
            # Get semantic candidates
            query_vector = simple_embedding(query_text)
            semantic_results = self.store.search(query_vector, k=k * 2, filters=all_filters)
            
            # Apply episodic boost based on recency
            current_turn = self.conv_turn_cache.get(conv_id, 0)
            
            scored_results = []
            for record, sim_score in semantic_results:
                # Recency boost (closer to current turn = higher)
                turn_distance = abs(current_turn - record.turn)
                recency_boost = 1.0 / (1.0 + turn_distance * 0.1)
                
                # Clamp recency boost to [0.2, 1.0]
                recency_boost = max(0.2, min(1.0, recency_boost))
                
                # Hybrid score: 45% semantic + 30% BM25-like + 15% recency + 10% facets
                # (adjusted weights: alpha=0.30, beta=0.45, gamma=0.15, delta=0.10)
                hybrid_score = 0.45 * sim_score + 0.30 * recency_boost + 0.15 * recency_boost + 0.10 * 0.0  # facets placeholder
                
                scored_results.append((record, hybrid_score))
            
            # Sort by hybrid score
            scored_results.sort(key=lambda x: x[1], reverse=True)
            
            # Apply re-ranking to top-k using lexical boost and diversity penalty
            from agents.memory.scoring import rerank_topk, _lex_overlap_boost, _diversity_penalty
            
            # Re-rank top-k (default k=10, but can be configured)
            rerank_k = 10  # Can be read from config
            if rerank_k > 0 and len(scored_results) > 0:
                # Convert to dict format for re-ranking
                items_dict = []
                for record, score in scored_results[:rerank_k]:
                    items_dict.append({
                        "score": score,
                        "text": record.text,
                        "embedding": record.vector or [],
                        "facets": record.facets or {},
                        "item": record
                    })
                
                # Apply lexical boost and diversity penalty
                picked = []
                for cand in items_dict:
                    boost = _lex_overlap_boost(query_text, cand.get("text", ""))
                    
                    # Apply diversity penalty against already picked items
                    for p in picked:
                        boost -= _diversity_penalty(p["embedding"], cand["embedding"])
                    
                    cand["_rerank_score"] = cand["score"] + boost
                    picked.append(cand)
                
                # Sort by re-ranked score
                picked.sort(key=lambda x: x["_rerank_score"], reverse=True)
                
                # Return re-ranked records
                reranked_records = [cand["item"] for cand in picked]
                # Add remaining records (after top-k)
                remaining_records = [record for record, _ in scored_results[rerank_k:]]
                return (reranked_records + remaining_records)[:k]
            
            # Fallback: return top-k without re-ranking
            return [record for record, _ in scored_results[:k]]
    
    def forget(self, conv_id: str, policy: Dict[str, Any]) -> int:
        """
        Forget records based on policy.
        
        Args:
            conv_id: Conversation ID
            policy: Forgetting policy (TTL, LRU, safety)
        
        Returns:
            Number of records forgotten
        """
        all_records = self.store.list_all({"conv_id": conv_id})
        
        removed_count = 0
        
        # TTL policy
        if "ttl_days" in policy:
            ttl_days = policy["ttl_days"]
            for record in all_records:
                # Simple TTL check (would need proper date parsing in production)
                age_days = 0  # Placeholder
                if age_days > ttl_days:
                    self.store.remove(record.id)
                    removed_count += 1
        
        # LRU policy (least recent turns)
        if "keep_last_n" in policy:
            keep_last_n = policy["keep_last_n"]
            sorted_records = sorted(all_records, key=lambda r: r.turn)
            
            for record in sorted_records[:-keep_last_n]:
                self.store.remove(record.id)
                removed_count += 1
        
        return removed_count
    
    def snapshot(self, conv_id: str) -> Dict[str, Any]:
        """
        Get snapshot of conversation memory.
        
        Returns:
            Stats about the conversation memory
        """
        all_records = self.store.list_all({"conv_id": conv_id})
        
        return {
            "conv_id": conv_id,
            "total_turns": len(all_records),
            "episodic_count": sum(1 for r in all_records if r.kind == "episodic"),
            "semantic_count": sum(1 for r in all_records if r.kind == "semantic"),
            "speakers": list(set(r.speaker for r in all_records)),
            "current_turn": self.conv_turn_cache.get(conv_id, 0),
        }
    
    def _evict_oldest(self, count: int) -> None:
        """Evict oldest records when storage limit reached."""
        all_records = self.store.list_all()
        
        # Sort by timestamp (oldest first)
        sorted_records = sorted(all_records, key=lambda r: r.tstamp_iso)
        
        for record in sorted_records[:count]:
            self.store.remove(record.id)


# -------------------- JSONL Bridge Protocol -------------------- #

def handle_jsonl_request(line: str) -> str:
    """
    Handle JSONL request.
    
    Input:
    {
        "agent": "dialog_memory_v2",
        "action": "ingest|retrieve|forget|snapshot",
        "conv_id": "...",
        "record": {...},  # For ingest
        "query_text": "...",  # For retrieve
        "mode": "hybrid",  # For retrieve
        "trace_id": "..."
    }
    """
    start_time = time.perf_counter()
    
    try:
        request = json.loads(line.strip())
        agent = request.get("agent", "")
        action = request.get("action", "")
        
        if agent != "dialog_memory_v2":
            return json.dumps({
                "ok": False,
                "agent": agent,
                "error": "Unknown agent",
                "latency_ms": round((time.perf_counter() - start_time) * 1000, 2)
            }, ensure_ascii=False)
        
        memory = DialogMemoryV2()
        
        if action == "ingest":
            record_data = request.get("record", {})
            record = MemoryRecord(**record_data)
            memory.ingest(record)
            
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            return json.dumps({
                "ok": True,
                "agent": "dialog_memory_v2",
                "action": "ingest",
                "record_id": record.id,
                "latency_ms": round(elapsed_ms, 2)
            }, ensure_ascii=False)
        
        elif action == "retrieve":
            conv_id = request.get("conv_id", "")
            k = request.get("k", RETRIEVE_K)
            mode = request.get("mode", "hybrid")
            query_text = request.get("query_text", "")
            
            results = memory.retrieve(conv_id, k=k, mode=mode, query_text=query_text)
            
            # Serialize results
            results_data = [r.model_dump_for_storage() for r in results]
            
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            return json.dumps({
                "ok": True,
                "agent": "dialog_memory_v2",
                "action": "retrieve",
                "results": results_data,
                "latency_ms": round(elapsed_ms, 2)
            }, ensure_ascii=False)
        
        elif action == "forget":
            conv_id = request.get("conv_id", "")
            policy = request.get("policy", {})
            
            removed = memory.forget(conv_id, policy)
            
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            return json.dumps({
                "ok": True,
                "agent": "dialog_memory_v2",
                "action": "forget",
                "removed_count": removed,
                "latency_ms": round(elapsed_ms, 2)
            }, ensure_ascii=False)
        
        elif action == "snapshot":
            conv_id = request.get("conv_id", "")
            
            snapshot = memory.snapshot(conv_id)
            
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            return json.dumps({
                "ok": True,
                "agent": "dialog_memory_v2",
                "action": "snapshot",
                "snapshot": snapshot,
                "latency_ms": round(elapsed_ms, 2)
            }, ensure_ascii=False)
        
        else:
            return json.dumps({
                "ok": False,
                "agent": "dialog_memory_v2",
                "error": f"Unknown action: {action}",
                "latency_ms": round((time.perf_counter() - start_time) * 1000, 2)
            }, ensure_ascii=False)
    
    except Exception as e:
        return json.dumps({
            "ok": False,
            "agent": "dialog_memory_v2",
            "error": str(e),
            "latency_ms": round((time.perf_counter() - start_time) * 1000, 2)
        }, ensure_ascii=False)


# -------------------- CLI support -------------------- #

if __name__ == "__main__":
    if not sys.stdin.isatty():
        # JSONL bridge mode
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                response = handle_jsonl_request(line)
                print(response, flush=True)
            except Exception as e:
                error_resp = json.dumps({
                    "ok": False,
                    "agent": "dialog_memory_v2",
                    "error": str(e),
                    "latency_ms": 0
                }, ensure_ascii=False)
                print(error_resp, flush=True)
        sys.exit(0)
    
    # CLI test
    print(f"DialogMemoryV2 {AGENT_VERSION}")
    print("Enter command (or 'quit' to exit):")
    print("  ingest <conv_id> <turn> <speaker> <text>")
    print("  retrieve <conv_id> [query]")
    print("  snapshot <conv_id>")
    print("  forget <conv_id>")
    
    memory = DialogMemoryV2()
    
    while True:
        try:
            line = input("> ").strip()
            if line.lower() in ("quit", "exit", "q"):
                break
            
            parts = line.split(None, 1)
            if not parts:
                continue
            
            cmd = parts[0]
            args = parts[1] if len(parts) > 1 else ""
            
            if cmd == "ingest":
                # ingest conv_001 1 user "Hej, hur är läget?"
                import shlex
                args_list = shlex.split(args)
                if len(args_list) >= 4:
                    conv_id, turn, speaker, text = args_list[0], int(args_list[1]), args_list[2], " ".join(args_list[3:])
                    record = MemoryRecord(
                        id=f"{conv_id}_turn_{turn}",
                        conv_id=conv_id,
                        turn=turn,
                        speaker=speaker,
                        text=text,
                        facets=extract_facets(text)
                    )
                    memory.ingest(record)
                    print(f"✅ Ingested: {record.id}")
                else:
                    print("Usage: ingest <conv_id> <turn> <speaker> <text>")
            
            elif cmd == "retrieve":
                # retrieve conv_001 "hur mår du"
                args_list = args.split(None, 1)
                conv_id = args_list[0]
                query = args_list[1] if len(args_list) > 1 else ""
                
                results = memory.retrieve(conv_id, query_text=query, k=5)
                print(f"Found {len(results)} results:")
                for r in results:
                    print(f"  Turn {r.turn} ({r.speaker}): {r.text[:60]}...")
            
            elif cmd == "snapshot":
                snapshot = memory.snapshot(args)
                print(json.dumps(snapshot, indent=2, ensure_ascii=False))
            
            elif cmd == "forget":
                removed = memory.forget(args, {"keep_last_n": 10})
                print(f"Removed {removed} records")
            
        except (KeyboardInterrupt, EOFError):
            break
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)

