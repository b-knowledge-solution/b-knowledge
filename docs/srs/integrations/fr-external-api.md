# FR: External API & API Key Management

> Provide a programmatic REST API for external systems to access RAG chat, search, and retrieval capabilities using scoped API keys, enabling evaluation pipelines, third-party integrations, and automated testing.

## 1. Overview

The External API module exposes evaluation-ready endpoints for chat, search, and retrieval operations, authenticated via Bearer API keys instead of session cookies. This enables external systems (CI/CD pipelines, evaluation frameworks, partner integrations) to programmatically interact with B-Knowledge.

### 1.1 Goals

- Provide structured, non-streaming API responses suitable for automated evaluation
- Support scoped API keys with granular permissions (chat, search, retrieval)
- Enable API key lifecycle management (create, list, update, revoke)
- Rate-limit external access separately from internal UI usage

### 1.2 Actors

| Actor | Capabilities |
|-------|-------------|
| Authenticated User | Create, list, update, and delete their own API keys |
| External System | Use API keys to call chat, search, and retrieval endpoints |

## 2. Functional Requirements

### 2.1 API Key Management

- **FR-EA-001**: Users shall create API keys with a name and set of scopes (`chat`, `search`, `retrieval`).
- **FR-EA-002**: The system shall display the full API key value only once at creation time.
- **FR-EA-003**: Users shall list all their API keys with masked values and metadata (name, scopes, active status, created date).
- **FR-EA-004**: Users shall update API key properties (name, scopes, active/inactive status).
- **FR-EA-005**: Users shall permanently delete API keys.
- **FR-EA-006**: Deactivated API keys shall be rejected at authentication time.

### 2.2 External Chat Endpoint

- **FR-EA-010**: The system shall provide a chat endpoint that performs full RAG (retrieval + LLM generation) and returns a structured JSON response.
- **FR-EA-011**: The chat endpoint shall require the `chat` scope on the API key.
- **FR-EA-012**: Responses shall include the answer, retrieved chunks with scores, and metadata.

### 2.3 External Search Endpoint

- **FR-EA-020**: The system shall provide a search endpoint that performs search with AI summary and returns structured JSON.
- **FR-EA-021**: The search endpoint shall require the `search` scope on the API key.

### 2.4 External Retrieval Endpoint

- **FR-EA-030**: The system shall provide a retrieval-only endpoint (no LLM generation) for context evaluation.
- **FR-EA-031**: The retrieval endpoint shall require the `retrieval` scope on the API key.
- **FR-EA-032**: Responses shall include ranked chunks with relevance scores.

### 2.5 Authentication & Rate Limiting

- **FR-EA-040**: External API endpoints shall authenticate via `Authorization: Bearer <api-key>` header.
- **FR-EA-041**: External API rate limit: 100 requests per minute per IP.
- **FR-EA-042**: Each endpoint shall enforce scope checks against the API key's granted scopes.

## 3. API Endpoints

### External API (Bearer token auth)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/external/chat` | API Key (scope: chat) | RAG chat |
| POST | `/api/v1/external/search` | API Key (scope: search) | Search + AI summary |
| POST | `/api/v1/external/retrieval` | API Key (scope: retrieval) | Retrieval only |

### API Key Management (Session auth)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/external/api-keys` | Yes | List API keys |
| POST | `/api/external/api-keys` | Yes | Create API key |
| PATCH | `/api/external/api-keys/:id` | Yes | Update API key |
| DELETE | `/api/external/api-keys/:id` | Yes | Delete API key |

## 4. Security

- API keys are hashed before storage (only shown once at creation)
- Scope-based authorization prevents overreach
- Separate rate limiter from internal API (100 req/min vs 1000 req/15min)
- API keys are per-user and tenant-scoped

## 5. Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `EXTERNAL_TRACE_ENABLED` | `true` | Enable external trace API |
| `EXTERNAL_TRACE_API_KEY` | — | Legacy admin API key (required in production) |
| `EXTERNAL_TRACE_CACHE_TTL` | `300` | Email validation cache TTL (seconds) |
| `EXTERNAL_TRACE_LOCK_TIMEOUT` | `5000` | Race condition lock timeout (ms) |

## 6. Dependencies

- [AI Chat](/srs/ai-features/fr-ai-chat) — Chat completion pipeline reused by external chat endpoint
- [AI Search](/srs/ai-features/fr-ai-search) — Search pipeline reused by external search endpoint
- [Retrieval Pipeline](/srs/core-platform/fr-retrieval-pipeline) — Retrieval logic reused by external retrieval endpoint
- [Authentication](/srs/core-platform/fr-authentication) — Session auth for API key management endpoints
