# Backend Architecture

## Overview

The B-Knowledge backend is a Node.js 22+ / Express 4.21 / TypeScript application using Knex with PostgreSQL. It currently mounts 23 feature modules under `/api`, with strict module boundaries, singleton services, and shared infrastructure such as `ModelFactory`, auth middleware, rate limiting, and a registry-backed permission system. The backend exposes 270+ API endpoints across all modules, organized in a 3-layer architecture: controller -> service -> model.

## Request Flow

```mermaid
graph LR
    Client --> Nginx
    Nginx --> Express[Express App]
    Express --> Helmet
    Helmet --> CORS
    CORS --> CP[Cookie Parser]
    CP --> Session[Session Middleware]
    Session --> RL[Rate Limiter]
    RL --> Auth[Auth Middleware]
    Auth --> Validate[Zod Validate]
    Validate --> Router[Module Router]
    Router --> Controller
    Controller --> Service
    Service --> Model[Model / Knex]
    Model --> PostgreSQL
```

## Middleware Stack Order

| Order | Middleware | Purpose |
|-------|-----------|---------|
| 1 | Helmet | Security headers |
| 2 | CORS | Cross-origin configuration |
| 3 | Cookie Parser | Parse signed cookies |
| 4 | Session | Valkey-backed session management |
| 5 | Rate Limiter | 1000/15min general, 20/15min auth |
| 6 | Auth (`requireAuth`) | Verify session, attach `req.user` |
| 6a | `requirePermission(key)` | Flat catalog-key permission check via CASL |
| 6b | `requireAbility(action, subject, idParam?)` | Row-scoped CASL ability check on a specific resource |
| 6c | `requireRecentAuth(maxAgeMinutes?)` | Enforce re-authentication for sensitive operations |
| 6d | `requireTenant` | Enforce active tenant context on `req.user` |
| 6e | `markPublicRoute()` | Exempt route from auth (embed widgets, webhooks) |
| 7 | Validate (`validate(schema)`) | Zod schema coercion of `req.body` |
| 8 | Route Handler | Controller method execution |

## Module Structure

```mermaid
graph TD
    subgraph "Flat Module (4 files or fewer)"
        FM_R[routes.ts]
        FM_C[controller.ts]
        FM_S[service.ts]
        FM_I[index.ts]
    end

    subgraph "Structured Module (5+ files)"
        SM_I[index.ts]
        SM_Routes[routes/]
        SM_Ctrl[controllers/]
        SM_Svc[services/]
        SM_Models[models/]
        SM_Schemas[schemas/]
    end
```

### Flat Module Example (`be/src/modules/audit/`)

```
audit/
  index.ts          # Barrel export (public API)
  routes.ts         # Express router
  controller.ts     # Request handlers
  service.ts        # Business logic
```

### Structured Module Example (`be/src/modules/rag/`)

```
rag/
  index.ts          # Barrel export (public API)
  routes/           # Route definitions per sub-resource
  controllers/      # Request handlers
  services/         # Business logic
  models/           # Knex model definitions
  schemas/          # Zod validation schemas
```

## ModelFactory Pattern

```mermaid
classDiagram
    class ModelFactory {
        -Map~string, Model~ instances
        -Knex knex
        +getModel(name: string) Model
        +initialize(knex: Knex) void
    }

    class Model {
        #string tableName
        #Knex knex
        +findById(id) Promise
        +findMany(query) Promise
        +create(data) Promise
        +update(id, data) Promise
        +delete(id) Promise
    }

    class KnexQueryBuilder {
        +select()
        +where()
        +join()
        +orderBy()
        +paginate()
    }

    ModelFactory --> Model : creates lazily
    Model --> KnexQueryBuilder : builds queries via
```

The `ModelFactory` is a singleton that lazily initializes and caches Knex model instances. It manages 60+ models and ensures each model is instantiated only once.

```
// Access pattern
const userModel = ModelFactory.getModel('user')
const users = await userModel.findMany({ tenantId })
```

## Service Singleton Pattern

All services are instantiated once and exported as singletons from their module barrel files. Services encapsulate business logic and coordinate between models, external APIs, and other services via shared interfaces.

```mermaid
graph TD
    Controller --> ServiceA[Auth Service]
    Controller --> ServiceB[RAG Service]
    ServiceA --> ModelFactory
    ServiceB --> ModelFactory
    ServiceA --> Redis[Valkey Cache]
    ServiceB --> S3[RustFS / S3]
    ModelFactory --> PG[(PostgreSQL)]
```

## Error Handling

The backend uses a mixed but still understandable error model. Controllers frequently return flat `{ error: '...' }` payloads directly, while shared middleware adds its own specialized shapes such as validation `details` arrays and permission-denied payloads.

```mermaid
graph LR
    Handler -->|returns or throws| ControllerError[Controller / Middleware Error]
    ControllerError --> GEM[Global Error Middleware]
    GEM --> Response[JSON Error Response]
```

Representative internal response shapes:

```json
{
  "error": "Validation Error",
  "details": [{ "target": "body", "field": "email", "message": "Required" }]
}
```

```json
{
  "error": "permission_denied",
  "key": "permissions.manage"
}
```

```json
{
  "error": "Unauthorized"
}
```

## Key Conventions

| Convention | Rule |
|-----------|------|
| Module boundaries | No cross-module imports; use shared services |
| Public API | Every module exposes only `index.ts` barrel |
| Deep imports | Forbidden: never import internal files directly |
| Config access | Only via `config` object, never `process.env` |
| Validation | All mutations use `validate(zodSchema)` middleware |
| ORM | Knex for all queries; raw SQL only when Knex cannot |
| Migrations | `YYYYMMDDhhmmss_<name>.ts` via Knex, even for Peewee tables |
| Shared code | `shared/models/`, `shared/services/`, `shared/utils/` |

## Module List (23 Modules)

| Module | Domain | Mount Path |
|--------|--------|------------|
| `agents` | Agent workflows, runs, templates, embeds, webhooks | `/api/agents/*` |
| `audit` | Audit logging | `/api/audit/*` |
| `auth` | Authentication, sessions, ability bootstrap | `/api/auth/*` |
| `broadcast` | Broadcast messages | `/api/broadcast-messages/*` |
| `chat` | Assistants, conversations, files, embeds, OpenAI API | `/api/chat/*` |
| `code-graph` | Code graph endpoints | `/api/code-graph/*` |
| `dashboard` | Dashboard analytics | `/api/system/dashboard/*` |
| `external` | API keys and external APIs | `/api/external/api-keys/*`, `/api/v1/external/*` |
| `feedback` | Generic feedback endpoints | `/api/feedback/*` |
| `glossary` | Glossary features | `/api/glossary/*` |
| `knowledge-base` | Knowledge base CRUD, memberships, entity permissions | `/api/knowledge-base/*` |
| `llm-provider` | Model/provider management | `/api/llm-provider/*`, `/api/models/*` |
| `memory` | Memory pools and memory message search | `/api/memory/*` |
| `permissions` | Catalog, role matrix, overrides, grants, effective access | `/api/permissions/*` |
| `preview` | Document/file preview serving | `/api/preview/*` |
| `rag` | Datasets, documents, chunks, enrichment, graph tasks | `/api/rag/*` |
| `search` | Search apps, search embed/share, OpenAI search API | `/api/search/*` |
| `sync` | Sync connectors and jobs | `/api/sync/*` |
| `system` | Core system info and history endpoints | `/api/system/*` |
| `system-tools` | Diagnostics and system actions | `/api/system-tools/*` |
| `teams` | Team management | `/api/teams/*` |
| `user-history` | Chat and search history | `/api/user/history/*` |
| `users` | User management | `/api/users/*` |

## Real-Time Communication

| Transport | Usage |
|-----------|-------|
| Socket.IO (WebSocket) | Real-time notifications, permission catalog updates, agent debug events |
| SSE (`text/event-stream`) | Streaming LLM responses for chat, search, and agent completions |

## Redis (Valkey) Usage

| Feature | Pattern |
|---------|---------|
| Sessions | Valkey-backed session store (7-day TTL default) |
| Caching | Role-permission cache, ability cache, model metadata |
| Task queues | Document conversion jobs, RAG pipeline tasks |
| Pub/Sub | Backend-to-worker coordination for task dispatch |
| Redis Streams | Agent execution pipeline (`agent-executor.service`, `agent-redis.service`), embedding worker status (`embedding-stream.service`) |

## Permission System

The permission system is registry-backed with three data sources:

| Source | Table | Purpose |
|--------|-------|---------|
| Catalog | `permissions` | Registry of all permission keys, synced from `*.permissions.ts` at boot |
| Role defaults | `role_permissions` | Baseline role-by-role grant matrix |
| User overrides | `user_permission_overrides` | Per-user allow/deny exceptions with optional expiry |
| Resource grants | `resource_grants` | Row-scoped access for KnowledgeBase and DocumentCategory |

The CASL ability builder composes all three sources into a single ability set per user session.

## Authorization-Specific Request Flow

```mermaid
graph LR
    Client --> Router[Module Router]
    Router --> Auth[requireAuth]
    Auth --> Choice{Flat key or row scope?}
    Choice -->|Flat key| RP[requirePermission]
    Choice -->|Row scope| RA[requireAbility]
    RP --> Ability[ability.service]
    RA --> Ability
    Ability --> Catalog[permissions + role_permissions + overrides + grants]
    Catalog --> Handler[Controller / Service]
```

The main maintainer takeaway is that authorization is data-driven. New backend work should extend the registry/catalog pipeline instead of adding new role-string checks.
