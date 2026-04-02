# Search System - Overview

## Overview

The search system provides app-scoped retrieval over one or more datasets. A Search App stores retrieval and presentation config, supports both internal authenticated usage and public token-based share/embed usage, and can answer through either chunk retrieval or streamed AI summaries.

## Architecture

```mermaid
flowchart TD
    SA[Search App Config] --> E1[POST .../search<br/>Chunk retrieval]
    SA --> E2[POST .../ask<br/>AI summary SSE]
    SA --> E3[POST .../related-questions<br/>Suggested follow-ups]
    SA --> E4[POST .../mindmap<br/>Mind map JSON]
    SA --> E5[POST .../retrieval-test<br/>Debug retrieval]
    SA --> E6[GET/POST .../embed/:token/*<br/>Public share/embed]

    E1 --> RP[Retrieval Pipeline]
    E2 --> RP
    E2 --> LLM[LLM Provider]
    E3 --> LLM
    E4 --> RP
    E4 --> LLM
    E5 --> RP
```

## Search App Configuration

Each search app stores retrieval, generation, and presentation behavior.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name of the search app |
| `dataset_ids` | string[] | Yes | Datasets to search over |
| `avatar` | string | [OPTIONAL] | Emoji/icon branding shown in UI and share page |
| `empty_response` | string | [OPTIONAL] | Custom no-results message |
| `llm_id` | string | [OPTIONAL] | LLM model for ask/mindmap/related-questions |
| `llm_setting` | object | [OPTIONAL] | Temperature, top_p, max_tokens overrides |
| `rerank_id` | string | [OPTIONAL] | Reranker model (Jina, Cohere, etc.) |
| `rerank_top_k` | number | [OPTIONAL] | Max chunks after reranking (default: 5) |
| `enable_related_questions` | boolean | [OPTIONAL] | Auto-generate follow-up questions |
| `enable_mindmap` | boolean | [OPTIONAL] | Enable mind map generation |
| `highlight` | boolean | [OPTIONAL] | Request server-side highlight snippets |
| `metadata_filter` | object | [OPTIONAL] | Default metadata filters applied to all queries |

## Runtime Query Parameters

Callers pass these at request time to override or refine search behavior.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | (required) | User search query |
| `method` | enum | `hybrid` | `full_text`, `semantic`, or `hybrid` |
| `top_k` | number | 5 | Max chunks to return |
| `similarity_threshold` | number | 0.0 | Min similarity score filter |
| `vector_similarity_weight` | number | 0.5 | Weight for vector vs. text score in hybrid mode |
| `page` | number | 1 | Pagination page |
| `page_size` | number | 20 | Pagination size |
| `metadata_filter` | object | [OPTIONAL] | Per-request metadata filter override |

## High-Level Flow

```mermaid
flowchart LR
    Q[User Query] --> SQL{Structured dataset?}
    SQL -->|Yes| SQLTRY[Try SQL fallback]
    SQL -->|No or miss| EMB{Embed Query}
    SQLTRY -->|hit| DONE[Return SQL result]
    SQLTRY -->|miss| EMB
    EMB -->|semantic/hybrid| VEC[Vector Embedding]
    EMB -->|full_text| SKIP[Skip Embedding]
    VEC --> MS[Multi-Dataset Search]
    SKIP --> MS
    MS --> MRG[Merge Results by Score]
    MRG --> RR{Rerank?}
    RR -->|OPT: rerank_id set| RERANK[Reranker Provider]
    RR -->|No reranker| TAG{Tag boost?}
    RERANK --> TAG
    TAG -->|OPT: tag_kb_ids configured| TAGS[Tag-based rescoring]
    TAG -->|No| OUT
    TAGS --> OUT
    RERANK --> OUT[Return Chunks]
    OUT --> SUM{AI Summary?}
    SUM -->|OPT: ask endpoint| LLM[LLM Streaming]
    SUM -->|search endpoint| DONE[Response]
    LLM --> CIT[OPT: Citation Post-processing]
    CIT --> RQ{Related Questions?}
    RQ -->|OPT: enabled| RQGEN[Generate Related Questions]
    RQ -->|Disabled| FINAL[Final Response]
    RQGEN --> FINAL
```

### Flow Steps

1. **Query** - User submits search query with optional parameters.
2. **Embed** - If method is `semantic` or `hybrid`, query is embedded via the configured embedding model.
3. **Multi-Dataset Search** - Each dataset is searched independently using the selected method.
4. **Merge** - Results from all datasets are merged and sorted by score.
5. **[OPT] Rerank** - If `rerank_id` is configured, chunks are re-scored.
6. **[OPT] Tag Boost** - If datasets are tag-enabled, chunks are score-boosted with derived query tags.
7. **Return Chunks** - For `/search`, paginated chunks are returned here.
8. **[OPT] AI Summary** - For `/ask`, chunks are fed to the LLM as context.
9. **[OPT] Citations** - References are attached to the summary response.
10. **[OPT] Related Questions** - Follow-up questions are generated in the final stage.

## Endpoints Summary

| Endpoint | Method | Response | Streaming |
|----------|--------|----------|-----------|
| `/api/search/apps/:id/search` | POST | Paginated chunks | No |
| `/api/search/apps/:id/ask` | POST | AI answer + references | Yes (SSE) |
| `/api/search/apps/:id/related-questions` | POST | String array | No |
| `/api/search/apps/:id/mindmap` | POST | JSON nodes + edges | No |
| `/api/search/apps/:id/retrieval-test` | POST | Raw chunks (debug) | No |
| `/api/search/embed/:token/config` | GET | Public-safe app config | No |
| `/api/search/embed/:token/search` | POST | Public paginated chunks | No |
| `/api/search/embed/:token/ask` | POST | Public AI answer + references | Yes (SSE) |

## Key Files

| File | Purpose |
|------|---------|
| `be/src/modules/search/` | Search module root |
| `be/src/modules/search/controllers/search.controller.ts` | Request handlers |
| `be/src/modules/search/controllers/search-embed.controller.ts` | Public share/embed handlers |
| `be/src/modules/search/services/search.service.ts` | Core search orchestration |
| `be/src/modules/search/routes/search.routes.ts` | Route definitions |
| `be/src/modules/search/routes/search-embed.routes.ts` | Public token-based routes |
