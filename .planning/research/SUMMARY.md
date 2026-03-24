# Project Research Summary

**Project:** B-Knowledge — RAG Knowledge Base Platform
**Domain:** Enterprise RAG platform for SDLC and Healthcare verticals
**Researched:** 2026-03-18
**Confidence:** HIGH (direct codebase analysis + verified external sources)

## Executive Summary

B-Knowledge is an enterprise RAG knowledge base platform already operating with a validated core pipeline (multi-format ingestion, hybrid BM25+vector search, reranking, streaming chat with citations, multi-LLM provider support). The milestone research covered four capability areas: Attribute-Based Access Control (ABAC), Document Versioning, GraphRAG migration, and Deep Research migration. Critically, both GraphRAG and Deep Research are migration tasks — the full Python implementations already exist in `advance-rag/rag/graphrag/` and `advance-rag/rag/advanced_rag/` respectively, with all required Python dependencies already declared in `pyproject.toml`. No new Python packages are needed. The only net-new library additions are `@casl/ability` (backend) and `@casl/react` (frontend) for the ABAC engine.

The recommended approach is a strict phase ordering driven by dependency chains, not feature desirability. ABAC must come before GraphRAG and Deep Research because both introduce new retrieval paths that require access-controlled queries. Multi-tenant isolation cleanup (consolidating `SYSTEM_TENANT_ID` reads) must happen before ABAC to avoid a fragmented refactor mid-feature. Document versioning can be built in parallel with or just after ABAC but must land before Deep Research, which may need to reason across versions. The project schema for multi-tenant project scoping is already complete in the initial migration; the remaining work is backend service completion and frontend wiring.

The top risk is not architectural complexity but enforcement gaps: ABAC implemented only at Express middleware does not protect retrieval — OpenSearch queries in `rag-search.service.ts` must receive a user-derived access filter at the data layer, not just at the route layer. A second class of risk is cost and latency spiral in Deep Research, where the existing `maxDepth` guard is insufficient without total token budget caps and per-tenant rate limits. A third risk is schema divergence between Knex migrations and Peewee ORM models — any DB migration touching shared tables must update both in the same PR or silent failures will emerge in production.

---

## Key Findings

### Recommended Stack

The core stack is fixed and not under evaluation. The only new additions are two JS packages for ABAC. GraphRAG and Deep Research reuse all existing Python dependencies already in `pyproject.toml`. Document versioning is an application-level PostgreSQL schema pattern requiring no new infrastructure or libraries.

**Core technologies (fixed):**
- Node.js 22 / Express 4.21 / TypeScript / Knex / Zod — backend API, all mutations validated via Zod middleware
- React 19 / Vite / TanStack Query / Tailwind / shadcn/ui — frontend SPA
- Python 3.11 / FastAPI / Peewee ORM — RAG worker (ingestion, GraphRAG, Deep Research)
- PostgreSQL 17 — all structured metadata and schema authority via Knex migrations
- OpenSearch 3.5.0 — vector + BM25 hybrid search, per-tenant index pattern
- Valkey (Redis-compatible) 8 — task queue, pub/sub progress events, session/cache
- RustFS (S3-compatible) — binary file storage

**New additions (minimal):**
- `@casl/ability` 6.8.0 — isomorphic ABAC engine; ~950K weekly downloads, TypeScript-native, in-process (no external service), rules stored in PostgreSQL JSONB, cached in Valkey per session
- `@casl/react` 4.x — permission-aware component rendering, compatible with React 19 and React Compiler

**Why not alternatives:**
- No LangChain/LangGraph — conflicts with existing direct-API-call pattern; TSQDR already implements deep research in ~400 lines
- No Neo4j — existing OpenSearch + NetworkX covers expected scale; Neo4j adds Java infrastructure only justified above ~10M entities per KB
- No dedicated graph database — OpenSearch stores graph entities and relationships alongside chunk vectors; avoids a new service to operate
- No external auth SaaS (Oso, Permit.io, OpenFGA) — CASL runs in-process, sufficient at current scale, avoids vendor lock-in and latency

See `/mnt/d/Project/b-solution/b-knowledge/.planning/research/STACK.md` for full alternatives analysis.

---

### Expected Features

See `/mnt/d/Project/b-solution/b-knowledge/.planning/research/FEATURES.md` for full feature landscape with complexity estimates and source citations.

**Must have (table stakes — active gaps):**
- Org-level tenant isolation — zero-tolerance for data leakage; foundational for enterprise and healthcare
- RBAC (role-based access control) — baseline expectation; ships before ABAC
- ABAC (attribute-based access control) — healthcare: department-restricted docs; SDLC: project-scoped docs
- Document-level permission inheritance — dataset permissions flow to documents with overrides
- Audit logging — HIPAA regulatory requirement; cheap to add early, expensive to retrofit
- Document version history — VersionRAG research shows 90% accuracy on version-sensitive queries vs 58% naive RAG
- Answer quality feedback (thumbs up/down) — minimum viable retrieval quality signal
- Chunk visualization and intervention — already partially built; critical for user trust

**Should have (differentiators):**
- GraphRAG — entity extraction, community detection, graph+vector hybrid retrieval; 80% accuracy vs 50% traditional RAG on multi-hop queries; already implemented in Python, needs wiring
- Deep Research — recursive multi-hop retrieval with cross-KB search; TSQDR implementation exists, needs wiring
- Document metadata and tagging — feeds ABAC attribute matching; auto-generated during parsing
- Project-scoped knowledge bases — SDLC domain differentiator; schema already complete
- RAG quality metrics dashboard — extends Langfuse; increasingly expected in 2026

**Defer to v2+:**
- Code-aware parsing (Python/TypeScript/Java syntax-aware chunking)
- API documentation parser (OpenAPI/Swagger structured chunks)
- Healthcare-specific features (PHI detection alerts, medical terminology mapping, regulatory tracking) — add when healthcare tenant demand materializes
- Research report generation — depends on Deep Research stability first
- A/B testing for retrieval configs — Langfuse covers basic observability now
- RAG quality metrics dashboard — important but not blocking launch

**Anti-features (explicitly do not build):**
- Full PII/PHI redaction — massive compliance liability; detect and alert only
- Custom model training/fine-tuning — separate product concern
- Visual workflow builder — scope creep; B-Knowledge is not an agent orchestrator
- Mobile app — web-first; responsive web covers mobile browsers
- Agentic tool integration (MCP, function calling) — expose as API for external frameworks instead

---

### Architecture Approach

The monorepo structure is established and well-organized. The architecture follows four key patterns: (1) Redis task queue for async ingestion — backend enqueues, Python worker polls, progress flows back via Redis pub/sub → Socket.IO → React; (2) ABAC as middleware-plus-service-filter — coarse role gate in middleware, attribute filter applied in service layer before returning resources; (3) Dual ORM, single database — Knex owns all migrations, Peewee mirrors schema for read/write; (4) Project hierarchy as tenant scope — the schema for `projects`, `project_permissions`, `document_categories`, and `document_category_version_files` is already in the initial migration.

**Major components:**
1. React SPA (`fe/`) — Data Studio (admin, config-only) vs Chat/Search pages (zero config UI); TanStack Query + Socket.IO
2. Express Backend (`be/`) — HTTP API, auth/session, ABAC enforcement, RAG query pipeline (10 stages), task dispatch
3. Python RAG Worker (`advance-rag/`) — document ingestion pipeline; GraphRAG construction; Deep Research execution; polls Redis
4. Converter Worker (`converter/`) — Office-to-PDF via LibreOffice; Redis queue only
5. PostgreSQL — schema authority via Knex migrations; Peewee reads same tables
6. OpenSearch — vector + BM25 per-tenant index (`knowledge_{tenant_id}`); queried by backend at query time, written by Python worker at index time
7. Valkey/Redis — task queue dispatch; pub/sub progress events; session store; ABAC policy cache

**Build order implications from architecture:**
- Phase A: ABAC foundation — prerequisite for everything; every retrieval endpoint needs access filter
- Phase B: Document versioning — can overlap with ABAC; needs `version_id` + `is_current` in OpenSearch chunks
- Phase C: GraphRAG + Deep Research — backend service stubs exist; work is wiring Python pipeline and UI toggles
- Phase D: Multi-tenant project scoping — schema complete; work is backend completion and frontend

See `/mnt/d/Project/b-solution/b-knowledge/.planning/research/ARCHITECTURE.md` for full component boundaries, data flow diagrams, and anti-patterns.

---

### Critical Pitfalls

See `/mnt/d/Project/b-solution/b-knowledge/.planning/research/PITFALLS.md` for full pitfall catalog including recovery strategies, performance traps, and security mistakes.

1. **SYSTEM_TENANT_ID hardcoded in 5 files** — Consolidate all OpenSearch client construction into `shared/services/opensearch.service.ts` that always accepts `tenantId` as parameter; migrate `process.env['SYSTEM_TENANT_ID']` reads to `config` object. Do this before any multi-tenant feature work begins.

2. **ABAC enforcement at wrong layer** — Express middleware cannot protect retrieval. Every OpenSearch query (`fullTextSearch`, `vectorSearch`, `hybridSearch`, `KGSearch`) must receive a user-derived access filter as a required parameter, intersected with the assistant's configured `kb_ids`. Security labels on chunks at index time; mandatory filter at query time.

3. **OpenSearch index-per-tenant scaling bomb** — Default 1000-index hard limit; each index consumes cluster state memory. Decision needed before multi-tenant work: pool model (single shared index with mandatory `tenant_id` filter — recommended), silo model (per-tenant index for HIPAA-strict tenants), or hybrid. Keep `getIndexName()` as the single abstraction point.

4. **Document version transition creates search gap** — Naive delete+reindex leaves documents invisible. Add `version_id` and `is_current` fields to OpenSearch chunks. New version chunks indexed as `is_current: false`; single `update_by_query` atomically flips old version to false and new to true. Never delete old chunks immediately.

5. **Deep Research token cost and latency spiral** — Existing `maxDepth: 3` parameter is insufficient. A single query at depth 3 with 3 follow-ups per level triggers 10-20 LLM calls at $0.15–$1.50/query. Must add: hard cap on total LLM calls per query (10-15), total token budget per query (configurable, default 50K), wall-clock timeout with graceful truncation, and per-tenant rate limiting separate from regular chat.

6. **GraphRAG entity resolution silent failures** — LLM entity extraction at enterprise scale produces duplicate nodes for the same real-world entity ("Dr. Smith" vs "Smith, J." vs "John Smith MD"). Resolution must be a separate auditable pipeline stage, not inline with graph construction. Track entity count per KB over time — linear growth without new documents signals failures.

7. **Peewee/Knex schema divergence** — Two ORMs model the same PostgreSQL tables. Every Knex migration touching a Peewee-managed table must update `advance-rag/db/db_models.py` in the same PR. Add Python worker startup health check validating Peewee fields against `INFORMATION_SCHEMA`. A CI check should flag migration PRs that lack corresponding Peewee model updates.

---

## Implications for Roadmap

Based on combined research, the dependency chain is clear and non-negotiable:

```
Multi-tenant cleanup (Pitfall 1)
  → RBAC foundation
    → ABAC implementation (Pitfall 2)
      → GraphRAG migration (Pitfall 5, 6)
        → Deep Research migration (Pitfall 6)
          → Cross-dataset retrieval

Document versioning (Pitfall 4)
  → Can run in parallel with ABAC
  → Must complete before Deep Research (multi-version reasoning)
```

### Phase 1: Foundation Hardening and Multi-Tenant Cleanup

**Rationale:** Technical debt in SYSTEM_TENANT_ID scattered across 5 files (Pitfall 1) and `process.env` reads violating config conventions must be resolved before any multi-tenant feature work begins. Also includes audit logging (cheap now, expensive to retrofit for HIPAA) and answer quality feedback (low complexity, immediate retrieval signal).

**Delivers:** Config-compliant codebase, consolidated OpenSearch service layer with parameterized `tenantId`, basic user feedback loop, audit trail foundation.

**Addresses:**
- Audit logging (FEATURES.md — table stakes, HIPAA requirement)
- Answer quality feedback (FEATURES.md — low complexity, immediate value)
- Chunk visualization completion (FEATURES.md — partially built, trust-critical)

**Avoids:**
- SYSTEM_TENANT_ID refactor mid-ABAC phase (Pitfall 1)
- `process.env` convention violations that compound as codebase grows (PITFALLS.md)

**Research flag:** Standard patterns — no additional research needed.

---

### Phase 2: RBAC and ABAC

**Rationale:** RBAC is the prerequisite for ABAC; ABAC is the prerequisite for project-scoped access, GraphRAG retrieval isolation, and Deep Research cross-KB search. Must be built with dual enforcement: middleware (coarse) and service-layer filter (attribute-based on retrieval results). CASL `@casl/ability` is the recommended engine — 2 new packages only.

**Delivers:** Per-tenant role management, attribute-based document access for healthcare and SDLC, document-level permission inheritance, admin-only policy CRUD in Data Studio (zero config on user-facing pages).

**Addresses:**
- Org-level tenant isolation (FEATURES.md — table stakes)
- RBAC (FEATURES.md — must ship)
- ABAC (FEATURES.md — must ship, healthcare + SDLC requirement)
- Document-level permission inheritance (FEATURES.md — must ship)

**Avoids:**
- ABAC at wrong layer — service-layer filter applied to OpenSearch queries, not just middleware (Pitfall 2)
- N+1 ABAC policy queries — resolved access sets cached in Valkey per session (PITFALLS.md performance traps)
- ABAC without audit trail — all policy changes logged with before/after snapshot (PITFALLS.md security)

**Research flag:** Well-documented CASL patterns; CASL v6 official docs cover the PostgreSQL + Valkey caching pattern. No additional research needed. Verify `@casl/react` exact minor version before install.

---

### Phase 3: Document Versioning

**Rationale:** VersionRAG research shows 90% accuracy on version-sensitive queries vs 58% for naive RAG — a major retrieval quality gain. Can be built after ABAC (version access inherits dataset-level ABAC rules). Must complete before Deep Research, which needs version-aware context. The `document_versions` table already exists in the schema; work is OpenSearch chunk field additions and the atomic version flip logic.

**Delivers:** Linear document version chain per document, version-aware OpenSearch chunk indexing with `is_current` filter, historical search as explicit opt-in, version transition UX (progress via existing Socket.IO/Redis pub/sub).

**Addresses:**
- Document version history (FEATURES.md — high value for both domains)
- Changelog and release notes tracking for SDLC (FEATURES.md — depends on versioning)
- Regulatory document tracking for healthcare (FEATURES.md — depends on versioning)

**Avoids:**
- Search gap during version transitions — atomic `update_by_query` flip pattern (Pitfall 4)
- OpenSearch chunk schema missing `version_id` + `is_current` — add before any version uploads (PITFALLS.md "looks done but isn't")
- Embedding re-generation for all chunks — content hash comparison, reuse embeddings for unchanged chunks (PITFALLS.md performance traps)

**Research flag:** Well-documented. VersionRAG paper (arXiv 2510.08109) covers the patterns directly. PostgreSQL append-only versioning is a standard pattern. No additional research needed.

---

### Phase 4: GraphRAG Migration and Wiring

**Rationale:** GraphRAG code already exists in `advance-rag/rag/graphrag/` — this is migration and wiring, not greenfield. Backend service stubs (`rag-graphrag.service.ts`) exist. Work is: verify Python pipeline builds graph on task type `graphrag`, connect backend service stub to chat pipeline toggle, add "Build Knowledge Graph" trigger in dataset UI, implement entity resolution as separate auditable stage.

**Delivers:** Knowledge graph construction per KB, entity extraction and community detection, graph+vector hybrid retrieval at query time, per-assistant GraphRAG toggle in Data Studio.

**Addresses:**
- GraphRAG (FEATURES.md — major differentiator: 80% vs 50% accuracy on multi-hop queries)
- Entity and relationship extraction (FEATURES.md — prerequisite for Deep Research)
- Multi-hop question answering (FEATURES.md — answers questions spanning multiple documents)

**Avoids:**
- Entity resolution silent failures — separate auditable pipeline stage, confidence threshold for auto-merge, flag below threshold for admin review (Pitfall 6)
- Community reports going stale — incremental regeneration, report age tracked (PITFALLS.md performance traps)
- GraphRAG + vector results unlabeled — label context sections ("From knowledge graph:" vs "From document search:") (PITFALLS.md UX pitfalls)

**Research flag:** Needs phase research. GraphRAG indexing costs are 10-100x vector-only RAG; LazyGraphRAG (2025) mitigates this. The integration between the existing Python pipeline and backend stubs needs verification of task payload format and progress event schema.

---

### Phase 5: Deep Research Migration and Wiring

**Rationale:** Deep Research (TSQDR) exists in `advance-rag/rag/advanced_rag/`. All dependencies are stdlib or already installed. Backend stub (`rag-deep-research.service.ts`) exists. Depends on ABAC (cross-KB retrieval must respect access controls) and benefits from GraphRAG being wired (graph entities feed into multi-hop retrieval quality). Cost controls are mandatory architectural decisions, not optional tuning.

**Delivers:** Recursive multi-hop query decomposition, cross-KB retrieval respecting ABAC, SSE streaming of intermediate results at each depth level, per-tenant token budget enforcement, Deep Research toggle per assistant in Data Studio.

**Addresses:**
- Deep Research / recursive query decomposition (FEATURES.md — differentiator)
- Cross-dataset retrieval (FEATURES.md — search across KBs with ABAC)
- Research report generation (FEATURES.md — defer until Deep Research is solid)

**Avoids:**
- Token cost spiral — hard cap on total LLM calls (10-15 per query), token budget per query (configurable, default 50K), wall-clock timeout with graceful truncation (Pitfall 5)
- No progressive disclosure — stream best answer found at each depth via existing `onProgress` SSE infrastructure (PITFALLS.md UX)
- Missing per-tenant rate limiting — separate quota from regular chat, not shared (PITFALLS.md)

**Research flag:** Needs phase research. Token budget sizing, semantic similarity caching strategy for repeated Deep Research queries, and SSE streaming integration with the existing frontend chat infrastructure need validation.

---

### Phase 6: Multi-Tenant Project Scoping

**Rationale:** The project schema is already complete in the initial migration (`projects`, `project_permissions`, `document_categories`, `document_category_versions`, `document_category_version_files`). The `projects` backend module exists. Work is completing backend CRUD, frontend project pages in Data Studio, and wiring ABAC into project-level checks. Placed last because it depends on ABAC (project member permissions feed into document access) and versioning (document categories have versions).

**Delivers:** Project-level KB isolation, team-based document access, project chats and search apps, cross-project search for authorized users.

**Addresses:**
- Project-scoped knowledge bases (FEATURES.md — SDLC domain differentiator)
- Multi-tenant ABAC at project level (FEATURES.md — ABAC extended to project membership)
- Document categories with versioned datasets (ARCHITECTURE.md — schema already complete)

**Avoids:**
- Hardcoded tenant isolation assumption — pool vs. silo model decision already made in Phase 1 cleanup (Pitfall 3)
- OpenSearch index-per-tenant scaling — `getIndexName()` abstraction already consolidated (Pitfall 1 remediation)

**Research flag:** Standard CRUD patterns for the schema that already exists. No additional research needed.

---

### Phase Ordering Rationale

- **Cleanup first:** Pitfall 1 (SYSTEM_TENANT_ID in 5 files) creates a cascade refactor risk if deferred. One clean refactor before feature work costs less than 5 piecemeal refactors mid-features.
- **ABAC before retrieval features:** GraphRAG and Deep Research introduce new retrieval paths. Adding them without ABAC means those paths are unprotected — a security gap that cannot be patched retroactively without re-testing all retrieval paths.
- **Versioning before Deep Research:** Deep Research needs to reason about document currency. Without `is_current` fields on chunks, multi-hop queries may surface stale version content as current facts.
- **GraphRAG before Deep Research:** TSQDR's multi-hop retrieval quality depends on graph entities. Building Deep Research before GraphRAG means shipping a feature with missing context sources.
- **Projects last:** The schema is done; the remaining work is UI and policy wiring — lower risk work that benefits from all earlier security and versioning foundations being solid.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 4 (GraphRAG):** LazyGraphRAG vs full GraphRAG cost/accuracy tradeoff for healthcare and SDLC corpus sizes. Task payload format verification between backend and Python worker. Community report incremental regeneration strategy.
- **Phase 5 (Deep Research):** Token budget sizing benchmarks for realistic SDLC/healthcare query complexity. Semantic similarity caching implementation (Redis hash of normalized query + kb_ids). SSE streaming of intermediate Deep Research results via existing chat frontend infrastructure.

Phases with standard patterns (skip additional research):

- **Phase 1 (Foundation Hardening):** Config consolidation is a mechanical refactor with clear before/after.
- **Phase 2 (ABAC):** CASL v6 official docs cover PostgreSQL + Valkey caching pattern in full. Well-documented.
- **Phase 3 (Document Versioning):** PostgreSQL append-only versioning + OpenSearch `update_by_query` flip are established patterns documented in VersionRAG paper and PostgreSQL documentation.
- **Phase 6 (Project Scoping):** Schema complete; backend module exists; standard CRUD + frontend work.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | CASL version verified via npm (6.8.0, Jan 2026). All Python deps confirmed directly from `advance-rag/pyproject.toml`. GraphRAG/TSQDR code confirmed in codebase via directory inspection. |
| Features | MEDIUM-HIGH | Table stakes confirmed against enterprise RAG landscape sources (2025-2026). VersionRAG accuracy numbers from arXiv paper (HIGH). GraphRAG accuracy numbers from Microsoft arXiv paper (HIGH). Healthcare-specific feature priority is MEDIUM — depends on actual tenant demand. |
| Architecture | HIGH | Based on direct codebase analysis of migration schema, service files, and module structure. Component boundaries confirmed from `be/CLAUDE.md`, `fe/CLAUDE.md`, `advance-rag/CLAUDE.md`. |
| Pitfalls | HIGH | Pitfalls 1-7 all grounded in direct code inspection of specific files and line-level findings. External sources (AWS, VersionRAG, Microsoft GraphRAG) confirm patterns. |

**Overall confidence:** HIGH

### Gaps to Address

- **CASL React exact minor version:** `@casl/react` v4 major is confirmed current; exact minor version not independently verified. Run `npm info @casl/react` before install to confirm latest v4.x. Ensure `@casl/ability` and `@casl/react` major versions are aligned (v5 ability is NOT compatible with v4 react package).
- **OpenSearch dynamic templates for domain fields:** Adding `regulation_type`, `sdlc_phase`, and similar fields to live indices via dynamic mapping is standard OpenSearch but should be verified against OpenSearch 3.5 docs before production use to confirm behavior on existing index mappings.
- **GraphRAG indexing cost benchmarks:** LazyGraphRAG (2025) claims 0.1% of full GraphRAG indexing cost. Validate this against actual SDLC and healthcare document corpus characteristics during Phase 4 planning before committing to full vs. lazy GraphRAG for the default mode.
- **NetworkX scale threshold:** The ~100K node threshold for NetworkX degradation is consistent across sources but hardware-dependent. Per-KB entity counts for the expected healthcare/SDLC corpus sizes should be estimated during Phase 4 planning to determine whether `igraph` migration is needed.
- **Pool vs. silo OpenSearch model for healthcare HIPAA:** The pool model (recommended) requires strong application-layer enforcement. For HIPAA-regulated tenants, OpenSearch Document Level Security (DLS) may be required as a defense-in-depth layer. Validate compliance requirements with actual healthcare tenants before committing to architecture.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase — `be/src/modules/rag/services/rag-search.service.ts`, `rag-graphrag.service.ts`, `rag-deep-research.service.ts`, `rag-document.model.ts`, `knowledgebase.model.ts`, `rag-file.model.ts` — multi-tenant gaps, ABAC enforcement gaps
- Direct codebase — `advance-rag/rag/graphrag/` (full pipeline), `advance-rag/rag/advanced_rag/` (TSQDR) — GraphRAG and Deep Research exist, not yet wired
- Direct codebase — `be/src/shared/db/migrations/20260312000000_initial_schema.ts` — complete schema including `document_versions`, `projects`, `project_permissions`
- Direct codebase — `advance-rag/pyproject.toml` — NetworkX, graspologic, scikit-learn confirmed as existing dependencies
- [VersionRAG Paper (arXiv 2510.08109)](https://arxiv.org/abs/2510.08109) — 90% vs 58% accuracy on version-sensitive queries
- [Microsoft GraphRAG Paper (arXiv 2404.16130)](https://arxiv.org/abs/2404.16130) — 80% vs 50% accuracy on multi-hop queries; entity resolution and community detection patterns
- [HopRAG Paper (arXiv 2502.12442)](https://arxiv.org/abs/2502.12442) — multi-hop retrieval state-of-the-art, TSQDR-style pattern confirmed
- [AWS: Multi-Tenant SaaS with Amazon OpenSearch](https://aws.amazon.com/blogs/apn/storing-multi-tenant-saas-data-with-amazon-opensearch-service/) — pool vs. silo model tradeoffs

### Secondary (MEDIUM confidence)

- [@casl/ability npm](https://www.npmjs.com/package/@casl/ability) — version 6.8.0, ~950K weekly downloads, published Jan 2026
- [CASL official docs v6](https://casl.js.org/v6/en/cookbook/roles-with-persisted-permissions/) — PostgreSQL + Redis caching pattern
- [Pinecone: RAG with Access Control](https://www.pinecone.io/learn/rag-access-control/) — pre-filter access control patterns in RAG
- [BigData Boutique: Multi-Tenancy with OpenSearch](https://bigdataboutique.com/blog/multi-tenancy-with-elasticsearch-and-opensearch-c1047b) — practical index strategy tradeoffs
- [Firecrawl: Best Enterprise RAG Platforms 2025](https://www.firecrawl.dev/blog/best-enterprise-rag-platforms-2025) — feature landscape validation
- [Springer: Survey on RAG for Healthcare](https://link.springer.com/article/10.1007/s00521-025-11666-9) — healthcare RAG requirements
- [NetworkX scale limits](https://memgraph.com/blog/data-persistency-large-scale-data-analytics-and-visualizations-biggest-networkx-challenges) — ~100K node degradation threshold

### Tertiary (LOW confidence, needs validation)

- [Arkenea: RAG in Healthcare 2025](https://arkenea.com/blog/rag-in-healthcare/) — healthcare feature expectations; needs validation against actual tenant requirements
- [NStarX: Next Frontier of RAG 2026-2030](https://nstarxinc.com/blog/the-next-frontier-of-rag-how-enterprise-knowledge-systems-will-evolve-2026-2030/) — market direction; speculative

---
*Research completed: 2026-03-18*
*Ready for roadmap: yes*
