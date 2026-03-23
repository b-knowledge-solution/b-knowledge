# 05 — Adaptive RAG Router Implementation

## Context

### Current State: One Pipeline for All Queries

Every query goes through the same pipeline regardless of complexity:

```
All queries → Hybrid Search (5% BM25 + 95% vector) → Rerank → Return top-K
```

**Problems:**
- Simple factual lookup ("What is the patient's blood type?") uses full vector search + reranking — slow and wasteful
- Complex multi-hop reasoning ("How do the requirements in Section 3 relate to test cases in Section 7?") gets only shallow single-round retrieval — insufficient depth
- Comparative questions ("What changed between v1.2 and v1.3 of the SRS?") need document-aware retrieval but get generic KB search

### What Adaptive RAG Is

Adaptive RAG classifies the query complexity and routes to the appropriate pipeline:

```
Query → [Classify complexity] → Route to optimal pipeline
    → Simple:      Standard RAG (fast, single retrieval)
    → Moderate:    Standard RAG + Corrective filter
    → Complex:     TSQDR (multi-round, depth=3)
    → Comparative: Multi-doc retrieval + comparison prompt
    → Procedural:  Sequential chunk retrieval (ordered by position)
```

**Paper reference**: "Adaptive-RAG: Learning to Adapt Retrieval-Augmented Large Language Models through Question Complexity" (Jeong et al., 2024)

---

## Implementation Plan

### Step 1: Query Complexity Classifier

**New file**: `advance-rag/rag/advanced_rag/adaptive_router.py`

```python
"""Adaptive RAG router that classifies query complexity.

Routes queries to the optimal retrieval pipeline based on
estimated complexity: simple, moderate, complex, comparative,
or procedural.
"""

import json
import logging
from enum import Enum


class QueryComplexity(str, Enum):
    """Query complexity classification levels."""
    SIMPLE = "simple"           # Direct fact lookup
    MODERATE = "moderate"       # Requires context but single-hop
    COMPLEX = "complex"         # Multi-hop reasoning needed
    COMPARATIVE = "comparative" # Compare across docs/versions
    PROCEDURAL = "procedural"   # How-to / step-by-step


class AdaptiveRouter:
    """Routes queries to optimal retrieval pipeline.

    Uses either rule-based heuristics (fast, no LLM cost) or
    LLM-based classification (more accurate, slower).

    Attributes:
        chat_mdl: Optional chat model for LLM classification.
        use_llm: Whether to use LLM (True) or heuristics (False).
    """

    def __init__(self, chat_mdl=None, use_llm=False):
        self.chat_mdl = chat_mdl
        self.use_llm = use_llm and chat_mdl is not None

    async def classify(self, question: str) -> QueryComplexity:
        """Classify query complexity.

        Args:
            question: User's question string.

        Returns:
            QueryComplexity enum value.
        """
        if self.use_llm:
            return await self._classify_with_llm(question)
        return self._classify_with_heuristics(question)

    def _classify_with_heuristics(self, question: str) -> QueryComplexity:
        """Rule-based query classification (zero latency, zero cost).

        Args:
            question: User's question.

        Returns:
            QueryComplexity based on keyword/pattern analysis.
        """
        q = question.lower().strip()

        # Comparative patterns
        comparative_patterns = [
            "compare", "difference", "differ", "vs", "versus",
            "changed", "changes between", "evolution",
            "before and after", "old vs new",
            # Vietnamese
            "so sánh", "khác nhau", "thay đổi",
            # Japanese
            "比較", "違い", "変更",
        ]
        if any(p in q for p in comparative_patterns):
            return QueryComplexity.COMPARATIVE

        # Procedural patterns
        procedural_patterns = [
            "how to", "how do", "steps to", "process for",
            "procedure", "workflow", "instructions",
            "guide me", "walk me through",
            # Vietnamese
            "cách", "hướng dẫn", "quy trình", "các bước",
            # Japanese
            "手順", "方法", "やり方",
        ]
        if any(p in q for p in procedural_patterns):
            return QueryComplexity.PROCEDURAL

        # Complex patterns (multi-hop indicators)
        complex_patterns = [
            "relationship between", "relate to", "impact of",
            "why does", "explain how", "what are the implications",
            "considering", "taking into account",
            "based on both", "across all",
            # Multi-entity references
        ]
        if any(p in q for p in complex_patterns):
            return QueryComplexity.COMPLEX

        # Count question words and entities as complexity signal
        question_words = ["what", "which", "where", "when", "who", "how", "why"]
        q_word_count = sum(1 for w in question_words if w in q.split())

        # Questions with multiple sub-questions
        if q.count("?") > 1 or " and " in q and q_word_count >= 1:
            return QueryComplexity.COMPLEX

        # Moderate: single question but needs context
        if len(q.split()) > 15 or q_word_count >= 1:
            return QueryComplexity.MODERATE

        # Simple: short, direct
        return QueryComplexity.SIMPLE

    async def _classify_with_llm(self, question: str) -> QueryComplexity:
        """LLM-based query classification (more accurate).

        Args:
            question: User's question.

        Returns:
            QueryComplexity from LLM judgment.
        """
        prompt = f"""Classify this question's complexity for RAG retrieval.

Question: {question}

Categories:
- simple: Direct fact lookup, single answer expected
- moderate: Needs context but single retrieval round sufficient
- complex: Multi-hop reasoning, multiple source documents needed
- comparative: Comparing versions, documents, or time periods
- procedural: How-to, step-by-step, workflow questions

Respond with JSON only: {{"complexity": "simple|moderate|complex|comparative|procedural"}}"""

        try:
            from rag.prompts import generator
            result = await generator.chat_with_model(
                self.chat_mdl, prompt, response_format="json"
            )
            data = json.loads(result)
            return QueryComplexity(data.get("complexity", "moderate"))
        except Exception as e:
            logging.warning(f"LLM classification failed: {e}")
            return self._classify_with_heuristics(question)

    def get_retrieval_config(self, complexity: QueryComplexity) -> dict:
        """Get retrieval parameters optimized for query complexity.

        Args:
            complexity: Classified query complexity.

        Returns:
            Dict of retrieval parameters.
        """
        configs = {
            QueryComplexity.SIMPLE: {
                "topk": 5,
                "similarity_threshold": 0.3,
                "use_rerank": False,
                "use_corrective_rag": False,
                "use_tsqdr": False,
                "page_size": 3,
            },
            QueryComplexity.MODERATE: {
                "topk": 15,
                "similarity_threshold": 0.2,
                "use_rerank": True,
                "use_corrective_rag": True,
                "use_tsqdr": False,
                "page_size": 5,
            },
            QueryComplexity.COMPLEX: {
                "topk": 30,
                "similarity_threshold": 0.15,
                "use_rerank": True,
                "use_corrective_rag": True,
                "use_tsqdr": True,
                "tsqdr_depth": 3,
                "page_size": 8,
            },
            QueryComplexity.COMPARATIVE: {
                "topk": 20,
                "similarity_threshold": 0.2,
                "use_rerank": True,
                "use_corrective_rag": True,
                "use_tsqdr": False,
                "multi_doc_mode": True,  # Retrieve from multiple docs
                "page_size": 10,
            },
            QueryComplexity.PROCEDURAL: {
                "topk": 15,
                "similarity_threshold": 0.2,
                "use_rerank": True,
                "use_corrective_rag": False,
                "use_tsqdr": False,
                "order_by_position": True,  # Return chunks in document order
                "page_size": 8,
            },
        }
        return configs.get(complexity, configs[QueryComplexity.MODERATE])
```

### Step 2: Integrate into Retrieval Pipeline

**File**: `advance-rag/rag/nlp/search.py`

Add routing logic before `Dealer.retrieval()`:

```python
async def adaptive_retrieval(
    self,
    question,
    embd_mdl,
    tenant_ids,
    kb_ids,
    chat_mdl=None,
    **kwargs,
):
    """Adaptive retrieval that routes based on query complexity.

    Args:
        question: User question.
        embd_mdl: Embedding model.
        tenant_ids: Tenant IDs.
        kb_ids: Knowledge base IDs.
        chat_mdl: Optional chat model for LLM-based classification.
        **kwargs: Additional retrieval parameters.

    Returns:
        Retrieval results dict.
    """
    from rag.advanced_rag.adaptive_router import AdaptiveRouter

    router = AdaptiveRouter(chat_mdl=chat_mdl, use_llm=False)  # Start with heuristics
    complexity = await router.classify(question)
    config = router.get_retrieval_config(complexity)

    # Merge adaptive config with user-provided kwargs
    merged = {**kwargs}
    merged["top"] = config.get("topk", merged.get("top", 1024))
    merged["similarity_threshold"] = config.get("similarity_threshold", 0.2)
    merged["page_size"] = config.get("page_size", merged.get("page_size", 5))

    # Route to TSQDR for complex queries
    if config.get("use_tsqdr") and chat_mdl:
        from rag.advanced_rag.tree_structured_query_decomposition_retrieval import (
            TreeStructuredQueryDecompositionRetrieval,
        )
        tsqdr = TreeStructuredQueryDecompositionRetrieval(...)
        return await tsqdr.research(question, ...)

    # Standard retrieval with optional corrective RAG
    result = await self.retrieval(
        question=question,
        embd_mdl=embd_mdl,
        tenant_ids=tenant_ids,
        kb_ids=kb_ids,
        rerank_mdl=kwargs.get("rerank_mdl") if config.get("use_rerank") else None,
        corrective_rag=config.get("use_corrective_rag", False),
        chat_mdl=chat_mdl,
        **{k: v for k, v in merged.items() if k not in ["rerank_mdl"]},
    )

    # For procedural queries: re-sort by document position
    if config.get("order_by_position"):
        result["chunks"].sort(
            key=lambda c: (c.get("doc_id", ""), c.get("page_num_int", [0])[0], c.get("top_int", [0])[0])
        )

    return result
```

### Step 3: Configuration

```python
# config.py
ADAPTIVE_RAG_ENABLED = get_bool_env("ADAPTIVE_RAG_ENABLED", False)
ADAPTIVE_RAG_USE_LLM = get_bool_env("ADAPTIVE_RAG_USE_LLM", False)
```

---

## Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| CREATE | `rag/advanced_rag/adaptive_router.py` | Query classifier + routing config |
| MODIFY | `rag/nlp/search.py` | Add `adaptive_retrieval()` method |
| MODIFY | `config.py` | Add ADAPTIVE_RAG_* env vars |
| MODIFY | `.env.example` | Document new env vars |

---

## Performance Considerations

- **Heuristic classification**: ~0ms (regex/keyword matching). Recommended for production.
- **LLM classification**: ~200-500ms. Use only when heuristic accuracy is insufficient.
- **Net effect**: Simple queries become FASTER (fewer chunks, no reranking). Complex queries become BETTER (deeper retrieval).

---

## Acceptance Criteria

- [ ] Simple factual queries return in < 500ms (vs current ~1-2s)
- [ ] Complex multi-hop queries automatically use TSQDR
- [ ] Procedural queries return chunks in document order
- [ ] Comparative queries retrieve from multiple documents
- [ ] Heuristic classifier achieves >80% accuracy on test query set
- [ ] Feature gated behind config flag (default OFF)
