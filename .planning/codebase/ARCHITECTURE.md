# Architecture

**Analysis Date:** 2026-04-07

## Pattern Overview

**Overall:** NX-style modular monorepo with strict layered backend, feature-sliced frontend, and Redis-coordinated Python workers for async ingestion/RAG processing.

**Key Characteristics:**
- Monorepo with four runtime services: Express backend (`be/`), React SPA (`fe/`), Python RAG worker (`advance-rag/`), Python office converter (`converter/`).
- Strict 3-layer backend: Controller -> Service -> Model. Controllers never touch `ModelFactory` or `db`; services never touch `db` directly; only models execute SQL.
- Module boundaries enforced via barrel `index.ts` exports — no cross-module deep imports in either `be/src/modules/` or `fe/src/features/`.
- Inter-service communication via Redis (Valkey) queues + pub/sub for backend <-> Python workers; OpenSearch for vector + keyword indices; PostgreSQL as the single source of truth.
- Knex owns ALL database migrations, including tables that Peewee (Python) reads/writes.

## Services

**Backend API (`be/`):**
- Runtime: Node.js 22+ / Express 4.21 / TypeScript / Knex / Zod.
- Entry: `be/src/app/index.ts` boots the HTTP server; `be/src/app/routes.ts` mounts module routers.
- Owns auth/session, all REST endpoints, DB migrations, queue dispatch to Python workers.

**Frontend SPA (`fe/`):**
- Runtime: React 19 / Vite 7 / TanStack Query / Tailwind / shadcn/ui.
- Entry: `fe/src/main.tsx` -> `fe/src/app/App.tsx` -> `fe/src/app/Providers.tsx` -> route tree from `fe/src/app/routeConfig.ts`.
- Talks to backend over HTTP only; no direct access to Redis/OpenSearch/DB.

**RAG Worker (`advance-rag/`):**
- Runtime: Python 3.11 / FastAPI / Peewee ORM / OpenSearch client.
- Entry points: `advance-rag/executor_wrapper.py` (task executor), `advance-rag/embedding_worker.py` (embedding pubsub), `advance-rag/connector_sync_worker.py`, `advance-rag/web_crawl_worker.py`.
- Consumes Redis queues, parses + chunks documents (`advance-rag/deepdoc/`, `advance-rag/rag/nlp/`), generates embeddings, writes to OpenSearch indices prefixed `knowledge_<tenant>`.

**Converter Worker (`converter/`):**
- Runtime: Python 3 / LibreOffice / Redis queue.
- Entry: `converter/src/worker.py`. Consumes office files from Redis, converts to PDF via `converter/src/converter.py` and friends, returns result via Redis.

## Layers (Backend)

**Routes (`be/src/modules/<domain>/routes/`):**
- Purpose: Express router definitions, attach Zod `validate()` middleware and auth guards.
- Depends on: controllers + middleware.

**Controllers (`be/src/modules/<domain>/controllers/`):**
- Purpose: HTTP request/response only. Parse params, call service, shape response.
- Forbidden: importing `ModelFactory`, `db`, raw Knex.
- Depends on: services from same module (or shared services).

**Services (`be/src/modules/<domain>/services/` and `be/src/shared/services/`):**
- Purpose: Business logic, orchestration, cross-model coordination, Redis publishing.
- May call: `ModelFactory.*`, other services, `shared/services/*` (e.g. `embedding-stream.service.ts`).
- Forbidden: importing `db` or calling `model.getKnex()` to build inline queries.

**Models (`be/src/modules/<domain>/models/` and `be/src/shared/models/`):**
- Purpose: ALL SQL lives here. Singletons exposed via `ModelFactory` (`be/src/shared/models/`).
- Owns transaction boundaries via `this.knex.transaction()`.
- Patterns: batch with `whereIn`, paginate with `{ data, total }`, prefer indexed columns, explicit `.select()` on wide tables.

**Shared (`be/src/shared/`):**
- `config/` — typed config object (single env access point; never `process.env` outside).
- `constants/` — domain enums, Redis keys, factory names (mirrors `advance-rag/embed_constants.py`).
- `db/` — Knex instance, migrations, seeds.
- `middleware/` — auth, validation (`validate(schema)`), error handler.
- `services/` — cross-cutting services (embedding stream, queue dispatch, S3, etc.).
- `models/` — `ModelFactory` singleton + base model.

## Module Boundary Rules

- Every `be/src/modules/<domain>/` and `fe/src/features/<domain>/` exposes a single `index.ts` barrel as its public API.
- No module imports from another module's internal files. Cross-module needs go through:
  - Backend: a shared service in `be/src/shared/services/`, or an event/queue.
  - Frontend: shared `components/`, `hooks/`, `lib/`, `utils/`, or a query in another feature's `index.ts`.
- Backend module layout: sub-directory layout (`controllers/`, `services/`, `models/`, `routes/`, `schemas/`) when >=5 files; flat otherwise.

## Frontend Layering

**Feature module (`fe/src/features/<domain>/`):**
- `api/<domain>Api.ts` — raw HTTP calls (axios/fetch wrapper). Never named `*Service.ts`.
- `api/<domain>Queries.ts` — TanStack Query hooks (`useQuery`/`useMutation`) wrapping the Api file.
- `components/` — feature UI components.
- `hooks/` — UI-only hooks (data hooks live in `Queries.ts`).
- `pages/` — route-level components.
- `index.ts` — barrel export.

**App shell (`fe/src/app/`):**
- `Providers.tsx` wires QueryClient, Router, i18n, theme, auth context.
- `routeConfig.ts` declares the route tree consumed by `App.tsx`.

**Shared FE:** `components/` (shadcn/ui + project), `hooks/`, `lib/`, `utils/`, `i18n/` (en, vi, ja), `layouts/`, `constants/`.

## Request / Data Flow

**Standard HTTP request:**
1. Browser -> `fe/src/features/<domain>/api/<domain>Queries.ts` hook.
2. Hook calls `<domain>Api.ts` -> HTTPS to backend.
3. Express router (`be/src/modules/<domain>/routes/`) matches path, runs auth + Zod `validate()`.
4. Controller method (`controllers/`) parses request, calls service.
5. Service (`services/`) applies business rules, calls one or more models via `ModelFactory`.
6. Model (`models/`) executes Knex query against PostgreSQL.
7. Response bubbles back; TanStack Query caches it.

**Document ingestion flow:**
1. User uploads file via knowledge-base UI (`fe/src/features/knowledge-base`).
2. Backend `knowledge-base` controller -> service stores file in RustFS (S3) and creates `document` + `task` rows via models.
3. Service publishes a task on a Redis queue (key constants in `be/src/shared/constants/`, mirrored in `advance-rag/embed_constants.py`).
4. **If office format:** `converter/src/worker.py` picks up the convert queue, runs LibreOffice via `converter/src/converter.py`, writes PDF back to S3, acks via Redis.
5. `advance-rag/executor_wrapper.py` picks up the parse task, runs `deepdoc/` parsers, chunks via `rag/nlp/`, calls embedding model.
6. Embeddings + chunks written to OpenSearch index `knowledge_<tenant_id>` (see `advance-rag/rag/nlp/search.py` `index_name`).
7. Worker updates task status in PostgreSQL (Peewee) and publishes progress on Redis pub/sub.
8. Backend `embedding-stream.service.ts` relays progress to frontend via SSE; UI updates through TanStack Query invalidation.

**Search / chat flow:**
1. FE search/chat feature -> backend `search` or `chat` module.
2. Service builds query, calls `advance-rag` HTTP API (or hits OpenSearch directly through a shared client) for retrieval.
3. Retrieved chunks fed to LLM provider (config from `llm-provider` module); response streamed back to FE.

## Inter-Service Communication

**Redis / Valkey (`6379`):**
- Task queues: backend -> converter, backend -> advance-rag executor.
- Pub/sub: worker progress + embedding worker status (`embed:worker:status`).
- Sessions + cache for backend.
- All keys/channels defined as constants — never bare strings.

**HTTP:**
- Frontend <-> Backend (REST + SSE).
- Backend <-> advance-rag FastAPI (synchronous retrieval / health).

**PostgreSQL (`5432`):**
- Single source of truth. Backend (Knex) and advance-rag (Peewee) share schemas; Knex owns migrations.

**OpenSearch (`9201`):**
- Vector + BM25 indices. Written by advance-rag; read by backend search/chat services and advance-rag retrieval pipeline.

**RustFS / S3 (`9000/9001`):**
- Document originals, converted PDFs, generated artifacts. Accessed by backend, converter, and advance-rag.

## Key Abstractions

**`ModelFactory` (`be/src/shared/models/`):**
- Singleton registry of all model singletons. Only access path to DB from services.

**`config` object (`be/src/shared/config/`):**
- Typed, validated env wrapper. The ONLY place `process.env` is read.

**`validate(schema)` middleware (`be/src/shared/middleware/`):**
- Zod-based request validation; mandatory on all mutating routes.

**Embedding stream service (`be/src/shared/services/embedding-stream.service.ts`):**
- Bridges Redis pub/sub progress events to SSE for the frontend.

**Constants modules:**
- `be/src/shared/constants/embedding.ts` <-> `advance-rag/embed_constants.py` (cross-language; must stay in sync via comments).

## Entry Points

**Backend:** `be/src/app/index.ts` (server bootstrap), `be/src/app/routes.ts` (router mount).
**Frontend:** `fe/src/main.tsx` -> `fe/src/app/App.tsx`.
**RAG worker:** `advance-rag/executor_wrapper.py`, `advance-rag/embedding_worker.py`, `advance-rag/connector_sync_worker.py`, `advance-rag/web_crawl_worker.py`.
**Converter:** `converter/src/worker.py`.

## Error Handling

**Backend:** Throw typed errors from services/models; central error middleware in `be/src/shared/middleware/` maps to HTTP responses. Zod validation errors handled uniformly.
**Frontend:** TanStack Query `onError` + toast notifications; route-level error boundaries.
**Workers:** Loguru-logged exceptions; failed tasks marked in PostgreSQL `task` table and re-queued or surfaced via status pub/sub.

## Cross-Cutting Concerns

- **Auth:** Session-based, configured in `be/src/modules/auth`; guards applied in route definitions.
- **Logging:** Backend uses structured logger in `be/src/shared/utils/`; Python workers use Loguru.
- **Validation:** Zod schemas in `be/src/modules/<domain>/schemas/`.
- **i18n:** `fe/src/i18n/` with en/vi/ja locales — all UI strings must be translated.
- **Theming:** Class-based dark mode; both themes mandatory.
- **Migrations:** `be/src/shared/db/migrations/YYYYMMDDhhmmss_<name>.ts` — Knex only, even for Peewee tables.

---

*Architecture analysis: 2026-04-07*
