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
│   ├── admin/                ├── audit/
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
- Access via `ModelFactory.users`, `ModelFactory.chatSessions`, etc.
- Always use Knex ORM; raw SQL only when Knex cannot support the query
- Transaction support via optional `trx` parameter

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

## Gotchas

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
