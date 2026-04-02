# Architecture Research

**Domain:** Multi-tenant RAG knowledge base platform (SDLC + Healthcare)
**Researched:** 2026-03-18
**Confidence:** HIGH — based on direct codebase analysis, schema inspection, and service layer review

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (React SPA)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  Data Studio │  │  Chat Pages  │  │ Search Pages  │           │
│  │  (Admin UI)  │  │  (User-only) │  │  (User-only)  │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘           │
│         │  TanStack Query + Socket.IO         │                   │
└─────────┼──────────────────────────────────────┘                 │
          │ HTTPS / SSE / WebSocket                                 │
┌─────────▼───────────────────────────────────────────────────────┐
│                  Express API Backend (Node.js 22)                 │
│                                                                   │
│  ┌─────────┐ ┌────────┐ ┌────────┐ ┌─────────┐ ┌────────────┐  │
│  │  auth   │ │  rag   │ │  chat  │ │ search  │ │  projects  │  │
│  └─────────┘ └────────┘ └────────┘ └─────────┘ └────────────┘  │
│  ┌─────────┐ ┌────────┐ ┌────────┐ ┌─────────┐ ┌────────────┐  │
│  │  users  │ │ teams  │ │  audit │ │  admin  │ │llm-provider│  │
│  └─────────┘ └────────┘ └────────┘ └─────────┘ └────────────┘  │
│                                                                   │
│  Shared: ModelFactory (Knex ORM) · Redis · MinIO · Socket.IO    │
├───────────────────────────────────────────────────────────────── │
│                    Shared Infrastructure                          │
│  ┌──────────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐  │
│  │  PostgreSQL  │  │  Valkey  │  │ OpenSearch │  │  RustFS   │  │
│  │  (Metadata)  │  │  (Redis) │  │  (Vector)  │  │   (S3)    │  │
│  └──────────────┘  └──────────┘  └───────────┘  └───────────┘  │
└─────────────────────────────────────────────────────────────────┘
          │ Redis task queue (JSON job payloads)
┌─────────▼───────────────────────────────────────────────────────┐
│                Python RAG Worker (advance-rag)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Task Executor│  │   Parsers    │  │  Chunking + Embedding  │  │
│  │ (polling)    │  │  (15 types)  │  │  + OpenSearch index    │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐                              │
│  │   GraphRAG   │  │ Deep Research│                              │
│  │ (graph build)│  │  (multi-hop) │                              │
│  └──────────────┘  └──────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
          │ Office file conversion queue (Redis)
┌─────────▼──────────────────────┐
│  Converter Worker (Python)      │
│  LibreOffice → PDF pipeline     │
└────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Tech |
|-----------|----------------|------|
| React SPA (fe/) | UI rendering, state management, SSE streaming, real-time updates via Socket.IO | React 19, TanStack Query, shadcn/ui |
| Express Backend (be/) | HTTP API, auth/session, access control enforcement, RAG query pipeline, task dispatch, audit | Node.js 22, Express 4.21, Knex, Zod |
| Python RAG Worker (advance-rag/) | Document ingestion pipeline: parse → chunk → embed → index. Also GraphRAG construction and Deep Research execution | Python 3.11, FastAPI, Peewee ORM |
| Converter Worker (converter/) | Office-to-PDF conversion (DOCX, PPTX, XLS) for downstream parsing | Python 3, LibreOffice |
| PostgreSQL | All structured metadata: users, teams, datasets, documents, projects, chat sessions, audit logs, access control | Shared by Node.js (Knex) + Python (Peewee ORM) |
| Valkey/Redis | Task queue (job dispatch), pub/sub (progress events), session store, caching | Shared by all services |
| OpenSearch | Vector embeddings + BM25 full-text index. One index per tenant (`knowledge_{tenant_id}`) | Used by both backend (query) and worker (index) |
| RustFS/S3 | Binary file storage (uploaded documents, thumbnails, chat attachments) | Used by backend (upload) and worker (download for parsing) |

---

## Recommended Project Structure

The monorepo structure is already established and well-organized. These are the key structural conventions for new capability areas:

### Backend New Module Anatomy (be/src/modules/)

```
modules/<new-capability>/
├── controllers/
│   └── <capability>.controller.ts   # HTTP request handlers, auth checks
├── services/
│   └── <capability>.service.ts      # Business logic, DB operations
├── models/
│   └── <capability>.model.ts        # Knex model extending BaseModel<T>
├── schemas/
│   └── <capability>.schemas.ts      # Zod schemas for request validation
├── routes/
│   └── <capability>.routes.ts       # Route definitions + middleware chain
└── index.ts                         # Barrel export (only public API)
```

### ABAC Extension Points

ABAC sits across multiple existing modules rather than one new module:

```
be/src/
├── shared/
│   ├── middleware/
│   │   └── abac.middleware.ts        # Policy evaluation middleware (new)
│   ├── services/
│   │   └── policy.service.ts         # Rule evaluation engine (new)
│   └── types/
│       └── abac.types.ts             # PolicyRule, SubjectContext (new)
├── modules/
│   ├── rag/
│   │   └── services/
│   │       └── rag.service.ts        # getAvailableDatasets() gains ABAC filter
│   └── admin/
│       └── policies/                 # New sub-module for policy CRUD (new)
```

### Document Versioning Extension Points

```
be/src/modules/rag/
├── models/
│   ├── document.model.ts             # Add version_id FK, content_hash column
│   └── document-version.model.ts     # New: version chain per document (new)
├── services/
│   ├── rag-document.service.ts       # Extend with version promotion/snapshot
│   └── rag-version.service.ts        # New: version diff, restore, list (new)
└── controllers/
    └── rag-version.controller.ts     # New: version history endpoints (new)
```

### GraphRAG + Deep Research Extension Points

Both services already exist as stubs in `be/src/modules/rag/services/`:
- `rag-graphrag.service.ts` — queries entity/relation docs from OpenSearch
- `rag-deep-research.service.ts` — multi-hop retrieval loop

The Python worker already has `advance-rag/rag/graphrag/` for graph construction. Integration work is wiring the backend services to the existing Python pipeline via the task queue.

---

## Architectural Patterns

### Pattern 1: Redis Task Queue for Async Ingestion

**What:** Backend enqueues a JSON task payload to a Redis list. The Python worker polls and processes it asynchronously. Progress flows back via Redis pub/sub → Socket.IO → client.

**When to use:** Any CPU-heavy operation: document parsing, embedding, GraphRAG construction, Deep Research planning.

**Trade-offs:** Decouples services well, natural back-pressure via queue depth, but adds operational complexity and makes error propagation indirect.

```
Backend enqueue:
  redis.lpush('rag:tasks', JSON.stringify({ doc_id, task_type, ... }))

Worker poll (task_executor.py):
  while True:
    task = redis.brpop('rag:tasks', timeout=30)
    process(task)
    redis.publish(f'progress:{doc_id}', json.dumps({ progress: 0.5 }))

Backend SSE relay:
  redis.subscribe(f'progress:{doc_id}') → res.write(SSE chunk)
```

### Pattern 2: ABAC as Middleware-plus-Service-Filter

**What:** Access control enforcement happens at two levels — middleware gates the route (authentication + coarse role check), and service-layer filtering applies attribute-based rules to query results.

**When to use:** All dataset/document/chat/search endpoints. Particularly critical for healthcare and SDLC tenants with different attribute profiles.

**Trade-offs:** Service-layer filtering is more flexible but can be expensive at scale (filter N rows after fetching). For large datasets, push filters into the DB query where possible.

```typescript
// Middleware: ensure session + role
router.get('/datasets', requireAuth, requireRole(['user', 'admin']), controller.list)

// Service: ABAC filter on results
async getAvailableDatasets(user: UserContext): Promise<Dataset[]> {
  const all = await DatasetModel.findAll({ status: 'active' })
  return policyService.filterByAttributes(all, user)
}
```

### Pattern 3: Dual ORM, Single Database

**What:** Node.js backend uses Knex ORM for all structured data. Python worker uses Peewee ORM for the same PostgreSQL database. Both ORMs read/write the same tables. Migration lifecycle is owned exclusively by Knex — Peewee never runs migrations.

**When to use:** Any table touched by both services (document, knowledgebase, task, file, model_providers).

**Trade-offs:** Full schema visibility from both sides. Risk: column name drift if Python models diverge from Knex migrations. Mitigation: all schema changes go through Knex migrations; Python Peewee models treat schema as read-only truth.

```
Schema authority: Knex migrations (be/src/shared/db/migrations/)
Peewee models:    advance-rag/db/db_models.py (must mirror Knex schema)
```

### Pattern 4: Project Hierarchy as Tenant Scope

**What:** The project module (already schema-complete) provides org-level and project-level scoping. Projects contain: document categories (with versions), project chats, project searches, and granular entity permissions.

**When to use:** Any multi-team, multi-document-version workflow (SDLC specs, healthcare protocols).

**Data model:**
```
org (implicit: all users in same platform instance)
└── project
    ├── project_permissions (tab-level: documents / chat / settings)
    ├── document_categories
    │   └── document_category_versions (1 version = 1 RAGFlow dataset)
    │       └── document_category_version_files
    ├── project_chats
    ├── project_searches
    └── project_entity_permissions (granular: category / chat / search)
```

---

## Data Flow

### Ingestion Flow (Document Upload → Searchable)

```
User uploads file (React)
    ↓ multipart POST /api/rag/documents
Backend (Express)
    → validates file (magic bytes, extension blocklist)
    → stores binary in RustFS/S3
    → creates document record in PostgreSQL (status: pending)
    → enqueues task in Redis: { doc_id, task_type: 'parse', ... }
    → returns 202 Accepted
    ↓ Socket.IO progress events
Python Worker (advance-rag)
    → polls Redis task queue
    → downloads file from S3
    → parser: PDF/DOCX/email/etc → raw text + layout
    → splitter: text → chunks
    → embedder: chunks → dense vectors (via LLM provider)
    → indexer: upserts chunks to OpenSearch index knowledge_{tenant_id}
    → updates document.progress, document.status in PostgreSQL
    → publishes progress events to Redis pub/sub
    ↓
Backend SSE relay → Socket.IO → React UI invalidates TanStack Query
```

### Query Flow (Chat/Search → Answer)

```
User sends message (React)
    ↓ POST /api/chat/sessions/:id/messages (SSE streaming)
Backend (Express) — 10-stage RAG pipeline:
  1. Session auth + ABAC dataset access check
  2. Query refinement via LLM (multi-turn context)
  3. Keyword extraction
  4. Cross-language expansion
  5. [Optional] Web search via Tavily
  6. Hybrid retrieval from OpenSearch (BM25 + vector)
     → rag-search.service.ts → OpenSearch REST API
  7. [Optional] Reranking (Jina/Cohere)
  8. [Optional] GraphRAG entity/relation enrichment
     → rag-graphrag.service.ts → OpenSearch (knowledge_graph_kwd filter)
  9. [Optional] Deep Research multi-hop
     → rag-deep-research.service.ts → recursive retrieval loop
  10. LLM generation with context + citation injection
    ↓ SSE stream tokens back to React
React renders streaming tokens + citation tooltips
```

### ABAC Policy Evaluation Flow

```
Request arrives with session user
    ↓
abac.middleware.ts
    → loads user { id, role, department, job_title, teams[] }
    → attaches SubjectContext to req
    ↓
Service layer: getAvailableDatasets(req.user)
    → PolicyService.evaluate(subject, resource, action)
    → checks policy rules: role, team, department, attribute tags
    → returns permitted resource set
    ↓
Results returned (no leakage of unauthorized resources)
```

### Real-Time Progress Flow

```
Python Worker
    → redis.publish('progress:{doc_id}', { progress: 0.72, msg: 'Embedding...' })
    ↓
Backend Redis subscriber
    → Socket.IO broadcast to room: `doc:${doc_id}`
    ↓
React useSocketEvent('doc:progress', ...)
    → queryClient.invalidateQueries(queryKeys.rag.document(docId))
    → UI shows progress bar update
```

### Document Version Flow (Planned)

```
User uploads new version of existing document
    ↓
Backend
    → creates document_version record (version_number, content_hash, s3_key)
    → sets previous version status to 'archived'
    → enqueues parse task for new version
    ↓
OpenSearch
    → indexes new version chunks with version_id metadata field
    → archived version chunks remain indexed with is_current: false
    ↓
Search/Chat
    → by default queries only is_current: true chunks
    → admin can query across versions via version filter param
```

---

## Component Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| React SPA ↔ Express Backend | REST HTTP + SSE (chat streaming) + Socket.IO (events) | All via `/api/*` proxy; 401 auto-redirects to login |
| Express Backend ↔ Python Worker | Redis task queue (dispatch) + Redis pub/sub (progress) | Backend never calls Python HTTP directly for ingestion |
| Express Backend ↔ OpenSearch | Direct REST client for query-time retrieval | `rag-search.service.ts`, `rag-graphrag.service.ts` |
| Python Worker ↔ OpenSearch | Direct client for index-time writes | `common/doc_store/` |
| Express Backend ↔ PostgreSQL | Knex ORM only | No raw SQL except when Knex cannot express the query |
| Python Worker ↔ PostgreSQL | Peewee ORM only | Schema is read-only truth from Knex migrations |
| Express Backend ↔ S3 | MinIO SDK (upload, presigned URL generation) | `rag-storage.service.ts` |
| Python Worker ↔ S3 | boto3 / MinIO SDK (download for parsing) | Worker downloads, parses, discards binary |
| Converter Worker ↔ Backend | Redis queue only | No HTTP; backend sends conversion jobs, converter publishes results |

---

## Build Order Implications for New Capabilities

The existing architecture has strong foundations. New capabilities should be built in this order to respect dependencies:

### Phase A: ABAC Foundation (prerequisite for everything else)
Build before adding domain-specific features because every dataset, document, chat, and search endpoint needs to respect access rules.

1. `policy_rules` table (Knex migration) — stores rules: `{ subject_attr, operator, value, resource_tag, action }`
2. `PolicyService` in `be/src/shared/services/` — evaluates rules against `SubjectContext`
3. `abac.middleware.ts` — attaches subject context from session to `req`
4. Extend `RagService.getAvailableDatasets()` to call `PolicyService.filter()`
5. Admin UI: policy rule CRUD (Data Studio only, no user-facing config)

Unblocks: healthcare attribute rules (department = 'clinical' → clinical docs), SDLC role rules (team = 'backend' → backend specs).

### Phase B: Document Versioning (depends on existing document model)
Can build independently of ABAC if needed, but benefits from ABAC being in place first (version access should inherit dataset-level ABAC rules).

1. `document_versions` table — `{ id, document_id, version_number, content_hash, s3_key, status, created_at }`
2. `document` table: add `current_version_id` FK
3. OpenSearch: add `version_id` and `is_current` fields to chunk documents
4. `RagVersionService` — snapshot, promote, restore, list
5. Search/retrieval: default filter `is_current: true`; admin override for cross-version queries

### Phase C: GraphRAG + Deep Research Completion (depends on existing stubs)
Both backend services exist as stubs. Work is connecting them to the Python pipeline and exposing controls in the UI.

1. Verify Python `advance-rag/rag/graphrag/` builds graph on task type `graphrag`
2. Connect `rag-graphrag.service.ts` to backend chat pipeline toggle (per-assistant config)
3. Verify `rag-deep-research.service.ts` multi-hop loop
4. Admin UI: per-assistant GraphRAG and Deep Research toggles
5. Dataset UI: "Build Knowledge Graph" trigger button

### Phase D: Multi-Tenant Project Scoping (schema already complete)
The project schema (`projects`, `project_permissions`, `document_categories`, `document_category_versions`, etc.) is already in the initial migration. The `projects` backend module exists. Work is completing the frontend and wiring ABAC into project-level checks.

1. Complete project CRUD API and project member management
2. Document category version management (version creation, file upload into version)
3. Project chat + search app linking
4. Frontend: Project pages (Data Studio admin view)
5. ABAC: project-level policies feed into dataset access control

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current: <100 users | Single instance of each service is sufficient. Monitor OpenSearch index size and task queue depth. |
| 100-1,000 users | Scale Python workers horizontally (multiple task-executor instances, same Redis queue). Backend remains single instance unless CPU-bound. |
| 1,000-10,000 users | OpenSearch cluster (3+ nodes, dedicated data/coordinating nodes). PostgreSQL read replicas for analytics. Backend behind load balancer. Redis Cluster for queue sharding. |
| 10,000+ users | Dedicated embedding microservice (GPU-backed, separate from task executor). Per-tenant OpenSearch index isolation (already partially designed: `knowledge_{tenant_id}`). Document queue partitioned by org. |

### First Bottleneck: Python Worker Throughput
The task executor processes one document at a time per process. With many simultaneous uploads, the queue depth grows. Fix: run multiple worker replicas. Each replica polls the same Redis queue; tasks are atomic (BRPOP is atomic).

### Second Bottleneck: OpenSearch Query Latency
Hybrid BM25 + vector search on large indices can be slow. Fix: per-dataset index routing (already uses `knowledge_{tenant_id}`). Future: tune k-NN HNSW parameters per index, add approximate search with lower ef_search on high-traffic paths.

### Third Bottleneck: LLM API Rate Limits
At scale, concurrent chat requests hit LLM provider rate limits. Fix: per-provider concurrency throttle in `llm-client.service.ts`, request queue with backoff, or self-hosted model for high-volume tenants.

---

## Anti-Patterns

### Anti-Pattern 1: Cross-Module Direct Imports

**What people do:** Import from a module's internal files (`@/modules/rag/services/rag.service.ts`) from another module.

**Why it's wrong:** Bypasses the barrel export contract, creates hidden coupling, makes refactoring expensive, violates the NX-style boundary rule.

**Do this instead:** Import only from barrel files (`@/modules/rag/index.ts`). If a service isn't exported from the barrel, either add it to the barrel or reconsider whether the cross-module dependency is correct.

### Anti-Pattern 2: Python Worker Writing Schema-Changing SQL

**What people do:** Let Peewee auto-create or alter tables (`db.create_tables()`).

**Why it's wrong:** The Python worker can initialize before Knex runs migrations, creating divergent schemas. Schema changes made by Peewee are invisible to the Node.js Knex migration history, breaking rollbacks.

**Do this instead:** All schema changes go through Knex migrations (`npm run db:migrate:make <name>`). Peewee models are updated after the migration to mirror the new schema. The worker's `executor_wrapper.py` startup uses idempotent `db.create_tables(safe=True)` as a safety net only for the Peewee-managed legacy tables that existed before the Knex migration system took ownership.

### Anti-Pattern 3: ABAC Logic in Route Middleware Only

**What people do:** Implement access control as a middleware function that checks role and blocks the route entirely.

**Why it's wrong:** ABAC requires attribute comparison against resource properties — which resources to return depends on *which* resources exist, not just the user's role. A middleware that runs before the query cannot evaluate `doc.department_tag == user.department`.

**Do this instead:** Coarse gate in middleware (is the user authenticated? is their role allowed?). Fine-grained filtering in the service layer after fetching candidate resources. For expensive cases, push the attribute filter into the DB query using a JOIN to policy rules.

### Anti-Pattern 4: Putting Config UI in User-Facing Pages

**What people do:** Add assistant configuration controls (LLM settings, KB bindings, retrieval parameters) to user-facing chat or search pages.

**Why it's wrong:** Per project memory (see `feedback_no_config_in_user_ui.md`): user-facing chat/search pages must have ZERO config UI. All config lives in Data Studio admin pages.

**Do this instead:** Config only in Data Studio. Users see chat and search interfaces with no settings exposed. The assistant fetches its own config on mount; users cannot override it.

### Anti-Pattern 5: Direct HTTP Calls from Backend to Python Worker

**What people do:** Call `http://task-executor:9380/parse` from the Express backend to trigger ingestion.

**Why it's wrong:** Creates tight service coupling, requires the Python service to be available for the API to work, makes horizontal scaling of workers require load balancer config.

**Do this instead:** Backend enqueues a JSON task payload to Redis. Workers poll the queue. The HTTP FastAPI server on the Python side is for internal tooling and health checks only, not for ingestion triggers.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| LLM Providers (OpenAI-compatible) | HTTP calls from `llm-client.service.ts` (backend) and `rag/llm/` (Python worker) | Must maintain OpenAI-compatible interface; supports Azure, self-hosted |
| Tavily Web Search | HTTP from `rag.service.ts` chat pipeline step | Optional, per-assistant config |
| Langfuse Tracing | SDK initialized in backend; traces all LLM calls | Per-tenant config in `tenant_langfuse` table |
| Jina / Cohere Reranking | HTTP from `rag-rerank.service.ts` | Optional, per-assistant config |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| rag module ↔ chat module | Barrel import only (`@/modules/rag/index.ts`) | Chat uses RAG search pipeline; no direct service file imports |
| rag module ↔ search module | Barrel import only | Same search pipeline, different response format |
| projects module ↔ rag module | Via PostgreSQL (project_chats.dataset_ids references datasets) | No direct code coupling; projects record dataset IDs as metadata |
| admin module ↔ all modules | Admin reads cross-module data directly for dashboards | Acceptable exception for admin-only aggregate views |

---

## Sources

- Direct codebase analysis: `be/src/shared/db/migrations/20260312000000_initial_schema.ts` (complete schema)
- Direct codebase analysis: `be/src/modules/rag/services/rag.service.ts` (access control pattern)
- Direct codebase analysis: `be/src/modules/rag/services/rag-graphrag.service.ts` (GraphRAG stub)
- Direct codebase analysis: `advance-rag/CLAUDE.md` (worker architecture)
- Direct codebase analysis: `be/CLAUDE.md` + `fe/CLAUDE.md` (service conventions)
- Project context: `.planning/PROJECT.md` (requirements and constraints)
- Project memory: `feedback_no_config_in_user_ui.md` (no config on user pages)

---

*Architecture research for: B-Knowledge RAG platform — ABAC, Document Versioning, GraphRAG, Deep Research, Multi-tenant Projects*
*Researched: 2026-03-18*
