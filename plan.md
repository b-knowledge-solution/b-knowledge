# Implementation Plan: API Key Management + External Evaluation API

## Overview

Two interconnected features:
1. **API Key Management Page** — Users can CRUD personal API keys for external API access
2. **External Evaluation API** — REST endpoints authenticated via API keys, returning structured responses compatible with [promptfoo RAG evaluation](https://www.promptfoo.dev/docs/guides/evaluate-rag/)

---

## Part 1: API Key Management (Backend)

### 1.1 Database Migration — `api_keys` table

**File:** `be/src/shared/db/migrations/20260322000000_create_api_keys.ts`

```sql
CREATE TABLE api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,           -- human-readable label
  key_prefix    VARCHAR(8) NOT NULL,             -- first 8 chars for display (e.g. "bk-a1b2...")
  key_hash      VARCHAR(128) NOT NULL,           -- SHA-256 hash of the full key
  scopes        JSONB NOT NULL DEFAULT '["chat","search","retrieval"]',  -- permitted API scopes
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,                     -- optional expiration
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
```

**Key difference from embed tokens:** API keys are hashed (SHA-256) and never stored in plaintext. The full key is only returned once on creation. This follows security best practices — embed tokens are stored plaintext because they're short-lived widget tokens, but user API keys are long-lived credentials.

### 1.2 Backend Module — `be/src/modules/external/`

**Structure (≥5 files → sub-directory layout):**
```
be/src/modules/external/
├── controllers/
│   ├── api-key.controller.ts        # CRUD endpoints for API keys
│   └── external-api.controller.ts   # External evaluation API endpoints
├── services/
│   ├── api-key.service.ts           # Key generation, hashing, validation
│   └── external-api.service.ts      # Evaluation API orchestration
├── models/
│   └── api-key.model.ts             # Knex model extending BaseModel
├── schemas/
│   └── external.schemas.ts          # Zod schemas for all endpoints
├── routes/
│   ├── api-key.routes.ts            # /api/external/api-keys (session auth)
│   └── external-api.routes.ts       # /api/v1/external/* (API key auth)
└── index.ts                         # Barrel export
```

### 1.3 API Key Service

**`api-key.service.ts`** — Core operations:

| Method | Purpose |
|--------|---------|
| `generateKey()` | Generate `bk-<40 random hex chars>` format key |
| `hashKey(key)` | SHA-256 hash for storage |
| `createApiKey(userId, name, scopes, expiresAt?)` | Create key, return full key once |
| `listApiKeys(userId)` | List user's keys (prefix + masked) |
| `revokeApiKey(userId, keyId)` | Soft-deactivate key |
| `deleteApiKey(userId, keyId)` | Hard delete |
| `validateApiKey(rawKey)` | Hash lookup + active + expiry check (with in-memory cache) |
| `updateLastUsed(keyId)` | Bump `last_used_at` (debounced) |

### 1.4 API Key Routes (Session Auth)

**Path:** `POST|GET|DELETE /api/external/api-keys`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/external/api-keys` | `requireAuth` | Create new API key |
| `GET` | `/api/external/api-keys` | `requireAuth` | List user's API keys |
| `DELETE` | `/api/external/api-keys/:id` | `requireAuth` + ownership | Revoke/delete key |
| `PATCH` | `/api/external/api-keys/:id` | `requireAuth` + ownership | Update name/scopes/active |

### 1.5 API Key Auth Middleware

**`external-auth.middleware.ts`** in shared middleware:

```typescript
// Extracts Bearer token from Authorization header
// Validates via apiKeyService.validateApiKey()
// Attaches user context to req (req.apiKeyUser)
// Returns 401 with OpenAI-format error if invalid
```

---

## Part 2: External Evaluation API (Backend)

### 2.1 Endpoint Design for Promptfoo Compatibility

Promptfoo uses an [HTTP provider](https://www.promptfoo.dev/docs/providers/http/) that can call any REST API. The response must include structured fields that `transformResponse`, `transform`, and `contextTransform` can extract.

### 2.2 API Endpoints

**Base path:** `/api/v1/external/`

| Method | Path | Description | Promptfoo Use |
|--------|------|-------------|---------------|
| `POST` | `/v1/external/chat` | RAG chat with full context return | Main chat evaluation endpoint |
| `POST` | `/v1/external/search` | Search with full context return | Search evaluation |
| `POST` | `/v1/external/retrieval` | Retrieval-only (no LLM generation) | Context-only evaluation |

### 2.3 Request Format

```typescript
// POST /api/v1/external/chat  (or /search or /retrieval)
{
  "query": "What is the capital of France?",
  "assistant_id": "uuid",          // optional: specific chat assistant
  "search_app_id": "uuid",         // optional: specific search app
  "dataset_ids": ["uuid"],         // optional: direct dataset targeting
  "options": {
    "top_k": 10,                   // retrieval count
    "method": "hybrid",            // full_text | semantic | hybrid
    "similarity_threshold": 0.2,
    "temperature": 0.7,
    "max_tokens": 2048,
    "include_contexts": true,      // return retrieved chunks (default: true)
    "include_metadata": true       // return timing/scoring metadata
  }
}
```

### 2.4 Response Format (Promptfoo-Compatible)

The response is designed so promptfoo can use:
- `transform: 'json.answer'` → extract the answer for assertions
- `contextTransform: 'json.contexts.map(c => c.text).join("\\n\\n")'` → extract contexts for RAG metrics

```typescript
// Response
{
  "answer": "The capital of France is Paris. [1]",
  "contexts": [
    {
      "text": "Paris is the capital and most populous city of France...",
      "doc_id": "uuid",
      "doc_name": "Geography.pdf",
      "chunk_id": "chunk_abc",
      "score": 0.95,
      "page_num": [1],
      "token_count": 156
    }
  ],
  "sources": [
    {
      "doc_id": "uuid",
      "doc_name": "Geography.pdf",
      "chunk_count": 3
    }
  ],
  "metadata": {
    "model": "b-knowledge-rag",
    "assistant_id": "uuid",
    "retrieval_ms": 245,
    "generation_ms": 1230,
    "total_ms": 1475,
    "chunks_retrieved": 6,
    "chunks_after_rerank": 3,
    "query_refined": "capital of France Paris",
    "search_method": "hybrid"
  }
}
```

### 2.5 Retrieval-Only Endpoint

```typescript
// POST /api/v1/external/retrieval
// Response (no LLM generation)
{
  "contexts": [...],   // same format as above
  "sources": [...],
  "metadata": {
    "retrieval_ms": 245,
    "chunks_retrieved": 6,
    "search_method": "hybrid"
  }
}
```

### 2.6 Promptfoo RAG Metrics Coverage

The response format supports all key promptfoo RAG metrics:

| Metric | Assertion Type | Data Source | How It Works |
|--------|---------------|-------------|--------------|
| **Context Faithfulness** | `context-faithfulness` | `contexts` + `answer` | Checks answer is grounded in retrieved context (no hallucination) |
| **Context Relevance** | `context-relevance` | `contexts` + `query` | Checks retrieved context is relevant to the query |
| **Context Recall** | `context-recall` | `contexts` + ground truth `vars` | Checks context contains the correct reference info |
| **Answer Relevance** | `answer-relevance` | `answer` + `query` | Checks answer directly addresses the question |
| **Factuality** | `factuality` | `answer` + expected answer | Checks factual accuracy against expected |
| **Custom metrics** | `javascript`/`python` | Full response | User-defined assertions on any response field |

### 2.7 Example Promptfoo Config

```yaml
providers:
  - id: http
    config:
      url: "http://localhost:3001/api/v1/external/chat"
      method: POST
      headers:
        Authorization: "Bearer bk-your-api-key-here"
        Content-Type: "application/json"
      body:
        query: "{{query}}"
        dataset_ids: ["your-dataset-id"]
        options:
          top_k: 5
          method: "hybrid"
      transformResponse: "json"

defaultTest:
  options:
    transform: "output.answer"
    provider: "openai:gpt-4o-mini"
  assert:
    - type: context-faithfulness
      threshold: 0.8
      value: "output.contexts.map(c => c.text).join('\\n\\n')"
    - type: context-relevance
      threshold: 0.7
      value: "output.contexts.map(c => c.text).join('\\n\\n')"
    - type: answer-relevance
      threshold: 0.8
    - type: context-recall
      threshold: 0.8
      value: "output.contexts.map(c => c.text).join('\\n\\n')"

tests:
  - vars:
      query: "What is the reimbursement policy?"
      context: "The reimbursement policy covers..."  # ground truth for recall
    assert:
      - type: contains
        value: "reimbursement"
```

### 2.8 External API Service

**`external-api.service.ts`** — Orchestrates the full pipeline without SSE streaming:

- **Chat endpoint:** Reuses the RAG pipeline components directly (ragSearchService for retrieval, ragRerankService for reranking, llmClientService for generation) — assembles a non-streaming structured JSON response with full context. Does NOT use the SSE streamChat pattern.
- **Search endpoint:** Calls `searchService.retrieveChunks()` (private, needs to be exposed or duplicated) + LLM summary, returns structured JSON.
- **Retrieval endpoint:** Calls `ragSearchService.search()` only, returns chunks without LLM.

This avoids the mock-response interceptor pattern used by OpenAI-compatible endpoints. Instead, it calls the underlying service methods directly and assembles a structured response.

### 2.9 Rate Limiting & Usage Tracking

- Separate rate limiter: 100 requests/minute per API key
- Log each request to `query_log` table (existing) with `source: 'external_api'`
- Track `last_used_at` on the api_key record

---

## Part 3: Frontend — API Key Management Page

### 3.1 Feature Module

**Structure:**
```
fe/src/features/api-keys/
├── api/
│   ├── apiKeyApi.ts          # Raw HTTP calls
│   └── apiKeyQueries.ts      # TanStack Query hooks
├── components/
│   ├── ApiKeyTable.tsx        # Table with masked keys, actions
│   ├── CreateApiKeyDialog.tsx # Form: name, scopes, expiration
│   └── ApiKeyCreatedDialog.tsx # One-time key display with copy
├── pages/
│   └── ApiKeysPage.tsx        # Main CRUD page
├── types/
│   └── apiKey.types.ts
└── index.ts
```

### 3.2 Page Location in Sidebar

Add to the **Data Studio** group (since API keys are used for data evaluation):

```typescript
{
  path: '/data-studio/api-keys',
  labelKey: 'nav.apiKeys',
  icon: Key,  // from lucide-react
  roles: ['super-admin', 'admin', 'leader'],
}
```

### 3.3 Page Components

**ApiKeysPage.tsx:**
- Header with title + description + "Create API Key" button
- Table showing: Name, Key (masked: `bk-a1b2...`), Scopes (badges), Status, Created, Last Used, Actions
- Actions: Toggle active, Delete (with confirm dialog)
- Empty state with illustration when no keys exist

**CreateApiKeyDialog.tsx:**
- Fields: Name (required), Scopes (multi-select checkboxes: chat, search, retrieval), Expiration (optional date picker)
- On submit → POST creates key → closes dialog → opens ApiKeyCreatedDialog

**ApiKeyCreatedDialog.tsx:**
- One-time display of the full API key in a code block
- Copy to clipboard button
- Warning: "This key will not be shown again"
- Collapsible section showing example curl command and promptfoo config snippet
- "Done" button to close

### 3.4 i18n Keys

Add to all 3 locale files (`en.json`, `vi.json`, `ja.json`):
```json
{
  "apiKeys": {
    "title": "API Keys",
    "description": "Manage API keys for external API access and evaluation tools like promptfoo",
    "createKey": "Create API Key",
    "name": "Name",
    "namePlaceholder": "e.g. Promptfoo Evaluation",
    "scopes": "Scopes",
    "status": "Status",
    "active": "Active",
    "inactive": "Inactive",
    "lastUsed": "Last Used",
    "expiresAt": "Expires",
    "never": "Never",
    "neverUsed": "Never used",
    "createdSuccess": "API key created successfully",
    "deleteConfirm": "Are you sure you want to delete this API key? This action cannot be undone.",
    "deleteSuccess": "API key deleted",
    "updateSuccess": "API key updated",
    "keyCreated": "API Key Created",
    "keyCreatedWarning": "Copy this key now. It will not be shown again.",
    "copyKey": "Copy Key",
    "copied": "Copied!",
    "scopeChat": "Chat",
    "scopeSearch": "Search",
    "scopeRetrieval": "Retrieval",
    "exampleUsage": "Example Usage",
    "noKeys": "No API keys yet",
    "noKeysDescription": "Create an API key to use the external evaluation API"
  },
  "nav": {
    "apiKeys": "API Keys"
  }
}
```

### 3.5 Route & Navigation Registration

**`App.tsx`:** Add lazy route under Data Studio:
```typescript
const ApiKeysPage = lazy(() => import('@/features/api-keys/pages/ApiKeysPage'))
// Under Data Studio routes
<Route path="data-studio/api-keys" element={...} />
```

**`routeConfig.ts`:** Add route metadata with `titleKey: 'apiKeys.title'`

**`sidebarNav.ts`:** Add nav item to Data Studio group

**`queryKeys.ts`:** Add `apiKeys` key factory

---

## Part 4: Implementation Order

| Step | Task | Files |
|------|------|-------|
| 1 | DB migration for `api_keys` table | `be/src/shared/db/migrations/20260322000000_create_api_keys.ts` |
| 2 | API Key model + ModelFactory registration | `be/src/modules/external/models/api-key.model.ts`, `be/src/shared/models/factory.ts` |
| 3 | API Key service (generate, hash, CRUD, validate) | `be/src/modules/external/services/api-key.service.ts` |
| 4 | API Key auth middleware | `be/src/shared/middleware/external-auth.middleware.ts` |
| 5 | Zod schemas for all endpoints | `be/src/modules/external/schemas/external.schemas.ts` |
| 6 | API Key CRUD controller + routes | `be/src/modules/external/controllers/api-key.controller.ts`, `be/src/modules/external/routes/api-key.routes.ts` |
| 7 | External API service (chat, search, retrieval) | `be/src/modules/external/services/external-api.service.ts` |
| 8 | External API controller + routes | `be/src/modules/external/controllers/external-api.controller.ts`, `be/src/modules/external/routes/external-api.routes.ts` |
| 9 | Register routes in `app/routes.ts` | `be/src/app/routes.ts` |
| 10 | Barrel export | `be/src/modules/external/index.ts` |
| 11 | FE: Types + API layer | `fe/src/features/api-keys/types/`, `fe/src/features/api-keys/api/` |
| 12 | FE: Components (table, dialogs) | `fe/src/features/api-keys/components/` |
| 13 | FE: Page + routing + sidebar + query keys | Various app config files |
| 14 | FE: i18n (3 locales) | `fe/src/i18n/locales/{en,vi,ja}.json` |
| 15 | Build verification | `npm run build` |

---

## Key Design Decisions

1. **Hashed keys** (not plaintext like embed tokens) — API keys are long-lived user credentials
2. **Non-streaming response** for external API — Promptfoo and evaluation tools need full JSON, not SSE
3. **Direct service calls** instead of mock-response interceptor — cleaner than the OpenAI-compatible pattern
4. **Scopes** — Allow granular access control (chat only, search only, retrieval only, or all)
5. **User-scoped keys** — Each user creates their own keys, accessing resources they have permission to
6. **Structured context return** — Every chunk returned with score, doc_name, text for full promptfoo metric support
7. **Per-key rate limiting** — 100 req/min per key to prevent abuse while allowing evaluation workloads
