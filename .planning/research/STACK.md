# Stack Research: Advanced Features Milestone

**Domain:** RAG Knowledge Base Platform (SDLC + Healthcare)
**Researched:** 2026-03-18
**Confidence:** HIGH (most claims verified via npm registry, PyPI, official docs, or codebase inspection)
**Scope:** New libraries and patterns for ABAC, Document Versioning, GraphRAG, and Deep Research additions to the existing fixed stack.

---

## Existing Stack (Fixed — Not Under Evaluation)

| Component | Tech | Notes |
|-----------|------|-------|
| Backend | Node.js 22+ / Express 4.21 / TypeScript / Knex / Zod | Fixed |
| Frontend | React 19 / Vite / TanStack Query / Tailwind / shadcn/ui | Fixed |
| RAG Worker | Python 3.11 / FastAPI / Peewee ORM | Fixed |
| Database | PostgreSQL 17 | Fixed |
| Search/Vector | OpenSearch 3.5.0 | Fixed |
| Cache/Queue | Valkey (Redis-compatible) 8 | Fixed |
| Object Storage | RustFS (S3-compatible) | Fixed |
| Observability | Langfuse | Fixed |

---

## Recommended New Stack

### 1. ABAC (Attribute-Based Access Control)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @casl/ability | 6.8.0 | Core ABAC engine (backend + frontend) | Isomorphic JS/TS, native TypeScript, 6KB core. Conditions-based rules define permissions as `(action, subject, conditions, fields)` tuples — exactly the ABAC model for "doctors see clinical docs, devs see specs". Version 6.8.0 confirmed as latest on npm (published ~Jan 2026). ~950K weekly downloads. | HIGH |
| @casl/react | 4.x | Frontend permission-aware rendering | Integrates with React for conditional UI. Same `Ability` class used on both BE and FE — share rule definitions via a common package or session payload. | MEDIUM (exact minor version unverified, but v4 is the current major for React 18+/19 compatibility) |
| PostgreSQL (existing) | 17 | Policy storage | Store ABAC rules in a `permission_rules` table with JSONB conditions column. No new infrastructure. Policies loaded into CASL `Ability` at session time, cached in Valkey with session TTL. | HIGH |

**Why CASL over alternatives:**

| Alternative | Why Not |
|-------------|---------|
| node-casbin / Apache Casbin | Heavier PERM metamodel. Good for policy-as-code files (`.conf`/`.csv`) but adds complexity when policies live in the same database as app data. ~108K weekly npm downloads vs CASL's ~950K. |
| AccessControl (onury) | Archived. GitHub repo unmaintained since 2019. Do not use. |
| Custom ABAC middleware | ABAC condition matching, field-level permissions, and subject detection are non-trivial. CASL handles the hard parts. |
| Oso / Permit.io / OpenFGA / SpiceDB | External SaaS or separate service dependency. Adds latency, vendor lock-in, cost, and a new infrastructure component to operate. CASL runs in-process — sufficient for this scale. |
| PostgreSQL Row-Level Security (RLS) | Cannot share the same rules with the frontend. Application-level ABAC with CASL gives a unified rule model across React, Express, and OpenSearch query injection. |

**ABAC architecture pattern (no new infra):**
1. `permission_rules` table in PostgreSQL stores rules as JSONB conditions (e.g., `{"document_class": "clinical", "org_id": "${user.org_id"}`)
2. Express middleware loads rules on login, builds CASL `Ability`, serializes and stores in session (Valkey)
3. Route handlers call `ability.can(action, subject)` before processing
4. OpenSearch queries have ABAC `must` clauses injected (tenant, project, attribute filters)
5. Frontend receives serialized rules in login response, constructs client-side `Ability` for UI rendering

---

### 2. Document Versioning

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| PostgreSQL append-only versioning | N/A (schema pattern) | Version history storage | Application-level versioning using a `document_versions` table with `version_number`, `file_key` (S3 object), `content_hash`, and `is_current` flag. Works on all PostgreSQL deployments (managed or self-hosted) — no extension required. Consistent with existing Knex migration approach. | HIGH |
| Knex (existing) | 3.1.0 | Migration + query layer | Already in use. Supports `jsonb`, `timestamptz`, and raw SQL for any range queries needed. | HIGH |

**Why this approach over alternatives:**

| Alternative | Why Not |
|-------------|---------|
| `temporal_tables` C extension | Requires superuser to install C extension. Not available on AWS RDS, Azure Database for PostgreSQL, or GCP Cloud SQL. The nearform PL/pgSQL port works everywhere but adds trigger complexity for minimal gain over the simpler application-level approach. |
| Git-based versioning (libgit2, isomorphic-git) | PROJECT.md explicitly states "not git-like". Branching/merging semantics are wrong for document search. Binary file handling in git is also a problem. |
| Event sourcing | Architectural overhaul. The goal is "keep old versions searchable" — a simple versioned table achieves this with a fraction of the complexity. |
| Separate versioning service | Adds infrastructure. PostgreSQL handles this natively without an additional operational burden. |

**Schema pattern:**
```sql
CREATE TABLE document_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  version_num  INTEGER NOT NULL,
  file_key     TEXT NOT NULL,       -- RustFS/S3 object key for this version's file
  content_hash TEXT,                -- SHA-256 for dedup (skip re-parse if identical)
  metadata     JSONB,              -- Parser output, chunk count, token count, etc.
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  is_current   BOOLEAN DEFAULT TRUE,
  UNIQUE(document_id, version_num)
);
-- Partial index for fast current-version queries (the 99% case)
CREATE INDEX idx_doc_versions_current ON document_versions(document_id) WHERE is_current = TRUE;
```

**OpenSearch integration:**
- Add `version_num` and `is_current` fields to chunk documents in OpenSearch
- Default retrieval filters `is_current = true` — historical search is an explicit opt-in via query parameter
- Re-parsing a new version reuses the existing pipeline unchanged (upload → parse → chunk → embed → index)

---

### 3. GraphRAG (Knowledge Graph Construction + Retrieval)

**Status: Migration work, not greenfield.** The complete RAGFlow GraphRAG implementation already exists in `advance-rag/rag/graphrag/`. All Python dependencies are already in `pyproject.toml`. No new libraries required.

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| NetworkX | ≥3.0 (pyproject.toml) | In-memory graph construction | Already a dependency. The existing GraphRAG code uses NetworkX throughout for entity graph construction during ingestion. Pure-Python, well-understood, sufficient for per-knowledge-base batches. See scale caveat below. | HIGH |
| graspologic | ≥3.4.0 (pyproject.toml) | Leiden community detection | Already a dependency. Used in `rag/graphrag/general/leiden.py`. `graspologic-native` provides Rust-backed Leiden partitioning. | HIGH |
| OpenSearch (existing) | 3.5.0 | Graph entity + relationship storage | Existing pattern stores extracted entities and relationships as OpenSearch documents with structured JSON fields, alongside chunk vectors. Avoids a separate graph database at current scale. | HIGH |
| PostgreSQL (existing) | 17 | Graph metadata persistence | Knowledge graph build status, entity counts, and community summary metadata stored in PostgreSQL. Already the pattern in the migrated code. | HIGH |

**NetworkX scale caveat (MEDIUM confidence finding):**
NetworkX is CPU-bound, single-threaded, and in-memory. Performance degrades significantly beyond ~100K nodes / 1M edges per graph build. For a per-knowledge-base construction approach (thousands to tens-of-thousands of entities typical for SDLC/healthcare doc sets), NetworkX is adequate. If a single knowledge base grows to hundreds of thousands of entities, consider:
- `igraph` (10–50x faster for large graphs, C-backed, same algorithm support)
- `nx-cugraph` NVIDIA GPU backend (zero code change acceleration for GPU-equipped deployments)

**Why NOT a dedicated graph database now:**

| Alternative | Why Not |
|-------------|---------|
| Neo4j | Adds Java infrastructure (memory-hungry). Justified when entity counts reach 10M+ per knowledge base and relationship traversal becomes the primary query pattern. The existing GraphRAG code serializes graphs in OpenSearch and builds in-memory — this works at the expected scale. |
| neo4j-graphrag-python | Python package wrapping Neo4j for GraphRAG. Pulls in Neo4j as a required dependency. Only justified if adopting Neo4j for storage, which adds infrastructure not warranted at current scale. |
| Amazon Neptune / Memgraph / ArangoDB | New services to operate. Not justified when OpenSearch + NetworkX covers the use case. |

**Files to integrate (already in codebase, not yet wired to the API):**
- `rag/graphrag/general/` — Full pipeline: entity extraction, graph construction, Leiden, community reports, mind maps
- `rag/graphrag/light/` — Lightweight extraction mode (lower LLM cost)
- `rag/graphrag/search.py` — Graph-augmented retrieval at query time
- `rag/graphrag/entity_resolution.py` — Entity deduplication via LLM

---

### 4. Deep Research (Multi-Hop Recursive Retrieval)

**Status: Migration work, not greenfield.** The TSQDR implementation already exists in `advance-rag/rag/advanced_rag/tree_structured_query_decomposition_retrieval.py`. All dependencies are stdlib or already installed. No new libraries required.

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| TSQDR implementation (existing) | N/A | Core deep research engine | Tree-Structured Query Decomposition Retrieval. LLM-driven decompose → multi-source retrieve → sufficiency check → recurse pattern. Implemented in `rag/advanced_rag/`. | HIGH |
| Tavily API (existing) | N/A | Web retrieval source | Already integrated in `rag/utils/tavily_conn.py`. Used during deep research for external web retrieval. | HIGH |
| asyncio (stdlib) | N/A | Concurrent sub-query execution | Already used in TSQDR for parallel retrieval across sources. No new dependency. | HIGH |

**Pipeline (existing pattern to complete and wire up):**
1. User submits a complex multi-document question
2. LLM decomposes it into a tree of sub-queries
3. Each sub-query retrieves from: KB vector/BM25 search + knowledge graph + Tavily web search
4. LLM checks sufficiency of retrieved context
5. If insufficient, generates follow-up queries and recurses (bounded by depth/iteration limits)
6. Final LLM synthesis produces a cited, chain-of-thought answer

**Why NOT add an orchestration framework:**

| Alternative | Why Not |
|-------------|---------|
| LangGraph | Adds the full LangChain ecosystem as a transitive dependency. TSQDR already implements the core pattern (decompose → retrieve → sufficiency check → recurse) in ~400 lines of direct Python. LangGraph's value is durable multi-agent state — overkill for a self-contained recursive retrieval loop. |
| LangChain | Already deliberately avoided in the existing codebase. Direct OpenAI-compatible API calls via `openai` and `litellm` are the pattern throughout. Adding LangChain introduces abstraction conflicts. |
| CrewAI / AutoGen / LlamaIndex workflows | Multi-agent frameworks for agent-to-agent coordination. Deep research here is a single retrieval pipeline with recursive steps, not a multi-agent system. Adds complexity without benefit. |

---

### 5. Domain-Specific Features (SDLC + Healthcare)

**No new libraries.** Domain specialization is a schema and configuration concern, not a technology concern.

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| PostgreSQL JSONB (existing) | 17 | Domain metadata storage | Store domain-specific document metadata as JSONB columns: SDLC (project phase, doc type, tech stack, sprint); Healthcare (doc class, regulation reference, patient-relevance flag, clinical specialty). Queryable, GIN-indexable, no schema migration per domain added. | HIGH |
| Zod (existing) | 3.25.x | Domain schema validation | Define domain-specific metadata as Zod schemas in the backend. Already used for all input validation. | HIGH |
| OpenSearch dynamic templates (existing) | 3.5.0 | Domain-aware search fields | Add `regulation_type`, `sdlc_phase` and similar fields to OpenSearch mappings via dynamic templates. No index recreation required for new fields when using dynamic mapping. | MEDIUM (confirm with OpenSearch 3.5 docs before implementing field additions to live indices) |

---

## Supporting Libraries (New Dependencies Summary)

### Backend (Node.js) — 1 new package

| Library | Version | Purpose | When to Add |
|---------|---------|---------|-------------|
| @casl/ability | ^6.8.0 | ABAC permission engine | Phase: ABAC implementation |

### Frontend (React) — 1 new package

| Library | Version | Purpose | When to Add |
|---------|---------|---------|-------------|
| @casl/react | ^4.0.0 | Permission-aware component rendering | Phase: ABAC implementation |

### Python Worker — 0 new packages

All GraphRAG and Deep Research libraries already in `advance-rag/pyproject.toml`:
- `networkx>=3.0` — Graph construction
- `graspologic>=3.4.0` — Leiden community detection (Rust-backed)
- `scikit-learn>=1.3.0` — ML utilities for entity embedding clustering
- `pandas>=2.0.0` — Tabular data manipulation in graph construction
- `xgboost>=2.0.0` — Reranking model support

---

## Installation

```bash
# Backend — ABAC only
cd be && npm install @casl/ability@^6.8.0

# Frontend — ABAC permission components
cd fe && npm install @casl/react@^4.0.0

# Python worker — no new installs
# All GraphRAG/Deep Research deps already declared in advance-rag/pyproject.toml
```

---

## Alternatives Considered

| Category | Recommended | Alternative | When Alternative Makes Sense |
|----------|-------------|-------------|------------------------------|
| ABAC engine | @casl/ability | node-casbin | If policies are defined as external policy files (`.conf`/`.csv`) and managed by a policy admin tool, Casbin's PERM metamodel is a better fit. |
| ABAC engine | @casl/ability | OpenFGA / SpiceDB | If the access model becomes a Zanzibar-style relationship graph (tuples between users, roles, resources across thousands of types), switch to a dedicated relationship-based auth service. |
| Graph storage | OpenSearch + NetworkX | Neo4j + neo4j-graphrag-python | When a single knowledge base exceeds ~10M entities OR when graph traversal (multi-hop entity path queries) becomes the primary retrieval pattern. |
| Deep research | Existing TSQDR | LangGraph | If deep research expands to true multi-agent orchestration with human-in-the-loop approval steps, persistent workflow state across sessions, or agent-to-agent communication. |
| Document versioning | App-level versioning table | PostgreSQL temporal_tables extension | Only if the deployment environment allows C extensions and DBA overhead for trigger management is acceptable. |

---

## What NOT to Add (and Why)

| Technology | Why Avoid | Use Instead |
|------------|-----------|-------------|
| LangChain / LangGraph | Conflicts with existing direct-API-call pattern. 50+ transitive dependencies. TSQDR already implements deep research. | Direct `openai`/`litellm` API calls (existing pattern) |
| Neo4j | Adds Java service to operate. Premature at current entity scale. | NetworkX + OpenSearch (existing pattern) |
| Prisma / TypeORM | Would require migrating from Knex mid-project. | Knex (existing) |
| Temporal (workflow engine, Temporal.io) | Deep research is async but not long-running-durable-workflow complex. Redis queue + asyncio handles it. | Python asyncio + Valkey pub/sub (existing) |
| Apache Kafka | Redis/Valkey pub/sub and queues already handle task coordination. Kafka is justified at streaming scale this project doesn't need. | Valkey pub/sub (existing) |
| Keycloak / Auth0 / Okta | External auth services handle authentication but not domain-aware ABAC tied to document attributes and project membership. | CASL in-process with PostgreSQL rule storage |
| AccessControl (npm, onury) | GitHub archived, unmaintained since 2019. | @casl/ability |
| igraph (Python) | Not needed now. Only worthwhile if NetworkX becomes a bottleneck (>100K entities per KB batch). Lower priority than wiring existing GraphRAG code. | NetworkX (existing), re-evaluate at scale |

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| @casl/ability | 6.8.0 | Node.js 18+ | Works with Express 4.x; no adapter needed for plain Express |
| @casl/react | 4.x | React 18+, React 19 | Uses React Context; compatible with React Compiler (no manual memo needed) |
| @casl/ability | 6.x | @casl/react 4.x | Keep major versions aligned; v5 ability is NOT compatible with v4 react package |
| NetworkX | ≥3.0 | Python 3.11 | graspologic ≥3.4.0 requires NetworkX ≥3.0 |
| graspologic | ≥3.4.0 | Python 3.11, NetworkX ≥3.0 | `graspologic-native` (Rust) compiled separately; Leiden algorithm is the key dep |

---

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| CASL version (6.8.0 latest) | HIGH | Confirmed via npm search results (published ~Jan 2026) |
| CASL React v4 compatibility | MEDIUM | Major version confirmed current; exact minor not independently verified |
| NetworkX / graspologic already in pyproject.toml | HIGH | Directly read from advance-rag/pyproject.toml |
| GraphRAG / TSQDR code already in codebase | HIGH | Confirmed via directory listing of advance-rag/rag/graphrag/ and advance-rag/rag/advanced_rag/ |
| PostgreSQL versioning pattern (no extension) | HIGH | Validated by multiple sources; explicitly confirmed to work on managed PostgreSQL |
| NetworkX scale threshold (~100K nodes) | MEDIUM | Consistent across multiple sources; exact threshold depends on algorithm and hardware |
| OpenSearch dynamic templates for domain fields | MEDIUM | Pattern is standard OpenSearch; field behavior on live index changes should be verified against OpenSearch 3.5 docs before production use |
| No dedicated graph database needed now | HIGH | Neo4j alternative confirmed to add significant infrastructure; OpenSearch + NetworkX pattern is the established RAGFlow approach at knowledge-base scale |

---

## Sources

- [@casl/ability npm](https://www.npmjs.com/package/@casl/ability) — Version 6.8.0, weekly download stats, last published date
- [@casl/react npm](https://www.npmjs.com/package/@casl/react) — v4 current major
- [CASL official docs v6](https://casl.js.org/v6/en/cookbook/roles-with-persisted-permissions/) — Persisted permissions pattern (PostgreSQL + Redis caching)
- [CASL GitHub](https://github.com/stalniy/casl) — TypeScript source, isomorphic design
- [node-casbin GitHub](https://github.com/apache/casbin-node-casbin) — Alternative evaluated; ~108K weekly downloads
- [Ubicloud ABAC learnings](https://www.ubicloud.com/blog/learnings-from-building-a-simple-authorization-system-abac) — Production PostgreSQL JSONB ABAC pattern
- [NetworkX scale limits](https://memgraph.com/blog/data-persistency-large-scale-data-analytics-and-visualizations-biggest-networkx-challenges) — 100K node threshold, production challenges
- [neo4j/neo4j-graphrag-python](https://github.com/neo4j/neo4j-graphrag-python) — Alternative GraphRAG library; rejected due to Neo4j infrastructure dependency
- [Microsoft GraphRAG PyPI](https://pypi.org/project/graphrag/) — Reference implementation confirming NetworkX + graspologic community detection pattern
- [nearform/temporal_tables](https://github.com/nearform/temporal_tables) — PL/pgSQL port that avoids C extension; confirms managed PostgreSQL compatibility
- [Implementing System-Versioned Tables in Postgres](https://hypirion.com/musings/implementing-system-versioned-tables-in-postgres) — Application-level approach rationale
- [graphrag.com](https://graphrag.com/) — Production GraphRAG patterns and alternatives survey
- [HopRAG multi-hop RAG (arXiv 2502.12442)](https://arxiv.org/html/2502.12442v1) — 2025 multi-hop retrieval research confirming TSQDR-style decompose-retrieve-check-recurse pattern is state-of-the-art

---

*Stack research for: B-Knowledge RAG Platform — ABAC, Document Versioning, GraphRAG, Deep Research*
*Researched: 2026-03-18*
