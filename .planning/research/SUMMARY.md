# Project Research Summary

**Project:** B-Knowledge v0.2 — Knowledge Base Refactor & Quality
**Domain:** Knowledge Base Management / RAG Platform — incremental feature additions on existing production system
**Researched:** 2026-04-02
**Confidence:** HIGH

## Executive Summary

B-Knowledge v0.2 is an incremental release layering four tightly coupled features onto an existing, validated production stack: (1) renaming the "Project" entity to "Knowledge Base" across all layers, (2) enhancing chunk quality with advanced chunking strategies and heuristic scoring, (3) upgrading the permission model to a clean 3-tier KB-level RBAC system, and (4) shipping supporting chunk-quality UI. All four features build exclusively on existing infrastructure — no new libraries, services, or infrastructure components are required. The stack (Node.js 22 / Express 4 / React 19 / Python 3.11 / FastAPI / PostgreSQL / OpenSearch / Valkey) is entirely validated and stable.

The recommended approach is a dependency-ordered four-phase build: DB and BE rename foundation first (unblocks everything), FE rename second, permission system third, and chunk quality pipeline fourth (which is largely independent and can be parallelized). The rename must be executed as a single atomic Knex migration — PostgreSQL `ALTER TABLE RENAME` is instant (metadata-only) and the monorepo has no external API consumers, making a clean big-bang rename the correct strategy with no API versioning overhead. The chunk quality pipeline should insert scoring after parsing but before LLM enrichment, storing scores in OpenSearch as the single source of truth for chunk-level data.

The critical risk is the dual-ORM architecture: Knex owns all migrations but Peewee (Python worker) must have its model definitions updated in the same PR as any schema rename — mismatches are invisible at build time and only surface as runtime crashes. A second risk is rename surface area volume — 378 occurrences of "project" in FE TypeScript files alone, plus 17 `ragflow_doc_meta_` prefix occurrences in 5 Python connector files that are a known partial cleanup from the upstream RAGFlow fork. The permission system risk is authority-model collision between the existing 4-tier system RBAC and the new KB-level grants; an ADR defining the resolution rule must precede any implementation.

## Key Findings

### Recommended Stack

No new libraries are required for any v0.2 feature. `@casl/ability ^6.8.0` is already installed and architected for the 3-tier permission model with Redis caching and OpenSearch filter translation in place. scikit-learn, numpy, and tiktoken (all already in `advance-rag/pyproject.toml`) provide everything needed for heuristic chunk quality scoring. `knex.raw()` handles PostgreSQL `ALTER TABLE RENAME` safely, avoiding the known `.renameColumn()` bug that drops DEFAULT constraints on PostgreSQL. Semantic chunking should be a custom `SemanticSplitter` class extending the existing `ProcessBase` splitter pattern rather than any external library, since the project already has a complete embedding pipeline in `rag/llm/`.

**Core technologies (unchanged from v0.1):**
- Node.js 22 / Express 4.21 / TypeScript / Knex — backend API and migrations
- React 19 / Vite 7 / TanStack Query / Tailwind / shadcn/ui — frontend SPA
- Python 3.11 / FastAPI / Peewee ORM — RAG worker
- PostgreSQL 17 — schema authority via Knex migrations only
- OpenSearch 3.5.0 — vector + BM25 hybrid search, chunk storage
- Valkey 8 — task queue, sessions, CASL ability cache

**v0.2 stack decisions (all "use existing"):**
- `@casl/ability ^6.8.0`: KB-level permissions — already integrated, extend in place
- `scikit-learn / numpy / tiktoken`: Chunk quality scoring — cosine similarity, token counting, statistical thresholds; all installed
- `knex.raw()` with `ALTER TABLE RENAME`: Safe atomic DB rename — avoids `.renameColumn()` DEFAULT-dropping bug (Knex issue #933)
- Custom `SemanticSplitter` extending `ProcessBase`: Semantic chunking — avoids duplicating the embedding pipeline with an external library

**What NOT to use:**
- `semchunk` / `semantic-chunking` (PyPI) — duplicate the existing embedding pipeline
- `ragas` / `deepeval` — pipeline-level evaluation tools, not per-chunk quality gates
- `langchain` for chunking — 100+ MB dependency for 50 lines of cosine similarity math
- Knex `.renameColumn()` — drops DEFAULT constraints on PostgreSQL (confirmed bug)

### Expected Features

**Must have (table stakes):**
- Multiple chunking strategies (naive + semantic + table-aware) — expected by every RAG platform; Dify, RAGFlow, LlamaIndex all ship at least 3 methods
- Chunk size + overlap config per KB with UI exposure — standard; partially exists via `parser_config.chunk_token_num`
- Basic heuristic chunk quality indicators (token count, truncation flag, emptiness detection) — zero cost, zero LLM needed, computed at ingestion
- KB-level Read/Write/Admin permission grants — essential for multi-user platform; `project_permissions` table already exists, needs simplification
- Permission-aware retrieval — injecting KB access filter into OpenSearch at query time is a security requirement, not UX
- Entity rename with zero data loss and no broken URLs

**Should have (competitive differentiators):**
- Recursive chunking strategy — simple add, good general improvement over naive for structured docs
- Heuristic quality dashboard in FE with quality filtering in chunk list view
- Corrective RAG quality gate using stored quality scores at retrieval time

**Defer to v0.3+:**
- Parent-child (small-to-big) chunking — requires significant chunk storage architecture change; high complexity, moderate incremental benefit over semantic alone
- LLM-based chunk quality scoring — opt-in, ~$0.005-0.01 per chunk; only valuable once heuristic UI workflow proves value
- Document-level permission grants — KB-level sufficient for v0.2; enterprise complexity not yet justified
- Adaptive (density-aware) chunking — Vectara NAACL 2025 peer-reviewed study shows fixed-size with 10-20% overlap matches adaptive on real documents

### Architecture Approach

The codebase is a NX-style modular monorepo with strict module boundaries (no cross-module imports, barrel exports only). All four v0.2 features follow established patterns: BE modules in `be/src/modules/<domain>/`, FE features in `fe/src/features/<domain>/`, Python worker extensions inside `advance-rag/rag/`. Permission logic belongs inside the `knowledge-base` module (not a standalone module) to preserve the mental model that permissions are a KB sub-resource. Chunk quality scoring is a new `advance-rag/rag/quality/` module inserted into `task_executor.py` between parsing and LLM enrichment — scoring BEFORE enrichment allows skipping expensive keyword/question generation for low-quality chunks.

**Major components and their v0.2 changes:**
1. **DB Migration (Knex)** — Single atomic migration renames 8+ tables (`projects` -> `knowledge_bases`, all `project_*` -> `kb_*`); second separate migration simplifies `kb_permissions` to single `role` column (allows rollback between steps)
2. **BE knowledge-base module** — Renamed from `modules/projects/`; adds `kb-auth.middleware.ts` factory and `resolveEffectiveRole()` service method; permission models move to `shared/models/`
3. **Python quality module** — New `advance-rag/rag/quality/` with `scorer.py`, pluggable strategies (length, coherence, duplication), filters; quality scores stored as `quality_score_flt` and `quality_flags_kwd` in OpenSearch (no PostgreSQL migration needed)
4. **FE knowledge-base feature** — Renamed from `features/projects/`; adds `QualityConfig.tsx`, `QualityBadge.tsx`, permission-conditional rendering via `useKbPermission()` hook

### Critical Pitfalls

1. **Dual-ORM schema drift (CRITICAL)** — Knex migration renames tables but Peewee models in `advance-rag/db/db_models.py` still reference old names; Python worker crashes at runtime with no build-time warning. Prevention: Peewee model changes in the same PR as the Knex migration; add CI smoke test that imports all Peewee models and runs basic SELECT against each table.

2. **Incomplete rename leaves ghost references (CRITICAL)** — 378 occurrences of "project" across 14 FE TypeScript files; 6 TypeScript interfaces in `types.ts`, 217 in `projectApi.ts`, 93 in `projectQueries.ts`. Missing any one causes 404 errors, stale TanStack Query cache, or untranslated i18n. Prevention: generate full impact inventory via grep before writing any code; post-rename grep verification pass for `project_id`, `projectId`, `projects`, `/projects`.

3. **`ragflow_doc_meta_` prefix in 5 Python connector files (CRITICAL)** — 17 occurrences across `ob_conn_base.py`, `infinity_conn.py`, `infinity_conn_base.py`, `ob_conn.py`, `es_conn_base.py` still use old prefix while `doc_metadata_service.py` already uses `knowledge_doc_meta_`. Creates split metadata across two index families. Prevention: explicit cleanup subtask in Phase 1; CI check blocking any `ragflow_` in Python source.

4. **System role vs KB grant collision** — Existing 4-tier system RBAC (`super-admin/admin/leader/user`) and new KB-level `reader/writer/admin` grants conflict without a defined authority hierarchy. Prevention: write an ADR defining resolution rule (system role is ceiling, KB grant is floor; global admin implicitly has Admin on all KBs) before writing any permission code.

5. **Chunk dual-store inconsistency** — Quality scores stored in both OpenSearch and PostgreSQL will drift. Prevention: OpenSearch is the single source of truth for chunk-level data; PostgreSQL stores only asynchronously-updated aggregate stats (avg score, % flagged) at the document level; never require real-time cross-store consistency for quality data.

## Implications for Roadmap

Based on combined research, a 4-phase structure is strongly recommended, following the dependency graph confirmed by ARCHITECTURE.md direct codebase analysis.

### Phase 1: DB + BE Rename (Foundation)

**Rationale:** The rename must be first and non-negotiable. Every subsequent feature references renamed entities (`KnowledgeBase`, `kb_id`, `/api/knowledge-bases`). Building any feature on `Project` naming would require a second rename-or-shim pass. PostgreSQL DDL renames are instant so there is no performance reason to delay. The `ragflow_doc_meta_` prefix cleanup belongs here since it is also a naming consistency task.

**Delivers:** Renamed database schema (8+ tables with FK constraints preserved), renamed BE module (`modules/knowledge-base/`), updated CASL subjects, working API at `/api/knowledge-bases/*`, passing TypeScript build, zero `ragflow_` references in Python source.

**Addresses:** Entity rename (table stakes), `ragflow_doc_meta_` cleanup, foundation for permission system.

**Avoids:** Pitfall 1 (Peewee drift — same-PR Peewee updates + CI smoke test), Pitfall 3 (`ragflow_doc_meta_` — explicit subtask + CI check), Pitfall 10 (FK CASCADE — multi-step migration: rename then separate drop of old columns).

**Must include pre-work:** Full impact inventory grep before writing code; Peewee model audit checklist mapping every renamed table/column; `ragflow_doc_meta_` file list; FK constraint rename plan.

**Research flag:** None needed. PostgreSQL DDL rename is well-documented; Knex raw SQL approach is confirmed; pattern is standard.

### Phase 2: FE Rename

**Rationale:** Depends on Phase 1 (BE must expose `/api/knowledge-bases` before FE can point to it). FE rename is pure file and string changes with no logic changes — lowest risk phase. TanStack Query cache staleness from old key names must be handled with a cache version bump, not just key renames.

**Delivers:** Renamed FE feature module (`features/knowledge-base/`), updated route paths (`/data-studio/knowledge-bases`), updated i18n all 3 locales (including pluralization and interpolation variants), updated TanStack Query key factory, passing FE build.

**Addresses:** Complete entity rename at UI layer.

**Avoids:** Pitfall 2 (ghost references — post-rename grep for all variants), Pitfall 7 (TanStack Query cache staleness — cache version bump and full mutation `onSuccess` invalidation audit of all 93 occurrences in `projectQueries.ts`), Pitfall 11 (i18n pluralization variants).

**Research flag:** None needed. Standard rename patterns; established conventions in codebase.

### Phase 3: Permission System Enhancement

**Rationale:** Depends on Phase 1 (permission tables are renamed in Phase 1 migration). Can be built in parallel with Phase 2. The existing `project_permissions` table already has the right structure; the v0.2 work is simplifying 3 tab columns to a single `role` column and adding the middleware factory and retrieval filter.

**Delivers:** Single `role` column on `kb_permissions` (replacing `tab_documents/tab_chat/tab_settings`), `kb-auth.middleware.ts` factory, `resolveEffectiveRole()` service method (queries both direct user grants and team grants), permission-aware retrieval filter injected into OpenSearch queries, FE `useKbPermission()` hook with conditional rendering of edit/delete buttons.

**Addresses:** 3-tier permissions (table stakes), permission-aware retrieval (security requirement), foundation for future document-level grants.

**Avoids:** Pitfall 4 (system-role collision — ADR before implementation; two-step auth: CASL global check then KB-level role check), Pitfall 8 (module boundary violation — permission models in `shared/models/`, middleware in `shared/middleware/`, not imported across module boundaries).

**Must include pre-work:** ADR defining authority resolution rule. This is a hard prerequisite — no implementation until the ADR is written and agreed.

**Research flag:** None needed. CASL integration pattern is well-understood from direct codebase analysis. The only design decision is the authority resolution rule (ADR, not a research question).

### Phase 4: Chunk Quality Pipeline

**Rationale:** Most independent phase — touches only the Python worker and FE datasets feature, not the renamed KB module. Can begin after Phase 1 completes (uses renamed table references in parser_config). Parallelizable with Phases 2 and 3. Ship heuristic scoring only in v0.2; defer LLM-based scoring to v0.3 as opt-in.

**Delivers:** New `advance-rag/rag/quality/` module with pluggable scoring strategies (length, coherence, duplication), integration point in `task_executor.py` after `build_chunks()` before LLM enrichment, quality config in existing `parser_config` JSONB (no new Knex migration needed), quality score fields in OpenSearch chunk documents, quality score display in FE chunk list, quality threshold filter in FE chunk list, quality config UI in FE dataset settings.

**Addresses:** Table-aware chunking (highest impact per effort — already designed in `todo/02`), semantic chunking (already designed in `todo/03`), basic heuristic chunk quality indicators, recursive chunking (simple add alongside semantic).

**Avoids:** Pitfall 5 (dual-store inconsistency — OpenSearch authoritative for chunk-level data, PostgreSQL for async aggregate stats only), Pitfall 9 (throughput degradation — heuristic scoring only; LLM scoring deferred and when added must be async post-indexing, not blocking parse pipeline).

**Research flag:** Medium. Quality score thresholds (`coherence_threshold`, `dedup_threshold`, `min_tokens`) are domain-dependent. Implement with configurable defaults; plan a post-release calibration pass. The Vectara NAACL 2025 data provides benchmarks but real-world KB content will vary.

### Phase Ordering Rationale

- **Phase 1 before all others:** Every feature references renamed entities; building on old names creates a second rename obligation; PostgreSQL DDL is instant so no performance reason to delay
- **Phase 2 after Phase 1, parallel to Phases 3-4:** FE rename requires the new API routes to exist; no other dependencies
- **Phase 3 after Phase 1:** Permission tables are renamed in Phase 1 migration; the `role` column migration is a follow-on from the rename migration; can proceed immediately after Phase 1 without waiting for Phase 2
- **Phase 4 largely independent:** Python worker and FE datasets feature have minimal overlap with KB module; confirmed parallelizable with Phases 2 and 3
- **All defer items confirmed out of scope:** Parent-child chunking (significant architecture change), LLM chunk scoring (cost and workflow maturity), document-level permissions (enterprise complexity), adaptive chunking (Vectara NAACL 2025 shows fixed-size matches it on real documents)

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (Chunk Quality):** Quality score threshold calibration is empirically tuned per domain; recommend instrument-first, calibrate-after approach; specific default values need validation against real KB content after initial release

Phases with standard patterns (skip research-phase):
- **Phase 1 (DB + BE Rename):** PostgreSQL DDL rename well-documented; Knex raw SQL approach confirmed; pattern is standard; the risk is execution discipline (audit completeness), not knowledge gaps
- **Phase 2 (FE Rename):** Pure file/string rename; established patterns in the codebase; no novel technical decisions
- **Phase 3 (Permissions):** CASL already integrated; KB-level RBAC pattern confirmed via Elasticsearch and Pinecone production references; only decision is authority resolution model (ADR, not research)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All decisions grounded in direct `pyproject.toml`, `ability.service.ts`, and migration file analysis; no new libraries means no version compatibility unknowns |
| Features | HIGH | Peer-reviewed sources (Vectara NAACL 2025, PMC clinical study); competitor analysis (Dify, RAGFlow, Pinecone, Elasticsearch); existing codebase confirms what is already implemented |
| Architecture | HIGH | Based primarily on direct code inspection of actual files (`ability.service.ts`, `task_executor.py`, `splitter.py`, `initial_schema.ts`, `db_models.py`); not inferred from external sources |
| Pitfalls | HIGH | All critical pitfalls grounded in actual grep results (378 FE occurrences confirmed, 17 `ragflow_doc_meta_` occurrences confirmed, specific line numbers in `db_models.py`); not hypothetical |

**Overall confidence:** HIGH

### Gaps to Address

- **Chunk quality thresholds:** Optimal values for `min_tokens`, `coherence_threshold`, and `dedup_threshold` are domain-dependent. Implement configurable thresholds with documented defaults; plan post-release calibration pass against real KB content.
- **Authority resolution ADR:** The rule for resolving conflicts between system role and KB-level grant is a design decision, not a research finding. This must be written as an ADR before Phase 3 begins; it is the single largest ambiguity across all v0.2 features.
- **Migration safety on production data:** The Phase 1 FK rename migration is the highest-risk single operation. Architecture research recommends testing on a copy of production data before deploying; this is an operational requirement that needs to be scheduled.
- **Complete Peewee model audit:** The research identifies the risk of Peewee drift but defers the complete enumeration of which models reference project-related tables to implementation. This audit must be the first task in Phase 1 before any migration code is written.

## Sources

### Primary (HIGH confidence)
- Direct codebase: `be/src/shared/db/migrations/20260312000000_initial_schema.ts` — full FK structure and CASCADE rules confirming 8+ tables to rename
- Direct codebase: `be/src/shared/services/ability.service.ts` — CASL implementation, Redis caching, OpenSearch filter translation already in place
- Direct codebase: `be/src/shared/config/rbac.ts` — 4-tier role system with 13 permissions; existing permission model confirmed
- Direct codebase: `advance-rag/rag/svr/task_executor.py` — pipeline order: build_chunks -> enrichment -> embedding -> index; quality insertion point confirmed
- Direct codebase: `advance-rag/db/db_models.py` lines 849-917 — Peewee Knowledgebase and Document models; dual-ORM risk confirmed
- Direct codebase: `fe/src/lib/queryKeys.ts`, `fe/src/features/projects/` — 378 project occurrences across 14 files confirmed by grep
- Direct codebase: `advance-rag/` grep for `ragflow_doc_meta_` — 17 occurrences across 5 connector files confirmed
- [CASL v6 Official Docs](https://casl.js.org/v6/en/api/casl-ability/) — ability API and conditions-based permissions
- [CASL Roles with Persisted Permissions](https://casl.js.org/v6/en/cookbook/roles-with-persisted-permissions/) — DB-stored permission rules pattern
- [Knex Issue #933](https://github.com/knex/knex/issues/933) — `.renameColumn()` drops DEFAULT constraints on PostgreSQL confirmed

### Secondary (MEDIUM confidence)
- [Vectara NAACL 2025 Chunking Benchmark](https://blog.premai.io/rag-chunking-strategies-the-2026-benchmark-guide/) — peer-reviewed; fixed-size vs semantic accuracy comparison; basis for deferring adaptive chunking
- [Clinical Decision Support Chunking Study (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12649634/) — adaptive chunking 87% vs 50% baseline accuracy
- [Elasticsearch RAG + RBAC Integration](https://www.elastic.co/search-labs/blog/rag-and-rbac-integration) — permission-aware retrieval filter pattern
- [Pinecone RAG with Access Control](https://www.pinecone.io/learn/rag-access-control/) — namespace-level permission pattern; basis for KB-level permission recommendation
- [RAGFlow Permission Issue #7687](https://github.com/infiniflow/ragflow/issues/7687) — upstream owner-based access model; confirms gap in RAGFlow that B-Knowledge should address
- [Martin Fowler Parallel Change](https://martinfowler.com/bliki/ParallelChange.html) — rationale for big-bang vs expand-migrate-contract; basis for clean rename recommendation
- [Weaviate Chunking Strategies](https://weaviate.io/blog/chunking-strategies-for-rag) — strategy comparison confirming recommended implementation order
- [NVIDIA Chunking Strategy Guide](https://developer.nvidia.com/blog/finding-the-best-chunking-strategy-for-accurate-ai-responses/) — production guidance on overlap percentages

---
*Research completed: 2026-04-02*
*Ready for roadmap: yes*
