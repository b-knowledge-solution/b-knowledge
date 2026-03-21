# Search Retrieval Pipeline - Detail Design

## Overview

The retrieval pipeline handles chunk-level search across one or more datasets. It supports three retrieval methods (full-text, semantic, hybrid), applies boost factors, and optionally reranks results via an external provider.

## Retrieval Sequence

```mermaid
sequenceDiagram
    participant Client
    participant Ctrl as Search Controller
    participant Svc as Search Service
    participant RAG as RAG Search Service
    participant EMB as Embedding Service
    participant OS as OpenSearch
    participant RR as Rerank Provider

    Client->>Ctrl: POST /api/search/apps/:id/search<br/>{query, method, top_k, ...}
    Ctrl->>Svc: search(appId, params)
    Svc->>Svc: Load search_config (dataset_ids, rerank, filters)

    alt method = semantic or hybrid
        Svc->>EMB: embedQuery(query)
        EMB-->>Svc: q_vec (float[])
    end

    loop For each dataset_id
        Svc->>RAG: ragSearchService.search(datasetId, query, q_vec, method, topK)
        RAG->>OS: Execute search query
        OS-->>RAG: Raw hits with scores
        RAG-->>Svc: Scored chunks
    end

    Svc->>Svc: Merge results from all datasets, sort by score

    opt rerank_id is configured
        Svc->>RR: rerank(query, chunks, rerank_top_k)
        RR-->>Svc: Re-scored chunks
        Svc->>Svc: hybridScore = 0.5 * original + 0.5 * rerank
        Svc->>Svc: Re-sort by hybridScore
    end

    Svc-->>Ctrl: Paginated chunks
    Ctrl-->>Client: { chunks, total, page, page_size }
```

## Retrieval Methods

### Full-Text Search (weight = 0)

- Uses BM25 scoring on the `content_with_weight` field in OpenSearch.
- Applies `minimum_should_match: "30%"` to balance recall and precision.
- Boost factors applied to specialized fields (see below).

### Semantic Search (weight = 1)

- Query is embedded via the dataset's configured embedding model.
- KNN search on the `q_vec` vector field in OpenSearch.
- Returns top-k results by cosine similarity.

### Hybrid Search (0 < weight < 1)

- Executes full-text and semantic searches in parallel.
- Normalizes scores from each method to [0, 1] range.
- Final score = `weight * semantic_score + (1 - weight) * fulltext_score`.

```mermaid
flowchart LR
    Q[Query] --> FT[Full-Text BM25]
    Q --> SE[Semantic KNN]
    FT --> NF[Normalize 0-1]
    SE --> NS[Normalize 0-1]
    NF --> FUSE[Weighted Fusion<br/>score = w*sem + 1-w*ft]
    NS --> FUSE
    FUSE --> SORT[Sort by fused score]
```

## Boost Factors

Field-level boost factors amplify scores for matches in high-value fields during full-text search.

| Field | Boost Factor | Rationale |
|-------|-------------|-----------|
| `title_tks` | 10x | Title matches are strong relevance signals |
| `important_kwd` | 30x | Manually tagged keywords indicate high relevance |
| `question_tks` | 20x | FAQ-style question matches are highly targeted |
| `content_ltks` | 2x | Body content has baseline relevance |

## Reranking

When `rerank_id` is set in the search app configuration, retrieved chunks undergo a second-pass reranking.

```mermaid
sequenceDiagram
    participant Svc as Search Service
    participant RR as Rerank Provider

    Svc->>RR: POST /rerank<br/>{query, documents: chunk_texts, top_n: rerank_top_k}
    RR-->>Svc: [{index, relevance_score}, ...]
    Svc->>Svc: For each chunk:<br/>hybridScore = 0.5 * originalScore + 0.5 * rerankScore
    Svc->>Svc: Re-sort by hybridScore, take top rerank_top_k
```

### Supported Reranker Providers

| Provider | API Style | Notes |
|----------|-----------|-------|
| Jina | `POST /v1/rerank` | `jina-reranker-v2-base-multilingual` |
| Cohere | `POST /v1/rerank` | `rerank-english-v3.0`, `rerank-multilingual-v3.0` |
| Generic | Configurable endpoint | Any provider following the rerank API contract |

### Hybrid Score Formula

```
hybridScore = 0.5 * normalize(originalScore) + 0.5 * normalize(rerankScore)
```

Both scores are normalized to [0, 1] before combining. The 0.5/0.5 weighting gives equal importance to initial retrieval relevance and reranker assessment.

## Multi-Dataset Search

When a search app is bound to multiple datasets:

1. Each dataset is searched independently with the same query and parameters.
2. Results from all datasets are collected into a single list.
3. Scores are normalized across the combined result set.
4. Results are sorted by normalized score (descending).
5. The combined list is capped at `top_k`.
6. If reranking is enabled, it operates on the merged list.

## Key Files

| File | Purpose |
|------|---------|
| `be/src/modules/rag/services/rag-search.service.ts` | Core retrieval logic (BM25, KNN, hybrid) |
| `be/src/modules/search/services/search.service.ts` | Search orchestration, multi-dataset merge |
| `be/src/modules/rag/services/rerank.service.ts` | Reranker provider integration |
| `be/src/modules/rag/services/embedding.service.ts` | Query embedding |
