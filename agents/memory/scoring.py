"""
Memory Scoring Module - Steg 2
Hybrid retrieval scoring: BM25 + dense + recency + facet-match
"""

import math
import re
from typing import List, Dict, Any, Tuple
from datetime import datetime, timedelta
from collections import Counter

def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Compute cosine similarity between two vectors."""
    if len(a) != len(b):
        return 0.0
    
    dot_product = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    
    if norm_a == 0 or norm_b == 0:
        return 0.0
    
    return dot_product / (norm_a * norm_b)


def bm25_score(query_terms: List[str], doc_terms: List[str], k1: float = 1.5, b: float = 0.75) -> float:
    """
    Simplified BM25 scoring.
    
    Args:
        query_terms: Query terms
        doc_terms: Document terms
        k1: Term frequency saturation parameter
        b: Length normalization parameter
    
    Returns:
        BM25 score (normalized to [0, 1])
    """
    if not query_terms or not doc_terms:
        return 0.0
    
    doc_term_freq = Counter(doc_terms)
    doc_len = len(doc_terms)
    avg_doc_len = doc_len  # Simplified: use current doc length as avg
    
    score = 0.0
    for term in query_terms:
        if term in doc_term_freq:
            tf = doc_term_freq[term]
            # Simplified IDF (in real BM25, this would be log((N - df + 0.5) / (df + 0.5)))
            idf = 1.0  # Simplified constant IDF
            
            # BM25 term score
            numerator = idf * tf * (k1 + 1)
            denominator = tf + k1 * (1 - b + b * (doc_len / max(avg_doc_len, 1)))
            score += numerator / max(denominator, 1)
    
    # Normalize to [0, 1] (simplified)
    max_possible_score = len(query_terms) * (k1 + 1) / k1
    return min(1.0, score / max(max_possible_score, 1))


def recency_decay(age_days: float, half_life_days: float = 14.0) -> float:
    """
    Exponential decay for recency scoring.
    
    Args:
        age_days: Age of item in days
        half_life_days: Half-life in days (default 14)
    
    Returns:
        Recency score in [0, 1]
    """
    if age_days <= 0:
        return 1.0
    
    decay = math.exp(-age_days / half_life_days)
    return max(0.0, min(1.0, decay))


def facet_bonus(item_facets: Dict[str, Any], target_facets: List[str]) -> float:
    """
    Compute facet match bonus.
    
    Args:
        item_facets: Facets from memory item
        target_facets: Target facets to match
    
    Returns:
        Facet bonus score in [0, 1]
    """
    if not target_facets:
        return 0.0
    
    matches = 0
    item_facet_values = []
    
    # Extract facet values from item
    if isinstance(item_facets, dict):
        item_facet_values = list(item_facets.values())
        item_facet_keys = list(item_facets.keys())
    else:
        item_facet_values = item_facets if isinstance(item_facets, list) else []
        item_facet_keys = []
    
    # Check for matches
    for target in target_facets:
        target_lower = str(target).lower()
        # Check in keys
        if any(target_lower in str(k).lower() for k in item_facet_keys):
            matches += 1
        # Check in values
        elif any(target_lower in str(v).lower() for v in item_facet_values):
            matches += 1
    
    return matches / len(target_facets) if target_facets else 0.0


def _token_set(s: str) -> set:
    """Extract token set from text."""
    return {t.lower() for t in re.findall(r"\w+", s)}


def _lex_overlap_boost(query: str, text: str) -> float:
    """Compute lexical overlap boost (phrase match + Jaccard)."""
    q = _token_set(query)
    d = _token_set(text)
    if not q or not d:
        return 0.0
    
    jacc = len(q & d) / max(1, len(q | d))  # lexical närhet
    phrase = (query.lower() in text.lower())  # frasträff
    return 0.08 * phrase + 0.05 * jacc  # max ~0.13


def _diversity_penalty(chosen_emb: List[float], cand_emb: List[float], thr: float = 0.92, lam: float = 0.03) -> float:
    """Penalize near-duplicates in top results."""
    if not chosen_emb or not cand_emb:
        return 0.0
    return lam if cosine_similarity(chosen_emb, cand_emb) > thr else 0.0


def rerank_topk(query: str, scored_items: List[Tuple[Dict[str, Any], float]], k: int = 10) -> List[Tuple[Dict[str, Any], float]]:
    """
    Re-rank top-k items using lexical boost and diversity penalty.
    
    Args:
        query: Query text
        scored_items: List of (item, score) tuples already sorted by score
        k: Number of top items to re-rank
    
    Returns:
        Re-ranked list of (item, score) tuples
    """
    if not scored_items or k <= 0:
        return scored_items
    
    # Convert to dict format for easier manipulation
    items_dict = []
    for item, score in scored_items[:k]:
        items_dict.append({
            "score": score,
            "text": item.get("text", ""),
            "embedding": item.get("vector", []),
            "facets": item.get("facets", {}),
            "item": item
        })
    
    # Re-rank top-k
    picked = []
    for cand in items_dict:
        boost = _lex_overlap_boost(query, cand.get("text", ""))
        
        # Apply diversity penalty against already picked items
        for p in picked:
            boost -= _diversity_penalty(p["embedding"], cand["embedding"])
        
        cand["_rerank_score"] = cand["score"] + boost
        picked.append(cand)
    
    # Sort by re-ranked score
    picked.sort(key=lambda x: x["_rerank_score"], reverse=True)
    
    # Convert back to tuple format
    top_reranked = [(cand["item"], cand["_rerank_score"]) for cand in picked]
    
    # Combine with rest (items after top-k)
    rest = scored_items[k:]
    
    return top_reranked + rest


def score_items(
    query: str,
    items: List[Dict[str, Any]],
    now_ts: datetime,
    target_facets: List[str] = None,
    tau_days: float = 14.0,
    weights: Tuple[float, float, float, float] = (0.30, 0.45, 0.15, 0.10),
    pii_mask_required: bool = True,
    rerank_k: int = 10
) -> List[Tuple[Dict[str, Any], float]]:
    """
    Score memory items using hybrid retrieval.
    
    Args:
        query: Query text
        items: List of memory items (dicts with text, facets, tstamp_iso, vector, etc.)
        now_ts: Current timestamp
        target_facets: Target facets to match
        tau_days: Half-life for recency decay
        weights: (alpha, beta, gamma, delta) for BM25, cosine, recency, facets
        pii_mask_required: If True, filter out items with incomplete PII masking
    
    Returns:
        List of (item, score) tuples sorted by score descending
    """
    if not items:
        return []
    
    target_facets = target_facets or []
    alpha, beta, gamma, delta = weights
    
    # Normalize weights
    total_weight = alpha + beta + gamma + delta
    if total_weight > 0:
        alpha /= total_weight
        beta /= total_weight
        gamma /= total_weight
        delta /= total_weight
    
    # Tokenize query
    query_terms = re.findall(r'\b\w+\b', query.lower())
    
    # Get query embedding (simplified - would use actual embedding in production)
    query_vector = [hash(term) % 128 / 128.0 for term in query_terms[:128]]
    if len(query_vector) < 128:
        query_vector.extend([0.0] * (128 - len(query_vector)))
    
    # Normalize query vector
    norm = math.sqrt(sum(x * x for x in query_vector))
    if norm > 0:
        query_vector = [x / norm for x in query_vector]
    
    scored_items = []
    
    # Compute BM25 scores for normalization
    bm25_scores = []
    for item in items:
        item_text = item.get('text', '')
        item_terms = re.findall(r'\b\w+\b', item_text.lower())
        bm25 = bm25_score(query_terms, item_terms)
        bm25_scores.append(bm25)
    
    # Min-max normalize BM25 scores
    if bm25_scores:
        min_bm25 = min(bm25_scores)
        max_bm25 = max(bm25_scores)
        bm25_range = max_bm25 - min_bm25 if max_bm25 > min_bm25 else 1.0
    else:
        min_bm25 = 0.0
        bm25_range = 1.0
    
    for i, item in enumerate(items):
        # PII mask check
        if pii_mask_required:
            pii_masked = item.get('pii_masked', False)
            if not pii_masked:
                continue  # Skip items without PII masking
        
        item_text = item.get('text', '')
        item_vector = item.get('vector', [])
        item_facets = item.get('facets', {})
        item_ts = item.get('tstamp_iso', '')
        
        # BM25 score (normalized)
        item_terms = re.findall(r'\b\w+\b', item_text.lower())
        bm25_raw = bm25_scores[i]
        bm25_n = (bm25_raw - min_bm25) / bm25_range if bm25_range > 0 else 0.0
        
        # Cosine similarity
        if item_vector and len(item_vector) == len(query_vector):
            cos_sim = cosine_similarity(query_vector, item_vector)
        else:
            cos_sim = 0.0
        
        # Recency decay
        try:
            if item_ts:
                item_dt = datetime.fromisoformat(item_ts.replace('Z', '+00:00'))
                age_days = (now_ts - item_dt.replace(tzinfo=None)).total_seconds() / 86400.0
            else:
                age_days = 365.0  # Default to old if no timestamp
        except:
            age_days = 365.0
        
        recency = recency_decay(age_days, tau_days)
        
        # Facet bonus
        facet = facet_bonus(item_facets, target_facets)
        
        # Hybrid score
        score = alpha * bm25_n + beta * cos_sim + gamma * recency + delta * facet
        
        scored_items.append((item, score))
    
    # Sort by score descending
    scored_items.sort(key=lambda x: x[1], reverse=True)
    
    # Apply re-ranking to top-k if enabled
    if rerank_k > 0:
        scored_items = rerank_topk(query, scored_items, k=rerank_k)
    
    return scored_items


def deduplicate_items(
    items: List[Tuple[Dict[str, Any], float]],
    jaccard_threshold: float = 0.9
) -> List[Tuple[Dict[str, Any], float]]:
    """
    Deduplicate items using Jaccard similarity.
    
    Args:
        items: List of (item, score) tuples
        jaccard_threshold: Jaccard similarity threshold for deduplication
    
    Returns:
        Deduplicated list (keeps newest item when duplicates found)
    """
    if not items:
        return []
    
    def jaccard_similarity(text1: str, text2: str) -> float:
        """Compute Jaccard similarity between two texts."""
        words1 = set(re.findall(r'\b\w+\b', text1.lower()))
        words2 = set(re.findall(r'\b\w+\b', text2.lower()))
        
        if not words1 or not words2:
            return 0.0
        
        intersection = len(words1 & words2)
        union = len(words1 | words2)
        
        return intersection / union if union > 0 else 0.0
    
    deduplicated = []
    seen_indices = set()
    
    for i, (item1, score1) in enumerate(items):
        if i in seen_indices:
            continue
        
        # Check against remaining items
        is_duplicate = False
        for j in range(i + 1, len(items)):
            if j in seen_indices:
                continue
            
            item2, score2 = items[j]
            jaccard = jaccard_similarity(
                item1.get('text', ''),
                item2.get('text', '')
            )
            
            if jaccard >= jaccard_threshold:
                # Keep the one with higher score (or newer timestamp)
                ts1 = item1.get('tstamp_iso', '')
                ts2 = item2.get('tstamp_iso', '')
                
                if ts2 > ts1 or score2 > score1:
                    # item2 is newer/better, skip item1
                    is_duplicate = True
                    break
                else:
                    # item1 is newer/better, mark item2 as seen
                    seen_indices.add(j)
        
        if not is_duplicate:
            deduplicated.append((item1, score1))
    
    return deduplicated

