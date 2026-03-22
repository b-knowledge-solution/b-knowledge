# RAG Quality Enhancement — Master Plan

## Goal

Enhance B-Knowledge RAG pipeline to achieve **>90% evaluation fidelity** for SDLC documents and healthcare documents.

## Current RAG Types Implemented (vs. 25 Types Overview)

### 1. FOUNDATION

| RAG Type | Status | Evidence |
|----------|--------|----------|
| **Standard RAG** | Implemented | Hybrid search (5% BM25 + 95% vector) → LLM generation. `search.py:203` |
| **Corrective RAG** | NOT implemented | Reranker re-sorts chunks but never classifies/rejects/replaces bad chunks. See `01-corrective-rag.md` |
| **Self RAG** | NOT implemented | No generation quality self-evaluation loop. See `04-self-rag.md` |

### 2. ADVANCED

| RAG Type | Status | Evidence |
|----------|--------|----------|
| **Speculative RAG** | NOT implemented | No draft-then-verify pattern |
| **Fusion RAG** | Implemented | Weighted fusion of fulltext + vector via `FusionExpr("weighted_sum", topk, {"weights": "0.05,0.95"})` |
| **Agentic RAG** | Partial | TSQDR does recursive query decomposition (depth=3) with multi-source retrieval (KB + web + graph), but lacks full agent reasoning loop |
| **Adaptive RAG** | NOT implemented | No query-complexity routing. All queries use same pipeline. See `05-adaptive-rag.md` |

### 3. SPECIALIZED

| RAG Type | Status | Evidence |
|----------|--------|----------|
| **RAPTOR** | Implemented | Full hierarchical summarization via UMAP + GMM clustering at multiple tree levels. `rag/raptor.py` |
| **REACT** | NOT implemented | No reasoning-action interleaving loop |
| **REFEED / REALM / REVEAL / REPLUG** | NOT implemented | — |

### 4. OPTIMIZED

| RAG Type | Status | Evidence |
|----------|--------|----------|
| All (MEMO, ATLAS, RETRO, AUTO, CORAG, EACO-RAG) | NOT implemented | — |

### 5. DOMAIN-SPECIFIC

| RAG Type | Status | Evidence |
|----------|--------|----------|
| **Iterative RAG** | Implemented | TSQDR with recursive depth=3, sufficiency checking, follow-up query generation |
| **RULE / CORAL / ConTReGen / CRAT** | NOT implemented | — |

### Also Implemented (not in the 25 list)

- **Graph RAG** — general + light modes with Leiden community detection
- **Hybrid Reranking** — heuristic + model-based (Cohere/Jina/RAGcon)
- **Citation RAG** — sentence-level `[ID:N]` attribution via hybrid similarity
- **Multi-Query RAG** — LLM generates 1-3 alternative queries
- **Hierarchical Merger** — heading-level structure-aware chunking (exists but rarely used)

---

## Why Current System Falls Below 90%

### Problem 1: No Corrective RAG in Standard Pipeline
- Reranker only re-sorts; irrelevant chunks still reach the LLM
- `sufficiency_check()` only runs in TSQDR deep research path, not standard retrieval
- Impact: ~15-20% fidelity loss from context pollution

### Problem 2: Naive Chunking Destroys Structure
- Delimiter-based splitting (`\n`, `。`, `；`) has zero semantic awareness
- Excel→PDF tables become single giant chunks (1000+ tokens)
- SDLC hierarchical structure (sections → subsections → requirements) is lost
- Healthcare numbered clauses and cross-references are broken
- Impact: ~10-15% fidelity loss from context fragmentation

### Problem 3: No Self-Evaluation
- Generated answers are never checked for faithfulness to retrieved chunks
- Hallucinations go unchecked — critical failure mode for healthcare
- Impact: ~5-10% fidelity loss

### Problem 4: No Adaptive Routing
- Simple lookup queries waste compute going through full pipeline
- Complex multi-hop queries get insufficient depth from standard retrieval
- Impact: ~5% fidelity loss

---

## Implementation Phases

### Phase 1: Quick Wins (Week 1-2) — Target: 70% → 85%

| # | Task | Doc | Impact | Effort |
|---|------|-----|--------|--------|
| 1 | Table-aware chunking + Excel fix | `02-table-aware-chunking.md` | HIGH | Medium |
| 2 | Corrective RAG layer | `01-corrective-rag.md` | HIGH | Medium |
| 3 | Semantic chunking option | `03-semantic-chunking.md` | HIGH | Medium |

### Phase 2: Structural (Week 3-4) — Target: 85% → 92%

| # | Task | Doc | Impact | Effort |
|---|------|-----|--------|--------|
| 4 | Self-RAG reflection | `04-self-rag.md` | HIGH | High |
| 5 | Adaptive RAG routing | `05-adaptive-rag.md` | MEDIUM | Medium |

### Phase 3: Domain-Specific (Week 5-6) — Target: 92% → 95%+

| # | Task | Doc | Impact | Effort |
|---|------|-----|--------|--------|
| 6 | SDLC + Healthcare parsers | `06-domain-parsers.md` | MEDIUM | High |
| 7 | Evaluation pipeline (RAGAS) | `07-evaluation-pipeline.md` | Critical for measurement | High |

---

## Key Files Reference

| Component | File | Lines |
|-----------|------|-------|
| Hybrid search orchestration | `advance-rag/rag/nlp/search.py` | 54-650 |
| Fulltext query builder | `advance-rag/rag/nlp/query.py` | — |
| Naive merge chunking | `advance-rag/rag/nlp/__init__.py` | 1070-1170 |
| Table tokenizer | `advance-rag/rag/nlp/__init__.py` | 375-406 |
| Splitter component | `advance-rag/rag/flow/splitter/splitter.py` | 71-199 |
| Hierarchical merger | `advance-rag/rag/flow/hierarchical_merger/hierarchical_merger.py` | — |
| Table parser (Excel) | `advance-rag/rag/app/table.py` | 376-522 |
| Clinical parser | `advance-rag/rag/app/clinical.py` | — |
| Naive parser | `advance-rag/rag/app/naive.py` | — |
| TSQDR | `advance-rag/rag/advanced_rag/tree_structured_query_decomposition_retrieval.py` | — |
| Prompts — sufficiency | `advance-rag/rag/prompts/sufficiency_check.md` | — |
| Prompts — multi-query | `advance-rag/rag/prompts/multi_queries_gen.md` | — |
| Prompt generator | `advance-rag/rag/prompts/generator.py` | — |
| Task executor | `advance-rag/rag/svr/task_executor.py` | — |
| Rerank models | `advance-rag/rag/llm/rerank_model.py` | — |
| Embedding models | `advance-rag/rag/llm/embedding_model.py` | — |
| Config | `advance-rag/config.py` | — |

---

## Architecture Diagram: Enhanced Pipeline

```
                        ┌─────────────────────────────────┐
                        │       DOCUMENT INGESTION         │
                        └───────────────┬─────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
            ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
            │  Table-Aware │  │   Semantic    │  │  Hierarchical│
            │  Chunking    │  │   Chunking   │  │   Merger     │
            │  (NEW: #2)   │  │  (NEW: #3)   │  │  (existing)  │
            └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
                   └─────────────────┼─────────────────┘
                                     ▼
                        ┌─────────────────────────────────┐
                        │     Embedding + Indexing         │
                        └───────────────┬─────────────────┘
                                        │
                        ┌───────────────▼─────────────────┐
                        │     QUERY TIME                   │
                        │                                  │
                        │  ┌──────────────────────────┐   │
                        │  │  Adaptive Router (NEW:#5) │   │
                        │  └──────┬───────────────┬────┘   │
                        │         │               │        │
                        │    Simple Query    Complex Query  │
                        │         │               │        │
                        │         ▼               ▼        │
                        │  ┌──────────┐  ┌──────────────┐  │
                        │  │ Standard │  │    TSQDR     │  │
                        │  │ Hybrid   │  │  Deep Search │  │
                        │  │ Search   │  │  + GraphRAG  │  │
                        │  └────┬─────┘  └──────┬───────┘  │
                        │       └────────┬───────┘         │
                        │                ▼                 │
                        │  ┌──────────────────────────┐   │
                        │  │    Reranking (existing)    │   │
                        │  └──────────┬───────────────┘   │
                        │             ▼                    │
                        │  ┌──────────────────────────┐   │
                        │  │ Corrective RAG (NEW: #1)  │   │
                        │  │ Classify → Filter → Expand│   │
                        │  └──────────┬───────────────┘   │
                        │             ▼                    │
                        │  ┌──────────────────────────┐   │
                        │  │   LLM Generation          │   │
                        │  └──────────┬───────────────┘   │
                        │             ▼                    │
                        │  ┌──────────────────────────┐   │
                        │  │  Self-RAG Check (NEW: #4) │   │
                        │  │ Faithfulness + Relevance  │   │
                        │  └──────────────────────────┘   │
                        └─────────────────────────────────┘
```
