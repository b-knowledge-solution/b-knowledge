# Architecture

## System Pattern

**Modular monorepo** with 4 independently deployable services sharing PostgreSQL, Redis, and S3-compatible storage. NX-style module boundary rules enforced in both TypeScript workspaces.

---

## High-Level Data Flow

```
User Browser
    │
    ├── HTTP/WS ──→ Frontend (React SPA, Vite:5173)
    │                   │
    │                   ├── /api/* proxy ──→ Backend (Express:3001)
    │                   │                      │
    │                   │                      ├──→ PostgreSQL (data)
    │                   │                      ├──→ Valkey/Redis (cache, sessions, queues)
    │                   │                      ├──→ RustFS/S3 (file storage)
    │                   │                      ├──→ OpenSearch (search queries)
    │                   │                      └──→ LLM Provider (AI chat/search)
    │                   │
    │                   └── Socket.IO ──→ Backend (real-time updates)
    │
    └── SSE (via Socket.IO) ← Backend ← Redis pub/sub ← Workers

Workers (poll Redis queues independently):
  ├── RAG Worker: document parsing → chunking → embedding → OpenSearch indexing
  └── Converter: Office → PDF conversion via LibreOffice
```

---

## Service Architecture

### Backend (Express)

**Pattern:** Layered MVC with domain modules

```
Request → Rate Limiter → Auth Middleware → Validation (Zod) →
  Controller → Service → Model (Knex) → PostgreSQL
                 └──→ Shared Services (Redis, S3, LLM, Socket.IO)
```

**Key abstractions:**
- `BaseModel<T>` — CRUD operations with optional transaction support
- `ModelFactory` — Singleton registry for all models
- `config` — Centralized env config (never use `process.env`)
- `validate(schema)` — Zod middleware for request validation

### Frontend (React SPA)

**Pattern:** Feature-based architecture with centralized data layer

```
Route → FeatureErrorBoundary → Page Component →
  ├── useQuery/useMutation (TanStack Query via *Queries.ts)
  │     └── *Api.ts (raw HTTP via lib/api.ts)
  ├── Components (shared UI + feature-specific)
  └── Contexts (theme, auth, settings)
```

**Key abstractions:**
- `api.get/post/put/delete` — Typed fetch wrapper with auto-401 redirect
- `queryKeys` — Centralized query key factory (`lib/queryKeys.ts`)
- `Providers` stack — Auth → Settings → Guideline → Confirm → QueryClient
- React Compiler — Automatic memoization (no manual React.memo)

### RAG Worker (Python)

**Pattern:** Task executor with pipeline stages

```
Redis Queue → executor_wrapper.py → task_executor.py →
  ├── Document Parser (rag/app/*.py — 15 parser types)
  │     └── deepdoc/ (OCR, layout analysis)
  ├── Chunking (rag/flow/splitter/)
  ├── Embedding (rag/llm/)
  └── Indexing (OpenSearch)
       └── Progress → Redis pub/sub → Backend → Frontend SSE
```

**Key abstractions:**
- Parser registry — `rag/app/` with type-specific parsers (naive, book, paper, etc.)
- Flow pipeline — `rag/flow/` with extractor → splitter → parser → tokenizer stages
- Graph RAG — `rag/graphrag/` for knowledge graph construction + querying

### Converter (Python)

**Pattern:** Polling worker with file-type dispatcher

```
Redis Sorted Set → worker.py → converter.py (dispatcher) →
  ├── word_converter.py (LibreOffice CLI)
  ├── powerpoint_converter.py (LibreOffice CLI)
  ├── excel_converter.py (Python-UNO bridge)
  └── pdf_processor.py (post-processing)
       └── Progress → Redis pub/sub
```

---

## Entry Points

| Service | Entry Point | Start Command |
|---------|------------|---------------|
| Backend | `be/src/app/index.ts` | `tsx watch src/app/index.ts` |
| Frontend | `fe/src/main.tsx` | `vite --host` |
| RAG Worker | `advance-rag/executor_wrapper.py` | `python -m executor_wrapper` |
| Converter | `converter/src/worker.py` | `python -m src.worker` |

---

## Backend Startup Sequence

1. Redis init (async connection)
2. Security middleware (Helmet CSP, CORS, cookies, compression)
3. Session setup (Redis in prod, memory in dev)
4. Route registration (all module routes under `/api/*`)
5. HTTP/HTTPS server start (HTTPS with SSL fallback to HTTP)
6. Socket.IO initialization
7. Knex migrations auto-run
8. Root admin user bootstrap
9. Cron job scheduling

---

## Authentication & Authorization

- **Azure AD SSO** — OAuth2 flow (feature-flagged)
- **Local auth** — bcrypt password hashing + session cookies
- **Session:** 7-day TTL, Redis store in production, memory in dev
- **Route protection:** Auth middleware on all `/api/*` routes (except health)
- **Role-based:** Admin/user roles with feature-level guards

---

## Real-time Architecture

```
Worker Progress → Redis Pub/Sub → Backend Subscriber →
  Socket.IO Server → Socket.IO Client (Frontend) →
    useSocketEvent() → Query Invalidation → UI Update
```

- Events mapped to TanStack Query invalidation in `useSocketQueryInvalidation()`
- Auto-reconnect with exponential backoff (5 attempts)

---

## Deployment Options

### Development
- `npm run dev` — Concurrent: BE + FE + RAG Worker + Converter
- Infrastructure: `docker compose -f docker/docker-compose-base.yml up`

### Production (Docker)
- `docker compose -f docker/docker-compose.yml up` — All app services
- nginx reverse proxy for SSL termination
- Separate infrastructure compose file
