# Architecture

**Analysis Date:** 2026-03-23

## Pattern Overview

**Overall:** Modular monorepo with NX-style module boundaries, multi-service architecture

**Key Characteristics:**
- Four independent services (Backend, Frontend, RAG Worker, Converter) communicating via Redis and shared PostgreSQL
- Strict module isolation with barrel exports enforcing public API boundaries
- Session-based authentication (Azure AD OAuth + local root login) with CASL-based ABAC authorization
- Factory Pattern for data models, Singleton Pattern for global services

## System Overview

```
User Browser
    |
    +-- HTTP/WS --> Frontend (React SPA, Vite:5173)
    |                   |
    |                   +-- /api/* proxy --> Backend (Express:3001)
    |                   |                      |
    |                   |                      +-->  PostgreSQL (data)
    |                   |                      +-->  Valkey/Redis (cache, sessions, queues)
    |                   |                      +-->  RustFS/S3 (file storage)
    |                   |                      +-->  OpenSearch (search queries)
    |                   |                      +-->  LLM Provider (AI chat/search)
    |                   |
    |                   +-- Socket.IO --> Backend (real-time updates)
    |
    +-- SSE (via Socket.IO) <-- Backend <-- Redis pub/sub <-- Workers

Workers (poll Redis queues independently):
  +-- RAG Worker: document parsing --> chunking --> embedding --> OpenSearch indexing
  +-- Converter: Office --> PDF conversion via LibreOffice
```

## Service Boundaries

| Service | Runtime | Port | Responsibilities |
|---------|---------|------|------------------|
| Backend (`be/`) | Node.js 22 / Express 4.21 | 3001 | HTTP API, auth, sessions, CRUD, SSE streaming, WebSocket |
| Frontend (`fe/`) | React 19 / Vite 7.3 | 5173 | SPA UI, client-side routing, TanStack Query cache |
| RAG Worker (`advance-rag/`) | Python 3.11 | - | Document parsing, chunking, embedding, indexing, GraphRAG |
| Converter (`converter/`) | Python 3 | - | Office-to-PDF conversion, PDF post-processing |

## Inter-Service Communication

| From | To | Mechanism | Purpose |
|------|----|-----------|---------|
| Frontend | Backend | HTTP REST (`/api/*`), WebSocket (Socket.IO) | API calls, real-time events |
| Backend | RAG Worker | Redis Streams + pub/sub | Task dispatch, progress reporting |
| Backend | Converter | Redis queue (sorted sets) | Conversion job dispatch |
| RAG Worker | Backend | Shared PostgreSQL, Redis pub/sub | Read/write data, publish progress |
| Converter | Backend | Redis pub/sub, shared filesystem | Report file status |
| Backend | Frontend | Socket.IO, SSE | Real-time notifications, streaming responses |

## Design Patterns

| Pattern | Where Used | Implementation |
|---------|-----------|---------------|
| Factory + Singleton | BE models | `ModelFactory` in `be/src/shared/models/factory.ts` -- lazy-loaded singleton instances for all data models |
| Singleton | BE services | All 17 shared services in `be/src/shared/services/` are singletons (Redis, MinIO, Socket.IO, Cron, etc.) |
| Barrel Exports | BE modules + FE features | Every module has `index.ts` as its public API surface. 21 BE modules, 23 FE features |
| Repository | BE models | `BaseModel<T>` in `be/src/shared/models/base.model.ts` -- thin CRUD wrapper around Knex |
| Middleware Chain | BE routes | `requireAuth` -> `requireTenant` -> `validate(schema)` -> controller |
| ABAC | BE authorization | CASL abilities built from role + ABAC policy rules in `be/src/shared/services/ability.service.ts`, cached in Redis |
| API Layer Split | FE data fetching | `<domain>Api.ts` (raw HTTP) + `<domain>Queries.ts` (TanStack Query hooks) in each feature |
| Provider Composition | FE app shell | `fe/src/app/Providers.tsx` composes Auth -> Ability -> Settings -> Guideline -> Confirm -> HeaderActions -> Navigation |
| Feature Modules | FE features | Self-contained feature dirs with api/, components/, hooks/, pages/, types/ |
| Query Key Factory | FE caching | Centralized `queryKeys` in `fe/src/lib/queryKeys.ts` |
| Zustand Store | FE complex state | Agent canvas store in `fe/src/features/agents/store/canvasStore.ts` |
| Pipeline | RAG worker | `advance-rag/rag/flow/` -- extractor -> splitter -> parser -> tokenizer stages |
| Polling Worker | Converter | `converter/src/worker.py` polls Redis sorted set for FIFO job dequeue |

## Layers

### Backend Layers

**Routing Layer:**
- Purpose: HTTP endpoint registration, rate limiting, content-type validation
- Location: `be/src/app/routes.ts` (central registration) + `be/src/modules/*/routes/*.routes.ts`
- Contains: Route definitions, middleware chains, rate limiters
- Depends on: Controllers, Middleware
- Used by: Express app via `setupApiRoutes()`

**Middleware Layer:**
- Purpose: Cross-cutting concerns (auth, tenancy, validation)
- Location: `be/src/shared/middleware/`
- Key files:
  - `auth.middleware.ts` -- Session auth (`requireAuth`), role checks (`requireRole`), CASL ability checks (`requireAbility`), re-auth enforcement
  - `tenant.middleware.ts` -- Multi-org tenant extraction via `requireTenant`, extracts `currentOrgId` from session
  - `validate.middleware.ts` -- Zod schema validation for body/params/query via `validate(schema)`
  - `external-auth.middleware.ts` -- API key auth for external integrations via `X-API-Key` header
- Depends on: Config, Redis, CASL ability service
- Used by: Routes

**Controller Layer:**
- Purpose: HTTP request/response handling, delegates to services
- Location: `be/src/modules/*/controllers/*.controller.ts`
- Contains: Request parsing, response formatting, error status codes
- Depends on: Services
- Used by: Routes (bound via `.bind(controller)`)

**Service Layer:**
- Purpose: Business logic, orchestration, integration with external systems
- Location: `be/src/modules/*/services/*.service.ts` + `be/src/shared/services/`
- Contains: CRUD orchestration, access control filtering, audit logging, queue dispatch
- Depends on: Models (via ModelFactory), shared services (Redis, MinIO, LLM client)
- Used by: Controllers
- Key shared services in `be/src/shared/services/`:
  - `redis.service.ts` -- Connection management, pub/sub
  - `minio.service.ts` -- S3-compatible file storage (RustFS)
  - `socket.service.ts` -- WebSocket (Socket.IO) for real-time events
  - `llm-client.service.ts` -- LLM API abstraction
  - `queue.service.ts` -- Redis queue management for worker dispatch
  - `rag-query.service.ts` -- RAG retrieval query execution
  - `langfuse.service.ts` -- LLM observability tracing
  - `ability.service.ts` -- CASL ABAC authorization engine
  - `cron.service.ts` -- Scheduled job management
  - `crypto.service.ts` -- Encryption for tool credentials
  - `embed-token.service.ts` -- Token generation for embed widgets

**Model Layer:**
- Purpose: Database access, CRUD operations
- Location: `be/src/modules/*/models/*.model.ts` + `be/src/shared/models/`
- Contains: Table-specific queries extending `BaseModel<T>`
- Base class: `be/src/shared/models/base.model.ts` -- provides `create`, `findById`, `findAll`, `update`, `delete`
- Registry: `be/src/shared/models/factory.ts` -- `ModelFactory` with lazy-loaded singletons
- Depends on: Knex, PostgreSQL
- Used by: Services

### Frontend Layers

**App Shell:**
- Purpose: Routing, providers, global layout
- Location: `fe/src/app/`, `fe/src/layouts/`
- Key files:
  - `fe/src/app/App.tsx` -- All route definitions with lazy-loaded pages
  - `fe/src/app/Providers.tsx` -- Provider composition (Auth -> Ability -> Settings -> Guideline -> Confirm -> HeaderActions -> Navigation)
  - `fe/src/app/routeConfig.ts` -- Route metadata (titles, feature IDs, layout flags)
  - `fe/src/layouts/MainLayout.tsx` -- Sidebar + header layout shell

**Feature Modules (23 total):**
- Purpose: Self-contained domain features
- Location: `fe/src/features/<domain>/`
- Contains: api/, components/, hooks/, pages/, types/, index.ts barrel
- Each feature exports its public API through `index.ts`

**Shared UI:**
- Purpose: Reusable UI components, utilities
- Location: `fe/src/components/` (shared components + shadcn/ui), `fe/src/hooks/` (global UI hooks), `fe/src/lib/` (core utils), `fe/src/utils/` (pure functions)

## Data Flow

**HTTP Request Lifecycle:**

1. Client sends HTTP request to `/api/*`
2. Express applies rate limiter (`generalLimiter`: 1000/15min, `authLimiter`: 20/15min for auth endpoints)
3. Content-type validation on POST/PUT/PATCH (allows JSON, multipart, urlencoded)
4. Route-specific middleware chain: `requireAuth` -> `requireTenant` -> `validate(schema)` -> controller
5. Controller receives validated request, delegates to service
6. Service executes business logic, accesses DB via `ModelFactory`
7. Service optionally logs audit events via `auditService`, publishes to Redis
8. Controller formats response and returns JSON

**Document Processing Flow (RAG):**

1. Backend receives file upload, validates (magic bytes + extension), stores in S3 (RustFS)
2. Backend creates task record in PostgreSQL, publishes to Redis stream
3. RAG Worker (`advance-rag/rag/svr/task_executor.py`) polls Redis for tasks, dequeues next
4. Worker downloads file from S3, selects parser from `rag/app/` based on document type
5. Worker runs parser pipeline: extractor -> splitter -> tokenizer
6. Worker generates embeddings via configured LLM provider (`rag/llm/`)
7. Worker optionally extracts keywords, questions, metadata, tags (`rag/prompts/generator.py`)
8. Worker optionally runs Raptor summarization or GraphRAG construction (`rag/graphrag/`)
9. Worker indexes chunks into OpenSearch (vector + text search)
10. Worker publishes progress via Redis pub/sub at each stage
11. Backend relays progress to frontend via Socket.IO/SSE

**Document Conversion Flow:**

1. Backend creates converter job in Redis sorted set (`converter:vjob:pending`)
2. Converter Worker (`converter/src/worker.py`) polls Redis for pending jobs (FIFO by timestamp)
3. Worker checks schedule window (configurable time range) or manual trigger flag
4. Worker dispatches files to type-specific converters (`converter/src/converter.py`)
5. Worker converts Office files to PDF via LibreOffice CLI or Python-UNO bridge
6. Worker applies PDF post-processing (empty page removal, whitespace trim) via `pdf_processor.py`
7. Worker updates per-file status in Redis hash, publishes progress via pub/sub
8. Backend picks up completed PDFs for downstream RAG processing

**Real-Time Event Flow:**

1. Backend service emits event via `socketService.emit()` or `socketService.emitToUser()`
2. Socket.IO (`be/src/shared/services/socket.service.ts`) broadcasts to connected browser clients
3. Frontend `SocketQueryBridge` component (in `fe/src/app/Providers.tsx`) calls `useSocketQueryInvalidation()`
4. Socket events are mapped to TanStack Query key invalidations
5. Affected queries automatically refetch, UI updates reactively

**Frontend State Management:**

| State Type | Solution | Location Pattern |
|---|---|---|
| Server data | TanStack Query `useQuery` | `features/*/api/*Queries.ts` |
| Server mutations | TanStack Query `useMutation` | `features/*/api/*Queries.ts` |
| App-wide client | React Context | `fe/src/app/Providers.tsx` stack |
| Feature-local UI | `useState` | Component-level |
| URL-shareable | `useSearchParams` / `useUrlState` | Filterable list pages |
| Real-time | Socket.IO + Query invalidation | `fe/src/hooks/useSocket.ts` |
| Complex canvas | Zustand store | `fe/src/features/agents/store/canvasStore.ts` |

## Key Abstractions

**BaseModel<T>:**
- Purpose: Thin CRUD wrapper around Knex providing `create`, `findById`, `findAll`, `update`, `delete`
- Location: `be/src/shared/models/base.model.ts`
- Pattern: Abstract class -- subclasses supply `tableName` and `knex` instance
- Transaction support via optional `trx` parameter on all mutations

**ModelFactory:**
- Purpose: Lazy-loaded singleton registry for all 40+ model instances
- Location: `be/src/shared/models/factory.ts`
- Access: `ModelFactory.users`, `ModelFactory.dataset`, `ModelFactory.agents`, `ModelFactory.memory`, etc.

**CASL AbilityService:**
- Purpose: ABAC authorization with role-based defaults + conditional policy overlays
- Location: `be/src/shared/services/ability.service.ts`
- Roles: `super-admin` > `admin` > `leader` > `user`
- Subjects: `Dataset`, `Document`, `ChatAssistant`, `SearchApp`, `User`, `AuditLog`, `Policy`, `Org`, `Project`, `Agent`, `Memory`
- Actions: `manage`, `create`, `read`, `update`, `delete`
- Caching: Serialized abilities cached in Redis (Valkey) keyed by session ID

**Query Key Factory:**
- Purpose: Single source of truth for all TanStack Query cache keys
- Location: `fe/src/lib/queryKeys.ts`
- Pattern: Nested object with domain-scoped factory functions (e.g., `queryKeys.datasets.detail(id)`, `queryKeys.auth.me()`)

**HTTP Client:**
- Purpose: Typed fetch wrapper with auto-401 redirect
- Location: `fe/src/lib/api.ts`
- Methods: `api.get<T>()`, `api.post<T>()`, `api.put<T>()`, `api.delete()`
- Auth: Credentials (cookies) included automatically; 401 -> redirect to `/login?redirect=<path>`

## Entry Points

**Backend:**
- Location: `be/src/app/index.ts`
- Triggers: `npm run dev:be` (tsx watch) or `node dist/app/index.js` (production)
- Startup: Redis init -> middleware -> routes -> server start -> Socket.IO -> migrations -> root user -> cron

**Frontend:**
- Location: `fe/src/main.tsx` -> `fe/src/app/App.tsx`
- Triggers: `npm run dev:fe` (Vite dev server)
- Responsibilities: React mount, QueryClient, BrowserRouter, Providers, lazy-loaded routes

**RAG Worker:**
- Location: `advance-rag/executor_wrapper.py` -> `advance-rag/rag/svr/task_executor.py`
- Triggers: `npm run dev:worker` or `python -m executor_wrapper`
- Startup: Wait for DB -> init tables -> ensure system tenant -> install progress hook -> start task loop

**Converter Worker:**
- Location: `converter/src/worker.py`
- Triggers: `npm run dev:converter` or `python -m src.worker`
- Startup: Connect Redis -> poll loop (check schedule/trigger -> dequeue job -> convert files -> report status)

## Error Handling

**Backend Strategy:**
- Global error handler in `be/src/app/routes.ts` catches unhandled errors -> HTTP 500
- Zod validation middleware returns structured 400 with field-level details: `{ error: 'Validation Error', details: [{ target, field, message }] }`
- Auth middleware returns 401 (no session) or 403 (insufficient permissions/no org)
- `uncaughtException` -> log + `process.exit(1)` (crash fast to avoid undefined state)
- `unhandledRejection` -> log only (keep alive for graceful shutdown hooks)

**Frontend Strategy:**
- `FeatureErrorBoundary` wraps every route in `fe/src/app/App.tsx`
- `api.ts` fetch wrapper: 401 -> redirect to `/login?redirect=<currentPath>`
- TanStack Query `onError` callbacks in mutations for user-facing error toasts via `globalMessage`
- Static error pages at `/403`, `/404`, `/500`

**Python Workers:**
- Task-level try/catch with status updates (failed tasks marked in DB with error details)
- Redis heartbeat/progress reporting for monitoring
- Graceful shutdown via SIGTERM/SIGINT signal handlers

## Security Architecture

**Authentication:**
- Primary: Azure AD OAuth 2.0 flow (`GET /api/auth/login` -> `GET /api/auth/callback` -> session)
- Fallback: Local root user login (`POST /api/auth/login/root`)
- Session: Express session stored in Redis (Valkey) with httpOnly secure cookies, 7-day TTL
- Embed widgets: Token-based auth for public chat/search/agent embeds (`be/src/shared/services/embed-token.service.ts`)
- External API: API key auth via `X-API-Key` header (`be/src/shared/middleware/external-auth.middleware.ts`)
- OpenAI-compatible: Bearer token auth for `/v1/*` endpoints

**Authorization (CASL ABAC):**
- 4-role hierarchy: `super-admin` > `admin` > `leader` > `user`
- CASL abilities built per-session combining role defaults + ABAC policy rules from DB
- Abilities cached in Redis, invalidated on role change or policy update
- Frontend: `AbilityProvider` (`fe/src/lib/ability.tsx`) receives serialized rules from `GET /api/auth/abilities`
- Route-level: `AdminRoute`, `RoleRoute` components in `fe/src/features/auth/` check roles before rendering

**Multi-Tenancy:**
- `requireTenant` middleware (`be/src/shared/middleware/tenant.middleware.ts`) extracts `currentOrgId` from session
- Tenant ID attached to request as `req.tenantId`, used to scope database queries
- Users can switch active org via `POST /api/auth/switch-org`

**Rate Limiting:**
- General: 1000 requests/15min per IP (all `/api/*` routes)
- Auth endpoints: 20 requests/15min per IP (`/api/auth/login`, `/api/auth/callback`)

**File Security:**
- Magic byte validation + extension blocklist (60+ dangerous types) in `be/src/shared/services/file-validation.service.ts`
- 10MB body limit on JSON/form data
- 30-minute server timeout for long-running requests (file uploads, RAG processing)

## Cross-Cutting Concerns

**Logging:**
- Backend: Custom logger at `be/src/shared/services/logger.service.ts` with structured JSON output
- Python workers: Loguru with colored console + rotating file logs
- Frontend: Console logging in development only

**Validation:**
- All POST/PUT/DELETE routes use Zod via `validate()` middleware at `be/src/shared/middleware/validate.middleware.ts`
- Schema files: `be/src/modules/*/schemas/*.schemas.ts`
- Validates body, params, and/or query; replaces `req.body` with Zod-parsed/coerced values

**Audit Logging:**
- `auditService` (from `be/src/modules/audit/`) called from service layer on mutations
- Records action type, resource type, resource ID, user, timestamp
- Stored in PostgreSQL via `AuditLogModel`

**Observability:**
- Langfuse integration for LLM call tracing at `be/src/shared/services/langfuse.service.ts`
- Health endpoint at `GET /health` (DB + Redis status -- outside `/api` for load balancer probes)
- Docker healthchecks on all services

**Cron Jobs:**
- `cronService` at `be/src/shared/services/cron.service.ts`
- Temp file cleanup scheduling
- Parsing scheduler (configurable via system config)

**Internationalization:**
- 3 locales required: English (`en.json`), Vietnamese (`vi.json`), Japanese (`ja.json`)
- Files at `fe/src/i18n/locales/`
- All UI strings must be in all 3 locale files

---

*Architecture analysis: 2026-03-23*
