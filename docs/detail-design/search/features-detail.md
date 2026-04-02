# Search Features - Detail Design

> Supplementary search capabilities built on top of the shared retrieval pipeline.

## Overview

Beyond core `search` and `askSearch`, the latest implementation exposes:

- Mind map generation
- Related question suggestions
- Retrieval testing
- Public embed/share endpoints
- Search-app branding fields (`avatar`, `empty_response`)

Feedback remains part of the broader product direction, but it is not the main focus of the 2026-03-25 search implementation work.

## Mind Map

Generates a hierarchical knowledge map from retrieved chunks using LLM summarization.

**Endpoint**: `POST /api/search/apps/:id/mindmap`

```mermaid
sequenceDiagram
    participant Client
    participant Ctrl as Search Controller
    participant Svc as Search Service
    participant RAG as RAG Search Service
    participant LLM as LLM Provider

    Client->>Ctrl: POST .../mindmap<br/>{query, method, top_k}
    Ctrl->>Svc: generateMindmap(appId, params)
    Svc->>RAG: retrieveChunks(query, method, datasets)
    RAG-->>Svc: Scored chunks
    Svc->>Svc: Build prompt with chunk context<br/>+ mindmap JSON schema instructions
    Svc->>LLM: chatCompletion(messages)
    LLM-->>Svc: JSON hierarchy
    Svc->>Svc: Parse and validate JSON structure
    Svc-->>Ctrl: {nodes, edges}
    Ctrl-->>Client: 200 {nodes, edges}
```

### Response Structure

```json
{
  "nodes": [
    { "id": "1", "label": "Main Topic", "level": 0 },
    { "id": "2", "label": "Subtopic A", "level": 1 },
    { "id": "3", "label": "Subtopic B", "level": 1 }
  ],
  "edges": [
    { "source": "1", "target": "2" },
    { "source": "1", "target": "3" }
  ]
}
```

## Related Questions

Generates follow-up question suggestions for a query. In the current implementation, the dedicated endpoint uses the query plus the configured LLM provider. In streaming search, related questions are generated after answer streaming completes and emitted in the final SSE payload.

**Endpoint**: `POST /api/search/apps/:id/related-questions`

```mermaid
sequenceDiagram
    participant Client
    participant Ctrl as Search Controller
    participant Svc as Search Service
    participant LLM as LLM Provider

    Client->>Ctrl: POST .../related-questions<br/>{query}
    Ctrl->>Svc: generateRelatedQuestions(appId, query)
    Svc->>Svc: Load search app config
    Svc->>Svc: Resolve llm_id from search_config
    Svc->>LLM: chatCompletion(messages)
    LLM-->>Svc: Related question text
    Svc->>Svc: Parse response into string array
    Svc-->>Ctrl: string[]
    Ctrl-->>Client: 200 ["Question 1?", "Question 2?", ...]
```

### Prompt Design

The related question flow is shared through `relatedQuestionsService`, which is reused from both normal search and embed search.

## Feedback

Captures user feedback (thumbs up/down) on search answers for quality tracking.

**Endpoint**: `POST /api/search/apps/:id/feedback`

```mermaid
sequenceDiagram
    participant Client
    participant Ctrl as Search Controller
    participant Svc as Search Service
    participant DB as PostgreSQL

    Client->>Ctrl: POST .../feedback<br/>{answer_id, rating, comment}
    Ctrl->>Svc: submitFeedback(appId, feedbackData)
    Svc->>Svc: Validate rating (thumbs_up | thumbs_down)
    Svc->>DB: INSERT INTO answer_feedback<br/>(answer_id, app_id, rating, comment, user_id)
    DB-->>Svc: Stored
    Svc-->>Ctrl: Success
    Ctrl-->>Client: 200 {success: true}
```

### Feedback Table Schema

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `answer_id` | uuid | Reference to the search answer |
| `app_id` | uuid | Search app that produced the answer |
| `rating` | enum | `thumbs_up` or `thumbs_down` |
| `comment` | text | [OPTIONAL] User-provided comment |
| `user_id` | uuid | User who submitted feedback |
| `created_at` | timestamp | Submission time |

## Retrieval Test

A debug tool that runs the retrieval pipeline without LLM generation. Returns raw chunks with scores for evaluating retrieval quality.

**Endpoint**: `POST /api/search/apps/:id/retrieval-test`

```mermaid
sequenceDiagram
    participant Client
    participant Ctrl as Search Controller
    participant Svc as Search Service
    participant RAG as RAG Search Service

    Client->>Ctrl: POST .../retrieval-test<br/>{query, method, top_k, similarity_threshold}
    Ctrl->>Svc: retrievalTest(appId, params)
    Svc->>RAG: retrieveChunks(query, method, datasets)
    RAG-->>Svc: Raw scored chunks
    Svc->>Svc: No LLM call, no reranking (raw results)
    Svc-->>Ctrl: Raw chunks with scores
    Ctrl-->>Client: 200 {chunks: [{content, score, metadata, dataset_id}, ...]}
```

### Use Cases

- **Tuning retrieval parameters**: Compare `full_text` vs. `semantic` vs. `hybrid` results.
- **Evaluating boost factors**: Check if title/keyword boosts surface the right chunks.
- **Debugging low-quality answers**: Inspect what context the LLM would receive.
- **Threshold calibration**: Test different `similarity_threshold` values.

## Public Embed / Share Features

The search module now exposes public token-authenticated features for embedded usage:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/search/embed/:token/config` | Share-page bootstrap config |
| POST | `/api/search/embed/:token/search` | Non-streaming paginated results |
| POST | `/api/search/embed/:token/ask` | Streaming answer generation |
| POST | `/api/search/embed/:token/related-questions` | Public follow-up suggestions |
| POST | `/api/search/embed/:token/mindmap` | Public mind map generation |

This is paired with the frontend route `/search/share/:token`.

## Search-App Presentation Features

Search apps now support two user-facing presentation fields:

| Field | Purpose |
|-------|---------|
| `avatar` | Emoji/icon branding on the main search page, app management table, and share page |
| `empty_response` | Custom no-results message displayed in the search UI |

## Feature Comparison

| Feature | Retrieval | LLM | Streaming | Public Token Support |
|---------|-----------|-----|-----------|----------------------|
| Mind map | Yes | Yes | No | Yes |
| Related questions | No | Yes | Final SSE payload only in `ask` | Yes |
| Retrieval test | Yes | No | No | No |
| Embed/share search | Yes | Yes | Yes | Yes |
| Search app avatar / empty response | No | No | No | Exposed via `/config` |

## Key Files

| File | Purpose |
|------|---------|
| `be/src/modules/search/services/search.service.ts` | All feature orchestration |
| `be/src/modules/search/controllers/search.controller.ts` | Endpoint handlers |
| `be/src/modules/search/controllers/search-embed.controller.ts` | Public token-authenticated handlers |
| `be/src/modules/search/routes/search-embed.routes.ts` | Embed/share route registration |
| `be/src/shared/services/related-questions.service.ts` | Shared follow-up question generation |
| `fe/src/features/search/pages/SearchSharePage.tsx` | Standalone share page |
