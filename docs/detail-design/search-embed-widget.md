# Search Embed Widget - Detail Design

## Overview

The search embed widget allows external sites to embed B-Knowledge search functionality via an iframe or IIFE bundle. Like the chat embed widget, it uses token-based authentication instead of user sessions, enabling anonymous public access. An OpenAI-compatible endpoint is also provided.

## Token Management

```mermaid
stateDiagram-v2
    [*] --> Created: POST /api/search/apps/:id/embed-tokens
    Created --> Active: Token issued
    Active --> Active: Public requests
    Active --> Revoked: DELETE .../embed-tokens/:tokenId
    Revoked --> [*]
```

### Token CRUD

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/search/apps/:id/embed-tokens` | Create new embed token |
| GET | `/api/search/apps/:id/embed-tokens` | List all tokens for this app |
| DELETE | `/api/search/apps/:id/embed-tokens/:tokenId` | Revoke a token |

Token creation and management requires an authenticated admin session. The generated tokens themselves are used for public access.

## End-to-End Sequence

```mermaid
sequenceDiagram
    participant Admin
    participant BE as Backend API
    participant Widget as Embed Widget (iframe)
    participant LLM as LLM Provider

    Admin->>BE: POST /api/search/apps/:id/embed-tokens
    BE-->>Admin: { token, embed_url }

    Note over Widget: Host page loads iframe with token

    Widget->>BE: GET /api/search/embed/:token/info
    BE-->>Widget: { app_name, search_config, welcome_message }

    Widget->>BE: POST /api/search/embed/:token/ask<br/>{query, method, top_k}
    Note right of BE: SSE streaming response

    BE->>BE: Retrieve chunks from bound datasets
    BE->>LLM: Stream LLM completion
    LLM-->>BE: Delta tokens
    BE-->>Widget: SSE: {status: "retrieving"}
    BE-->>Widget: SSE: {status: "generating"}
    BE-->>Widget: SSE: {reference: {chunks, doc_aggs}}
    BE-->>Widget: SSE: {delta: "token"} ...
    BE-->>Widget: SSE: {answer, reference, metrics}
    BE-->>Widget: SSE: [DONE]
```

## Public API Endpoints

All embed endpoints bypass session authentication. The embed token is the sole credential.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/search/embed/:token/info` | Retrieve search app metadata and config |
| POST | `/api/search/embed/:token/search` | Chunk search (non-streaming) |
| POST | `/api/search/embed/:token/ask` | AI-summarized search (SSE streaming) |

## OpenAI-Compatible Endpoint

```mermaid
sequenceDiagram
    participant Client as External Client
    participant BE as Backend API
    participant LLM as LLM Provider

    Client->>BE: POST /v1/search/completions<br/>Authorization: Bearer <embed_token>
    BE->>BE: Resolve token → search app + dataset context
    BE->>BE: Retrieve relevant chunks
    BE->>LLM: Forward query with chunk context
    LLM-->>BE: Stream completion chunks
    BE-->>Client: SSE chunks (OpenAI-compatible format)
```

- **Auth**: `Authorization: Bearer <embed_token>` header.
- **Request body**: `{ model, messages, stream }` following OpenAI schema.
- **Response**: OpenAI-compatible SSE chunks with `choices[].delta.content`.

## Widget Integration

### IIFE Bundle

```html
<script src="https://your-domain/embed/search-widget.iife.js"></script>
<script>
  BKnowledgeSearch.init({
    token: 'embed_token_value',
    containerId: 'search-container',
    placeholder: 'Search our knowledge base...'
  });
</script>
```

### iframe Embedding

```html
<iframe
  src="https://your-domain/embed/search?token=embed_token_value"
  width="600" height="500"
  style="border:none;">
</iframe>
```

### CORS and Security

- **frame-ancestors**: CSP relaxed for embed routes to permit cross-origin iframe loading.
- **CORS**: Permissive `Access-Control-Allow-Origin: *` on embed endpoints.
- **Rate limiting**: Token-scoped rate limits to prevent abuse.

## Key Files

| File | Purpose |
|------|---------|
| `be/src/modules/search/controllers/search-embed.controller.ts` | Embed endpoint handlers |
| `be/src/modules/search/services/search-embed.service.ts` | Token management, public search logic |
| `be/src/modules/search/routes/search-embed.routes.ts` | Embed route definitions |
