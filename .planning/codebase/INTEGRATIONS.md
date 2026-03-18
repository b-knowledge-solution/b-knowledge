# External Integrations

## Database — PostgreSQL 17

**Shared by:** Backend (Knex) + RAG Worker (Peewee)

| Consumer | ORM | Connection |
|----------|-----|------------|
| `be/` | Knex 3.1 | `config.db.*` → `DB_HOST:5432` |
| `advance-rag/` | Peewee | `config.py` → same DB |

- **Schema owner:** Backend manages migrations via `npm run db:migrate`
- **Auto-run:** Migrations execute on backend startup
- **RAG Worker:** Reads/writes documents, chunks, datasets via Peewee models

---

## Cache / Queue — Valkey 8 (Redis-compatible)

**Port:** 6379

### Backend Uses
- **Session store** (production) — `connect-redis`
- **Caching** — General key-value cache
- **Job queues** — RAG task dispatch, converter job queue
- **Pub/Sub** — Progress events → Socket.IO → SSE to frontend

### RAG Worker Uses
- **Task queue** — Polls for pending document processing tasks
- **Progress pub/sub** — Publishes per-document progress updates
- **Cache** — Model and embedding caches

### Converter Uses
- **Job queue** — Sorted set `converter:vjob:pending` for FIFO processing
- **Status tracking** — Per-file status hashes (`pending` → `processing` → `completed`/`failed`)
- **Pub/sub** — Progress events for frontend SSE
- **Manual trigger** — `converter:manual_trigger` key for on-demand processing
- **Schedule config** — `converter:schedule:config` hash

---

## Vector Search — OpenSearch 3.5.0

**Port:** 9201 | **Security:** Disabled by default (dev)

### Backend
- Client: `@opensearch-project/opensearch` via `be/src/shared/services/rag-query.service.ts`
- Creates/manages indices for knowledge bases

### RAG Worker
- Client: `opensearch-py` — vector indexing and kNN search
- Stores document chunk embeddings
- Performs hybrid search (vector + BM25)

---

## Object Storage — RustFS (S3-compatible)

**API Port:** 9000 | **Console Port:** 9001

### Backend
- Client: `minio` npm package via `be/src/shared/services/minio.service.ts`
- Stores uploaded documents, exports

### RAG Worker
- Client: `minio` Python package
- Reads source documents for parsing
- Stores processed artifacts

---

## LLM Providers

### Backend (`be/src/shared/services/llm-client.service.ts`)
- **OpenAI SDK** — Primary client (OpenAI-compatible endpoint)
- **Streaming support** — SSE for chat responses
- Proxied through configurable base URL

### RAG Worker (`advance-rag/rag/llm/`)
- **LiteLLM** — Multi-provider routing (OpenAI, Azure, Google, Ollama)
- **OpenAI SDK** — Direct OpenAI calls
- **Ollama** — Local model support
- **Langfuse** — LLM call tracing and cost tracking

---

## Observability — Langfuse

### Backend
- `be/src/shared/services/langfuse.service.ts`
- Traces LLM calls and chat sessions
- Flush on graceful shutdown

### RAG Worker
- Python `langfuse` SDK
- Traces document parsing and embedding operations

---

## Real-time Communication — Socket.IO

### Backend → Frontend
- Server: `be/src/shared/services/socket.service.ts`
- Events: document processing progress, chat streaming, system notifications
- Auth: Session-based (socket handshake uses session cookies)

### Frontend
- Client: `fe/src/lib/socket.ts` — Singleton pattern with auto-reconnect
- Hook: `useSocketEvent(name, callback)` for subscriptions
- Integration: `useSocketQueryInvalidation()` maps events → TanStack Query invalidation

---

## Authentication

### Azure AD (SSO)
- Backend handles OAuth flow
- Frontend feature-flagged via `VITE_ENABLE_AZURE_AD`

### Local Authentication
- Password hashing: `bcryptjs`
- Sessions: `express-session` + Redis store (production)
- Feature-flagged: `ENABLE_LOCAL_LOGIN`

---

## Text-to-Speech

- Backend service: `be/src/shared/services/tts.service.ts`
- Configurable TTS provider endpoint

---

## Web Search

- Backend service: `be/src/shared/services/web-search.service.ts`
- Used for search-augmented RAG queries

---

## Inter-Service Communication

```
┌─────────────┐     HTTP Proxy      ┌──────────────┐
│   Frontend   │ ──────────────────→ │   Backend    │
│  (Vite:5173) │     /api/*         │ (Express:3001)│
└──────┬───────┘                    └───────┬───────┘
       │                                    │
       │  Socket.IO                         │  Redis pub/sub + queues
       │                                    │
       │                              ┌─────┴──────┐
       │                              │   Valkey    │
       │                              │  (Redis)    │
       │                              └─────┬──────┘
       │                                    │
       │                        ┌───────────┼───────────┐
       │                        │                       │
       │                  ┌─────┴──────┐         ┌──────┴──────┐
       │                  │ RAG Worker │         │  Converter  │
       │                  │ (Python)   │         │  (Python)   │
       │                  └────────────┘         └─────────────┘
```

- **Frontend → Backend:** Vite proxy (`/api` → localhost:3001)
- **Backend → Workers:** Redis queues (no direct HTTP)
- **Workers → Backend:** Redis pub/sub (progress events)
- **All services → PostgreSQL:** Direct DB connection
- **RAG Worker → OpenSearch:** Direct connection for vector ops
- **All services → RustFS:** S3 API for file storage
