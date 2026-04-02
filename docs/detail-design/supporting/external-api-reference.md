# External API Reference — RAG Chat, Search & Retrieval

## Overview

B-Knowledge exposes two categories of external APIs for programmatic integration:

1. **Evaluation API** (`/api/v1/external/*`) — Structured JSON responses designed for RAG evaluation tools (e.g., promptfoo). Returns answer, contexts, sources, and timing metadata.
2. **OpenAI-Compatible API** (`/api/v1/chat/completions`, `/api/v1/search/completions`) — Drop-in replacements for OpenAI endpoints, supporting streaming (SSE) and non-streaming responses.

---

## Authentication

### Evaluation API — Bearer API Key

Generate API keys in the B-Knowledge admin UI under **Settings > API Keys**.

```
Authorization: Bearer bk-xxxxxxxxxxxxxxxxxxxx
```

Each key has **scopes** that control which endpoints it can access:

| Scope | Endpoint |
|-------|----------|
| `chat` | `POST /api/v1/external/chat` |
| `search` | `POST /api/v1/external/search` |
| `retrieval` | `POST /api/v1/external/retrieval` |

### OpenAI-Compatible API — Embed Token

Tokens are generated in the admin UI when creating embeddable assistants or search apps.

```
Authorization: Bearer <chat_embed_token or search_embed_token>
```

| Token Source | Endpoint |
|-------------|----------|
| `chat_embed_tokens` | `POST /api/v1/chat/completions` |
| `search_embed_tokens` | `POST /api/v1/search/completions` |

---

## Rate Limiting

| API | Limit | Window |
|-----|-------|--------|
| Evaluation API | 100 requests | 1 minute |
| OpenAI-Compatible | 1000 requests | 15 minutes |

Rate limit headers are included in responses:
- `RateLimit-Limit` — Maximum requests allowed
- `RateLimit-Remaining` — Requests remaining in window
- `RateLimit-Reset` — Seconds until window resets

---

## Evaluation API Endpoints

### POST /api/v1/external/chat

Full RAG chat: retrieve context from knowledge bases, generate an LLM answer with citations, return structured JSON.

**Scope required:** `chat`

#### Request Body

```json
{
  "query": "What is our refund policy?",
  "assistant_id": "uuid-of-assistant",
  "dataset_ids": ["uuid-1", "uuid-2"],
  "options": {
    "top_k": 10,
    "method": "hybrid",
    "similarity_threshold": 0.2,
    "vector_similarity_weight": 0.5,
    "temperature": 0.7,
    "max_tokens": 4096,
    "include_contexts": true,
    "include_metadata": true
  }
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | Yes | — | User question (1–10000 chars) |
| `assistant_id` | string (UUID) | No | — | Chat assistant to use (resolves datasets & LLM config) |
| `dataset_ids` | string[] (UUID) | No | — | Direct dataset targeting (alternative to assistant_id) |
| `options.top_k` | integer | No | 10 | Max chunks to retrieve (1–100) |
| `options.method` | enum | No | `hybrid` | Search method: `full_text`, `semantic`, `hybrid` |
| `options.similarity_threshold` | number | No | 0.2 | Minimum similarity score (0–1) |
| `options.vector_similarity_weight` | number | No | — | Weight for vector vs text in hybrid search (0–1) |
| `options.temperature` | number | No | 0.7 | LLM generation temperature (0–2) |
| `options.max_tokens` | integer | No | — | Max tokens for LLM response (1–32768) |
| `options.include_contexts` | boolean | No | true | Include retrieved chunks in response |
| `options.include_metadata` | boolean | No | true | Include timing/pipeline metadata |

> **Note:** Provide either `assistant_id` or `dataset_ids`. If `assistant_id` is given, its configured datasets are used.

#### Response (200 OK)

```json
{
  "answer": "Our refund policy allows returns within 30 days [1]. Items must be in original condition [2].",
  "contexts": [
    {
      "text": "Refund policy: customers may return products within 30 days of purchase...",
      "doc_id": "abc-123",
      "doc_name": "refund-policy.pdf",
      "chunk_id": "chunk-456",
      "score": 0.92,
      "page_num": [3],
      "token_count": 128
    }
  ],
  "sources": [
    {
      "doc_id": "abc-123",
      "doc_name": "refund-policy.pdf",
      "chunk_count": 3
    }
  ],
  "metadata": {
    "model": "b-knowledge-rag",
    "assistant_id": "uuid-of-assistant",
    "retrieval_ms": 145,
    "generation_ms": 1230,
    "total_ms": 1402,
    "chunks_retrieved": 25,
    "chunks_after_rerank": 10,
    "search_method": "hybrid"
  }
}
```

---

### POST /api/v1/external/search

Search with AI summary: retrieve from search apps or datasets, generate a summary with citations.

**Scope required:** `search`

#### Request Body

```json
{
  "query": "How to configure SSO?",
  "search_app_id": "uuid-of-search-app",
  "dataset_ids": ["uuid-1"],
  "options": {
    "top_k": 5,
    "method": "semantic",
    "temperature": 0.5,
    "include_contexts": true
  }
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | Yes | — | Search query (1–10000 chars) |
| `search_app_id` | string (UUID) | No | — | Search app to use (resolves datasets & LLM config) |
| `dataset_ids` | string[] (UUID) | No | — | Direct dataset targeting (alternative to search_app_id) |
| `options` | object | No | `{}` | Same options as the chat endpoint |

> **Note:** Provide either `search_app_id` or `dataset_ids`.

#### Response (200 OK)

Same structure as the chat endpoint. `metadata.model` is `"b-knowledge-search"` and `metadata.search_app_id` replaces `assistant_id`.

---

### POST /api/v1/external/retrieval

Retrieval-only: returns raw retrieved chunks without LLM generation. Useful for evaluating retrieval quality independently.

**Scope required:** `retrieval`

#### Request Body

```json
{
  "query": "authentication methods",
  "dataset_ids": ["uuid-1", "uuid-2"],
  "options": {
    "top_k": 20,
    "method": "hybrid",
    "similarity_threshold": 0.3
  }
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | Yes | — | Search query (1–10000 chars) |
| `dataset_ids` | string[] (UUID) | **Yes** | — | At least one dataset ID required |
| `options` | object | No | `{}` | Retrieval options (no temperature/max_tokens — no LLM used) |

#### Response (200 OK)

```json
{
  "contexts": [
    {
      "text": "B-Knowledge supports SAML, OIDC, and local authentication...",
      "doc_id": "doc-789",
      "doc_name": "auth-guide.md",
      "chunk_id": "chunk-012",
      "score": 0.88,
      "page_num": [1, 2]
    }
  ],
  "sources": [
    {
      "doc_id": "doc-789",
      "doc_name": "auth-guide.md",
      "chunk_count": 2
    }
  ],
  "metadata": {
    "retrieval_ms": 98,
    "total_ms": 98,
    "chunks_retrieved": 15,
    "chunks_after_rerank": 10,
    "search_method": "hybrid"
  }
}
```

---

## OpenAI-Compatible Endpoints

### POST /api/v1/chat/completions

Drop-in replacement for OpenAI's chat completion API. Supports streaming (SSE) and non-streaming modes.

**Auth:** Bearer token from `chat_embed_tokens`

#### Request Body

```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "What is our refund policy?" }
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 1024
}
```

#### Streaming Response (SSE)

```
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1711680000,"choices":[{"index":0,"delta":{"content":"Our"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1711680000,"choices":[{"index":0,"delta":{"content":" refund"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1711680000,"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

#### Non-Streaming Response (200 OK)

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1711680000,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Our refund policy allows..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 52,
    "completion_tokens": 128,
    "total_tokens": 180
  }
}
```

---

### POST /api/v1/search/completions

OpenAI-compatible search with AI summary. Same request/response format as chat completions but routes to the search pipeline.

**Auth:** Bearer token from `search_embed_tokens`

Request and response formats are identical to `/api/v1/chat/completions`. The `model` field in responses is `"b-knowledge-search"`.

---

### GET /api/v1/models

List available models (public, no auth required).

#### Response (200 OK)

```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4o",
      "object": "model",
      "owned_by": "b-knowledge"
    }
  ]
}
```

---

## Error Responses

### Evaluation API Errors

```json
{
  "error": {
    "message": "Description of the error",
    "type": "error_type"
  }
}
```

| HTTP Status | Type | Cause |
|-------------|------|-------|
| 400 | `invalid_request_error` | Resource not found, no datasets specified |
| 401 | `invalid_request_error` | Missing Bearer token |
| 401 | `authentication_error` | Invalid or expired API key |
| 403 | `permission_error` | API key lacks required scope |
| 429 | `rate_limit_error` | 100 requests/minute exceeded |
| 500 | `server_error` | Internal pipeline failure |

### OpenAI-Compatible Errors

```json
{
  "error": {
    "message": "Invalid authentication token",
    "type": "invalid_request_error",
    "code": "invalid_api_key"
  }
}
```

| HTTP Status | Code | Cause |
|-------------|------|-------|
| 401 | `invalid_api_key` | Missing or invalid Bearer token |
| 404 | `model_not_found` | Requested model unavailable |
| 429 | `rate_limit_exceeded` | Too many requests |
| 500 | `internal_error` | Pipeline failure |

---

## Code Examples

### Python — Evaluation API Chat

```python
import requests

API_URL = "https://your-instance.com/api/v1/external/chat"
API_KEY = "bk-xxxxxxxxxxxxxxxxxxxx"

response = requests.post(
    API_URL,
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "query": "What is our refund policy?",
        "dataset_ids": ["dataset-uuid-1"],
        "options": {
            "top_k": 5,
            "method": "hybrid",
            "include_contexts": True,
        },
    },
)

data = response.json()
print(f"Answer: {data['answer']}")
print(f"Sources: {[s['doc_name'] for s in data['sources']]}")
print(f"Retrieval: {data['metadata']['retrieval_ms']}ms")
```

### Python — OpenAI-Compatible Chat (using OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-instance.com/api/v1",
    api_key="your-chat-embed-token",
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "What is our refund policy?"}],
    stream=True,
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

### cURL — Retrieval Only

```bash
curl -X POST https://your-instance.com/api/v1/external/retrieval \
  -H "Authorization: Bearer bk-xxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "authentication methods",
    "dataset_ids": ["dataset-uuid-1"],
    "options": { "top_k": 10, "method": "semantic" }
  }'
```

### TypeScript — Evaluation API Search

```typescript
const response = await fetch('https://your-instance.com/api/v1/external/search', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer bk-xxxxxxxxxxxxxxxxxxxx',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: 'How to configure SSO?',
    search_app_id: 'search-app-uuid',
    options: { top_k: 5, method: 'hybrid' },
  }),
})

const data = await response.json()
console.log(data.answer)
console.log(`Retrieved ${data.metadata.chunks_retrieved} chunks in ${data.metadata.retrieval_ms}ms`)
```

---

## API Key Management

API keys are managed via the session-authenticated admin endpoints:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/external/api-keys` | Create a new API key |
| GET | `/api/external/api-keys` | List all API keys |
| PATCH | `/api/external/api-keys/:id` | Update key name, scopes, or active status |
| DELETE | `/api/external/api-keys/:id` | Permanently delete a key |

### Create API Key

```json
POST /api/external/api-keys
{
  "name": "Promptfoo Evaluation",
  "scopes": ["chat", "search", "retrieval"],
  "expires_at": "2025-12-31T23:59:59Z"
}
```

Response includes the raw key (shown only once):

```json
{
  "id": "uuid",
  "name": "Promptfoo Evaluation",
  "key": "bk-xxxxxxxxxxxxxxxxxxxx",
  "scopes": ["chat", "search", "retrieval"],
  "expires_at": "2025-12-31T23:59:59Z",
  "created_at": "2025-01-15T10:00:00Z"
}
```
