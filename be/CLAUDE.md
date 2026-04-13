# Backend (Express API)

Node.js 22+ / Express 4.21 / TypeScript 5.6 / Knex ORM / PostgreSQL

## Commands

```bash
npm run dev:be              # Dev with hot reload (tsx watch)
npm run build -w be         # TypeScript compile + tsc-alias
npm run start -w be         # Production (node dist/app/index.js)
npm run db:migrate          # Run pending migrations
npm run db:migrate:make <n> # Create migration: YYYYMMDDhhmmss_<n>.ts
npm run db:migrate:rollback # Rollback last batch
npm run db:seed             # Seed database
npm run test -w be          # Vitest
npm run lint -w be          # ESLint
```

## Architecture

```
be/src/
├── app/
│   ├── index.ts              # Express init, middleware stack, server startup
│   └── routes.ts             # Central route registration (all module routes)
├── modules/                  # Domain modules (self-contained units)
│   ├── system/               ├── audit/
│   ├── auth/          (flat) ├── broadcast/
│   ├── chat/                 ├── dashboard/       (flat)
│   ├── external/             ├── glossary/
│   ├── knowledge-base/       ├── llm-provider/
│   ├── preview/       (flat) ├── rag/
│   ├── system-tools/  (flat) ├── teams/
│   ├── user-history/  (flat) └── users/
└── shared/
    ├── config/               # Env config via `config` object (never use process.env directly)
    ├── db/                   # Knex config, adapter, migrations
    ├── middleware/            # Auth, validation, logging, error handling
    ├── models/               # BaseModel + ModelFactory (singleton)
    ├── services/             # Redis, MinIO, Socket.IO, Langfuse, queues, cron
    ├── types/                # Global TS definitions
    └── utils/                # General utilities
```

## Module Layout Rules

**≥5 files → sub-directory layout:**
```
modules/<domain>/
├── routes/<domain>.routes.ts
├── controllers/<domain>.controller.ts
├── services/<domain>.service.ts
├── models/<domain>.model.ts
├── schemas/<domain>.schemas.ts
└── index.ts                  # Barrel export (public API)
```

**≤4 files → flat layout:**
```
modules/<domain>/
├── <domain>.controller.ts
├── <domain>.routes.ts
├── <domain>.service.ts
└── index.ts
```

**Flat modules:** `auth`, `dashboard`, `preview`, `system-tools`, `user-history`

## Key Patterns

### Import Rules
- **Cross-module:** Always through barrel `@/modules/<domain>/index.js`
- **Same-module:** Direct paths OK (`./services/`, `./models/`)
- **Shared code:** `@/shared/<category>/`
- Path alias: `@/*` → `./src/*`

### Validation
- All `POST`/`PUT`/`DELETE` routes use Zod via `validate()` middleware
- `validate(schema)` validates `req.body` only
- `validate({ body, params, query })` validates multiple targets
- Mutates `req.body` with parsed/coerced values

### Models (Factory + Singleton)
- All models extend `BaseModel<T>` with standard CRUD
- Access via `ModelFactory.user`, `ModelFactory.chatSession`, etc.
- Always use Knex ORM; raw SQL only when Knex cannot support the query
- Transaction support via optional `trx` parameter
- Register all new models in `ModelFactory` with lazy getter pattern

### Layering Rules (STRICT — Controller → Service → Model)

The backend enforces a strict 3-layer architecture. Each layer has clear responsibilities and boundaries.

#### Controller Rules
Controllers handle HTTP request/response ONLY. Controllers must **NEVER**:
- Import `ModelFactory` or any model class
- Call `ModelFactory.*` methods directly
- Import `db` from `@/shared/db/knex.js`
- Contain business logic beyond request parsing and response formatting

Controllers must **ONLY** call services:
```typescript
// ✅ CORRECT — Controller calls service:
const user = await userService.getUserById(id)
const templates = await agentService.listTemplates(tenantId)
const app = await searchService.getSearchApp(appId)

// ❌ WRONG — Controller calls model directly:
const user = await ModelFactory.user.findById(id)
const templates = await ModelFactory.agentTemplate.findByTenant(tenantId)
const app = await ModelFactory.searchApp.findById(appId)
```

**When a service lacks the needed method:** Add a new method to the service — never import ModelFactory in the controller.

#### Service Rules (Database Access)
Services contain business logic and call `ModelFactory` for data access. Services must **NEVER**:
- Import `db` from `@/shared/db/knex.js`
- Call `db('table')`, `db.raw()`, or `db.transaction()` directly
- Use `.getKnex()` on models to build inline queries
- Use raw Knex builder methods (`.whereRaw()`, `.selectRaw()`) outside models

```typescript
// ✅ CORRECT — Service calls model:
const user = await ModelFactory.user.findByEmail(email)
const stats = await ModelFactory.dashboard.countRows('chat_sessions', 'created_at')

// ❌ WRONG — Direct DB in service:
import { db } from '@/shared/db/knex.js'
const user = await db('users').where({ email }).first()
```

#### Model Rules
**ALL database queries MUST live in model files.** Only models may access the database directly. If a model lacks the needed query, add a new method to the model — never bypass via raw `db()` in the caller.

**Model query best practices:**
| Practice | Why |
|----------|-----|
| Single responsibility per method | Easy to test, reuse, and maintain |
| `whereIn()` for batch lookups | Avoid N+1 round-trips |
| `{ data, total }` for paginated queries | Consistent API for list endpoints |
| Models own transactions (`this.knex.transaction()`) | Atomic operations stay in the data layer |
| `.select(columns)` on list queries | Avoid transferring unused JSONB/text columns |
| Use indexed columns in WHERE/ORDER BY | Prevent full table scans |
| Dedicated analytics models for cross-table queries | `DashboardModel`, `AdminHistoryModel` pattern |

### RESTful API Route Conventions

All backend routes **MUST** follow standard RESTful conventions. Frontend API clients **MUST** match the backend route patterns exactly.

| Operation | HTTP Method | URL Pattern | Body |
|-----------|------------|-------------|------|
| List / Search | `GET` | `/api/<domain>/<resource>?filter=value` | — |
| Get by ID | `GET` | `/api/<domain>/<resource>/:id` | — |
| Create | `POST` | `/api/<domain>/<resource>` | JSON payload |
| Full update | `PUT` | `/api/<domain>/<resource>/:id` | JSON payload |
| Partial update | `PATCH` | `/api/<domain>/<resource>/:id` | JSON fields to update |
| Delete single | `DELETE` | `/api/<domain>/<resource>/:id` | — |
| Bulk delete | `DELETE` | `/api/<domain>/<resource>` | `{ ids: [...] }` |
| Sub-resource action | `POST` | `/api/<domain>/<resource>/:id/<action>` | JSON payload |

**Key rules:**
- **Filtering / listing** uses query parameters (`?dialogId=xxx`), **never** path nesting like `/parent/:id/children` for flat resources.
- **PATCH** for partial updates (e.g. rename), **PUT** for full replacement.
- **Frontend `*Api.ts` files must mirror BE routes exactly** — mismatches cause 404 errors at runtime.
- Sub-resource actions (e.g. `/completion`, `/feedback`) use `POST` on a sub-path.

### Route Registration (`app/routes.ts`)
- Rate limiting: General 1000/15min, Auth 20/15min
- Content-Type validation on mutations
- Health check at `GET /health` (outside `/api`)
- All API routes under `/api/*`

## Startup Sequence

1. Redis init (async)
2. Security middleware (Helmet CSP, CORS, cookies, compression)
3. Session (Redis store in prod, memory in dev)
4. Route registration
5. HTTP/HTTPS server start (HTTPS with fallback)
6. Socket.IO init (if enabled)
7. Knex migrations auto-run
8. Root user bootstrap (creates admin if needed)
9. Cron job scheduling

## Documentation Comments (Mandatory)

All code MUST follow the root `CLAUDE.md` comment conventions. Summary:

- **JSDoc on every exported function, class, method, interface, type alias** — `@description`, `@param`, `@returns`, `@throws`
- **Inline comments** above control flow, business logic, DB queries, Redis operations, guard clauses
- **Controllers:** Document the HTTP semantics (what the endpoint does, auth requirements)
- **Services:** Document business logic intent, side effects, and integration points
- **Models:** Document table relationships, constraints, and non-obvious column semantics
- **Middleware:** Document when/why the middleware runs and what it mutates on `req`/`res`

```typescript
/**
 * @description Creates a new knowledge base and initializes its OpenSearch index
 * @param {CreateKnowledgeBaseDto} data - Knowledge base configuration including name, embedding model, and chunk settings
 * @param {string} userId - ID of the creating user for ownership tracking
 * @returns {Promise<KnowledgeBase>} The created knowledge base with generated ID
 * @throws {ConflictError} If a knowledge base with the same name already exists
 */
export async function createKnowledgeBase(data: CreateKnowledgeBaseDto, userId: string): Promise<KnowledgeBase> {
  // Check uniqueness before creating to provide a clear error message
  const existing = await KnowledgeBaseModel.findByName(data.name)
  if (existing) throw new ConflictError('Knowledge base name already exists')

  // Create DB record first, then initialize search index using the generated ID
  const kb = await KnowledgeBaseModel.create({ ...data, createdBy: userId })
  await openSearchService.createIndex(kb.id, data.embeddingModel)
  return kb
}
```

## Permission Matrix System (Mandatory)

The project uses a **three-source authorization model** managed via a permission registry, CASL ability builder, and admin UI. All BE permission code MUST follow these rules. See `fe/CLAUDE.md` for FE-specific permission gating rules.

### Architecture

| Layer | Location | Purpose |
|-------|----------|---------|
| Registry | `shared/permissions/registry.ts` | Code-side permission definitions via `definePermissions()` |
| Module catalogs | `modules/<domain>/<domain>.permissions.ts` | Per-module permission declarations |
| Constants | `shared/constants/permissions.ts` | Table names, subjects (`PermissionSubjects`), cache keys |
| DB tables | `permissions`, `role_permissions`, `user_permission_overrides`, `resource_grants` | Persistence layer |
| Boot sync | `shared/permissions/sync.ts` | Upserts registry -> DB at startup |
| Cache | `shared/services/role-permission-cache.service.ts` | In-process atomic-swap snapshot (`ReadonlyMap`) |

### Three Authorization Sources

Permissions are resolved from three sources, unioned together with deny-wins precedence:

1. **Role defaults** (`role_permissions` table) — global or tenant-scoped role->key grants
2. **Per-user overrides** (`user_permission_overrides` table) — allow/deny overrides with optional expiry
3. **Resource grants** (`resource_grants` table) — row-scoped grants for user/team/role principals

### Adding a New Permission

1. Create/update `modules/<domain>/<domain>.permissions.ts` using `definePermissions()`
2. Use `PermissionSubjects` constants from `shared/constants/permissions.ts` for subjects
3. Run `npm run permissions:export-catalog` to regenerate the FE snapshot
4. Add seed rows in a migration for default role grants
5. Gate BE routes with `requirePermission('<feature>.<action>')`
6. Gate FE with `<Can>` (instance checks) or `useHasPermission(PERMISSION_KEYS.X)` (flat checks) — see `fe/CLAUDE.md`

### Team Permission Save/Load Consistency (CRITICAL)

When saving team permissions via `POST /api/teams/:id/permissions`, the handler MUST:
1. Persist to the team record (`teamService.setTeamPermissions`) — so GET returns correct state
2. Propagate to team members (`teamService.grantPermissionsToTeam`) — so members get the grants

Failure to do both causes a **read/write mismatch** where saves go to user profiles but loads read from the team JSONB column.

### Cache Invalidation After Mutations

- Role mutation -> `rolePermissionCacheService.refresh()` + `abilityService.invalidateAllAbilities()`
- User override mutation -> `abilityService.invalidateAllAbilities()`
- Resource grant mutation -> `abilityService.invalidateAllAbilities()`
- Always emit `SocketEvents.PermissionsCatalogUpdated` after mutations for FE refresh

### Expiry Handling

- ALWAYS filter `expires_at` in SQL (`expires_at IS NULL OR expires_at > NOW()`) — NEVER in JavaScript
- This keeps checks index-friendly and consistent with the Postgres clock

### Audit Logging

- Every permission mutation MUST emit an audit log via `auditService.logPermissionMutation()`
- Use `PermissionAuditAction` constants — never bare strings for audit action codes
- Audit is fire-and-forget (`.catch()`) so logging outages never block admin operations

### `whoCanDo` Introspection

- Currently resolves only `grantee_type='user'` for resource grants
- Team/role grant resolution is deferred to Phase 5 — document this limitation in UI where relevant

## Gotchas

- **No hardcoded string literals:** Never use bare strings in comparisons for statuses, factory names, Redis keys, or sentinel values. Always use constants from `shared/constants/`. See root `CLAUDE.md` "No Hardcoded String Literals" section for full rules.
- **Config access:** Always use `config` object from `@/shared/config/`, never `process.env` directly
- **Production env validation:** `DB_PASSWORD`, `KB_ROOT_PASSWORD`, `SESSION_SECRET` are required in production — missing values throw
- **HTTPS fallback:** If SSL cert files missing, server falls back to HTTP silently
- **Graceful shutdown:** SIGTERM/SIGINT close server, Redis, DB pools, Langfuse, SocketIO
- **Migration naming:** Use `npm run db:migrate:make <name>` to auto-generate timestamp prefix
- **File uploads:** Magic byte validation + extension blocklist (60+ dangerous types blocked)
- **Session TTL:** 7 days default, configurable via `SESSION_TTL_DAYS`

## Environment

Copy `be/.env.example` → `be/.env`. Key variables:

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | 3001 | API server port |
| `NODE_ENV` | development | |
| `DB_HOST` | localhost | PostgreSQL |
| `DB_PORT` | 5432 | |
| `SESSION_STORE` | memory | Use `redis` in production |
| `REDIS_HOST` | localhost | |
| `HTTPS_ENABLED` | false | Set true + provide certs for HTTPS |
| `CORS_ORIGINS` | (empty) | Comma-separated, defaults to FRONTEND_URL |

## Built-in Pipeline / Parsing Method Guidelines (AI Agent Rule)

When creating or adding any **new** built-in pipeline or document parser method (such as `Picture`, `Audio`, `Email`, etc.), you **MUST** include a unique sample file/image to be used for instructions. Do not reuse an existing image sample from another pipeline.
