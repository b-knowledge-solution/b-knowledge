# Coding Conventions

**Analysis Date:** 2026-04-07

This document is the authoritative reference for coding standards across the B-Knowledge monorepo. It consolidates rules from the root `CLAUDE.md` and the per-workspace files (`be/CLAUDE.md`, `fe/CLAUDE.md`, `advance-rag/CLAUDE.md`). When generating or modifying code, follow these rules exactly — they are mandatory, not stylistic preferences.

## Workspaces At A Glance

| Workspace | Language | Primary Frameworks | Path |
|-----------|----------|--------------------|------|
| Backend | Node 22+ / TypeScript 5.6 (strict) | Express 4.21, Knex, Zod | `be/` |
| Frontend | TypeScript 5.8 (strict) | React 19, Vite 7.3, TanStack Query 5, Tailwind, shadcn/ui | `fe/` |
| RAG worker | Python 3.11 | FastAPI, Peewee, OpenSearch | `advance-rag/` |
| Converter | Python 3 | LibreOffice, Redis queue | `converter/` |

## Global Style Rules (All TypeScript Code)

- TypeScript **strict mode** is enabled in both `be/` and `fe/`. Frontend additionally uses `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- **Single quotes**, **no semicolons**.
- Functional patterns where possible.
- After extensive changes, run `npm run build` to verify TypeScript compiles.
- Path alias `@/*` maps to `./src/*` in both `be/` and `fe/`.

## No Hardcoded String Literals (Mandatory, All Languages)

Bare string literals **must never** appear in comparisons, conditionals, switch cases, or return values for:
- Domain states / status values
- Factory names
- Redis / Valkey keys
- Sentinel values
- Any string that represents a fixed set of options

Always import from a shared constants file.

```typescript
// WRONG
if (provider.factory_name === 'SentenceTransformers') { ... }
await redis.get('embed:worker:status')

// CORRECT
import { SENTENCE_TRANSFORMERS_FACTORY, EMBED_WORKER_STATUS_KEY, EmbeddingWorkerStatus }
  from '@/shared/constants/embedding.js'
if (provider.factory_name === SENTENCE_TRANSFORMERS_FACTORY) { ... }
await redis.get(EMBED_WORKER_STATUS_KEY)
```

```python
# WRONG
if factory == "SentenceTransformers": ...

# CORRECT
from embed_constants import SENTENCE_TRANSFORMERS_FACTORY, WorkerStatus, HEALTH_KEY
if factory == SENTENCE_TRANSFORMERS_FACTORY: ...
```

### Where Constants Live

| Scope | TypeScript (BE) | TypeScript (FE) | Python |
|-------|-----------------|-----------------|--------|
| Domain statuses | `be/src/shared/constants/statuses.ts` | `fe/src/constants/statuses.ts` | Module-level constants or class |
| Model types | `be/src/shared/constants/model-types.ts` | `fe/src/constants/model-types.ts` | Enum in relevant module |
| Redis/Valkey keys | `be/src/shared/constants/embedding.ts` | N/A | `advance-rag/embed_constants.py` |
| Factory names | `be/src/shared/constants/embedding.ts` | N/A | `advance-rag/embed_constants.py` |
| Sentinel values | `be/src/shared/constants/embedding.ts` | N/A | `advance-rag/embed_constants.py` |

**Cross-language strings** (values shared between Python and TypeScript) MUST carry a comment in BOTH constant files pointing to the other:
- TS: `// Must match advance-rag/embed_constants.py`
- Python: `# Must match be/src/shared/constants/embedding.ts`

## Documentation Comments (Mandatory)

All generated code MUST include doc comments. This is a hard rule, not optional.

### TypeScript: JSDoc

Every exported function, class, method, interface, and type alias requires a JSDoc block.

| Tag | When Required |
|-----|--------------|
| `@description` | Always — one-line summary |
| `@param` | Every parameter with type and meaning |
| `@returns` | Every function returning a value |
| `@throws` | If function throws specific errors |
| `@example` | Complex utility functions or non-obvious usage |

```typescript
/**
 * @description Retrieves paginated audit logs filtered by date range and user
 * @param {AuditLogQuery} query - Filter criteria including dateFrom, dateTo, userId
 * @returns {Promise<PaginatedResult<AuditLog>>} Paginated audit log entries
 * @throws {ValidationError} If date range is invalid
 */
export async function getAuditLogs(query: AuditLogQuery): Promise<PaginatedResult<AuditLog>> { ... }
```

React components, hooks, and query hooks follow the same rule. See `fe/CLAUDE.md` for component examples.

### Python: Google-style Docstrings

Every function, class, and method requires a Google-style docstring.

| Section | When Required |
|---------|--------------|
| Summary line | Always — imperative mood, one line |
| `Args` | Every parameter with type and meaning |
| `Returns` | Every function returning a value |
| `Raises` | If function raises specific exceptions |

```python
def chunk_document(content: str, method: ChunkMethod, config: ChunkConfig) -> list[Chunk]:
    """Split document content into chunks using the specified method.

    Args:
        content: Raw document text content to be chunked.
        method: Chunking strategy enum.
        config: Chunking parameters (size, overlap, separators).

    Returns:
        List of Chunk objects with text and metadata.

    Raises:
        ChunkingError: If content is empty or method is unsupported.
    """
```

### Inline Comments (All Languages)

Inline comments are MANDATORY above:
- Control flow: `if`/`else` branches, `switch` cases, loops with non-obvious conditions
- Business logic: domain rules, calculations, thresholds, status transitions
- Integration points: API calls, DB queries, Redis ops, queue interactions
- Non-obvious code: workarounds, perf optimizations, regex, bitwise ops
- Early returns / guard clauses: explain what condition is being guarded

**Do NOT comment:**
- Obvious code (`i++`, `return result`)
- Restating code in English
- Commented-out code (delete it; git has history)

## NX-Style Module Boundary Rules

These apply to **both** `be/src/modules/` and `fe/src/features/`.

- **No cross-module imports** — modules MUST NOT import from each other directly. Use shared services or event-driven patterns.
- **Barrel exports** — every module has `index.ts` as its public API.
- **No deep imports** — never `modules/<domain>/internal-file.ts`. Always import from `modules/<domain>/index.ts` (BE) or the feature barrel (FE).
- **Shared code** — `be/src/shared/` for backend; `fe/src/{components,hooks,lib,utils}/` for frontend.

## Backend Conventions (`be/`)

### Layering (STRICT — No Exceptions)

The backend enforces a 3-layer architecture: **Controller → Service → Model**.

#### Controller Rules

Controllers handle HTTP request/response **only**. Controllers MUST NEVER:
- Import `ModelFactory` or any model class
- Call `ModelFactory.*` methods directly
- Import `db` from `@/shared/db/knex.js`
- Contain business logic beyond request parsing and response formatting

Controllers MUST only call services. If a service lacks the needed method, **add the method to the service** — never bypass into the model layer.

```typescript
// CORRECT
const user = await userService.getUserById(id)

// WRONG
const user = await ModelFactory.user.findById(id)
```

#### Service Rules

Services contain business logic and call `ModelFactory` for data. Services MUST NEVER:
- Import `db` from `@/shared/db/knex.js`
- Call `db('table')`, `db.raw()`, `db.transaction()` directly
- Use `.getKnex()` on models to build inline queries
- Use raw Knex builder methods (`.whereRaw()`, `.selectRaw()`) outside model files

#### Model Rules

**ALL database queries MUST live in model files.** Only models access the database. If a model lacks the needed query, **add a method to the model** — never inline raw `db()` in a caller.

Model best practices:
| Practice | Why |
|----------|-----|
| Single responsibility per method | Easy to test, reuse, maintain |
| `whereIn()` for batch lookups | Avoid N+1 |
| `{ data, total }` for paginated queries | Consistent list-endpoint contract |
| Models own transactions (`this.knex.transaction()`) | Atomic ops stay in data layer |
| `.select(columns)` on list queries | Avoid transferring unused JSONB/text |
| Indexed columns in WHERE/ORDER BY | Prevent full table scans |
| Dedicated analytics models for cross-table queries | `DashboardModel`, `AdminHistoryModel` pattern |

### Models (Factory + Singleton)

- All models extend `BaseModel<T>` with standard CRUD.
- Access via `ModelFactory.user`, `ModelFactory.chatSession`, etc.
- Use Knex ORM. Raw SQL only when Knex cannot express the query.
- Register new models in `ModelFactory` with the lazy getter pattern.
- Singleton Pattern is used for all global services.

### Module Layout

| Files in module | Layout |
|-----------------|--------|
| ≥5 files | Sub-directory layout: `routes/`, `controllers/`, `services/`, `models/`, `schemas/`, `index.ts` |
| ≤4 files | Flat layout: `<domain>.controller.ts`, `<domain>.routes.ts`, `<domain>.service.ts`, `index.ts` |

**Currently flat:** `auth`, `dashboard`, `preview`, `system-tools`, `user-history`.

### Validation

- All `POST` / `PUT` / `DELETE` / `PATCH` routes use Zod via `validate()` middleware.
- `validate(schema)` validates `req.body` only.
- `validate({ body, params, query })` validates multiple targets.
- Mutates `req.body` with parsed/coerced values.

### Configuration

- Always use the `config` object from `@/shared/config/`. **Never** read `process.env` directly.
- In production, missing `DB_PASSWORD`, `KB_ROOT_PASSWORD`, or `SESSION_SECRET` throws on startup.

### Migrations

- Naming: `YYYYMMDDhhmmss_<name>.ts` — generated by `npm run db:migrate:make <name>`.
- All schema changes go through Knex — **including changes to Peewee-managed tables** (`document`, `knowledgebase`, `task`, `file`, `tenant_llm`, etc.). Never use Peewee migrators. The backend owns migration lifecycle; Python workers only read/write data via their ORM.

### RESTful Route Conventions

| Operation | HTTP | URL Pattern | Body |
|-----------|------|-------------|------|
| List / Search | `GET` | `/api/<domain>/<resource>?filter=value` | — |
| Get by ID | `GET` | `/api/<domain>/<resource>/:id` | — |
| Create | `POST` | `/api/<domain>/<resource>` | JSON |
| Full update | `PUT` | `/api/<domain>/<resource>/:id` | JSON |
| Partial update | `PATCH` | `/api/<domain>/<resource>/:id` | JSON fields |
| Delete single | `DELETE` | `/api/<domain>/<resource>/:id` | — |
| Bulk delete | `DELETE` | `/api/<domain>/<resource>` | `{ ids: [...] }` |
| Sub-resource action | `POST` | `/api/<domain>/<resource>/:id/<action>` | JSON |

- Filtering uses query params (`?dialogId=xxx`), never path nesting like `/parent/:id/children` for flat resources.
- `PATCH` for partial updates, `PUT` for full replacement.
- **Frontend `*Api.ts` files MUST mirror BE routes exactly** — mismatches cause runtime 404s.

### Import Rules

- Cross-module: always through barrel `@/modules/<domain>/index.js`.
- Same-module: direct paths OK (`./services/`, `./models/`).
- Shared: `@/shared/<category>/`.

## Frontend Conventions (`fe/`)

### Feature Module Layout

```
features/<domain>/
├── api/
│   ├── <domain>Api.ts        # Raw HTTP calls (NO hooks)
│   └── <domain>Queries.ts    # useQuery / useMutation hooks
├── components/
├── hooks/                    # UI-only hooks (NOT data-fetching)
├── pages/
├── types/<domain>.types.ts
└── index.ts                  # Barrel
```

### API Layer Split (Critical)

| File | Contains | Never contains |
|------|----------|----------------|
| `<domain>Api.ts` | `api.get()`, `api.post()` typed wrappers | React hooks |
| `<domain>Queries.ts` | `useQuery` / `useMutation` wrapping the Api functions | Direct fetch calls |

**Never** name an API file `*Service.ts`. Always `*Api.ts`.

### Naming

| Type | Pattern | Example |
|------|---------|---------|
| API service | `<domain>Api.ts` | `chatApi.ts` |
| Query hooks | `<domain>Queries.ts` | `chatQueries.ts` |
| Types | `<domain>.types.ts` | `chat.types.ts` |
| Pages | `<DomainAction>Page.tsx` | `ChatPage.tsx` |
| UI hooks | `use<Purpose>.ts` | `useChatStream.ts` |

### Hard Rules

- **No manual memoization.** `babel-plugin-react-compiler` handles it. Do not use `React.memo`, `useMemo`, `useCallback`. Exception: context provider values.
- **No `useQuery` in `hooks/`** — data-fetching hooks live in `api/<domain>Queries.ts`.
- **No `context/` directories** — contexts live in `hooks/` (e.g., `hooks/useMyContext.tsx`).
- **Forms** use native `useState` with typed form state. No form libraries.
- **i18n** — every UI string in `en.json`, `vi.json`, `ja.json`. All three locales required for new pages.
- **Dark mode** — class-based (`dark:` prefix). Always support both themes.
- **Error boundaries** — wrap all feature routes with `<FeatureErrorBoundary>`.
- **Query keys** — defined centrally in `lib/queryKeys.ts`. Never define local query key constants. Invalidate via `queryClient.invalidateQueries({ queryKey: queryKeys.<feature>.all })`.

### State Management

| State Type | Solution |
|------------|----------|
| Server data | TanStack Query `useQuery` |
| Server mutations | TanStack Query `useMutation` |
| App-wide client | React Context |
| Feature-local UI | `useState` |
| URL-shareable | `useSearchParams` / `useUrlState` |
| Real-time | Socket.IO + Query invalidation |
| Streaming (SSE) | `useState` + `useRef` imperative hooks |

Full conventions: `fe/STATE_MANAGEMENT.md`.

### New Page Checklist

1. Add route metadata to `app/routeConfig.ts`.
2. Add nav entry in `layouts/Sidebar.tsx` with role checks.
3. Add i18n keys for `en`, `vi`, `ja`.
4. Wrap route with `<FeatureErrorBoundary>`.

### User-Facing Page Rule

User-facing chat/search pages must have **zero config UI**. All configuration belongs in Data Studio admin pages only.

## Python Conventions (`advance-rag/`, `converter/`)

- Shared `.venv` at project root for development.
- Each module has its own `pyproject.toml` for independent Docker builds.
- **Loguru** for logging (both modules).
- **Redis** for inter-service communication: queues, pub/sub, status.
- **Peewee ORM** in `advance-rag/` (separate from Node.js Knex models). Read/write only — schema changes are owned by Knex migrations in `be/`.
- Pre-cached models: Docker images bundle deepdoc, NLTK, Tika, tiktoken. Do not assume network access at runtime.
- Single-tenant mode: fixed `SYSTEM_TENANT_ID = 00000000-0000-0000-0000-000000000001`.

### Upstream RAGFlow Merges

When merging from upstream RAGFlow into `advance-rag/` or `converter/`, all OpenSearch/Elasticsearch index name prefixes MUST be renamed from `ragflow_` to `knowledge_` to match the Node.js backend's expected prefix. Example: `def index_name(uid): return f"knowledge_{uid}"` in `advance-rag/rag/nlp/search.py`. Failure causes "0 chunks found" errors on the frontend.

## Environment Files

Each workspace has `.env.example` → copy to `.env`. Never read `.env*` contents into agent context — they may contain secrets.

| File | Purpose |
|------|---------|
| `docker/.env` | Infrastructure + deployment config |
| `be/.env` | Backend server, DB, Redis, session, CORS |
| `fe/.env` | API URL, feature flags, Azure AD |
| `advance-rag/.env` | DB, Redis, OpenSearch, S3, model defaults |

**Production checklist:** change all default passwords, set `ENABLE_LOCAL_LOGIN=false`, generate strong `SESSION_SECRET`, configure SSL.

## Linting

| Workspace | Command | Tooling |
|-----------|---------|---------|
| Backend | `npm run lint -w be` | ESLint 9 + `@typescript-eslint` |
| Frontend | `npm run lint -w fe` | ESLint 9 + React Compiler rules |
| All | `npm run lint` | Runs all workspaces |

## Code Intelligence (Mandatory)

Always use `code-review-graph` MCP tools FIRST for codebase search/understanding before falling back to Grep/Glob/Read. The graph contains 15K+ nodes, 130K+ edges, and semantic embeddings. After significant code changes run `build_or_update_graph`, then `embed_graph` to refresh semantic search.

---

*Convention analysis: 2026-04-07*
