# Phase 7: DB + BE + Python Rename - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Rename all backend-layer references from "Project" to "Knowledge Base" — database schema (tables, FK columns, indexes, constraints), backend Express module (directory, files, models, services, controllers, routes, schemas), API route paths, ModelFactory references, and Python worker `ragflow_doc_meta_` prefix. Frontend rename is Phase 8.

</domain>

<decisions>
## Implementation Decisions

### Naming Conventions
- **D-01:** Main DB table: `projects` → `knowledge_base` (singular, matching RAGFlow convention)
- **D-02:** FK columns: `project_id` → `knowledge_base_id` (full, explicit)
- **D-03:** BE module directory: `be/src/modules/projects/` → `be/src/modules/knowledge-base/` (singular, kebab-case)
- **D-04:** API routes: `/api/projects` → `/api/knowledge-base` (singular)
- **D-05:** ModelFactory: `ModelFactory.project` → `ModelFactory.knowledgeBase`
- **D-06:** TS types: `Project` → `KnowledgeBase`, `CreateProjectDto` → `CreateKnowledgeBaseDto`, etc.

### Migration Strategy
- **D-07:** Single atomic Knex migration for all table and column renames. No staged approach — all tables rename in one transaction.
- **D-08:** Use `knex.raw('ALTER TABLE ... RENAME TO ...')` for all renames. Do NOT use Knex `.renameColumn()` due to known bug (#933) that drops DEFAULT constraints on PostgreSQL.
- **D-09:** PostgreSQL `ALTER TABLE RENAME` is instant (metadata-only, no data copy). Safe for production.

### ragflow_ Prefix Cleanup
- **D-10:** `ragflow_doc_meta_` → `knowledge_doc_meta_` in all 5 Python files. Consistent with existing `knowledge_` prefix used for OpenSearch indexes.
- **D-11:** Files to update: `common/doc_store/es_conn_base.py`, `common/doc_store/ob_conn_base.py`, `common/doc_store/infinity_conn_base.py`, `rag/utils/ob_conn.py`, `rag/utils/infinity_conn.py`

### Related Entity Scope — Full Rename Map
- **D-12:** ALL `project_*` tables rename to `knowledge_base_*`:

| Current Table | New Table |
|---|---|
| `projects` | `knowledge_base` |
| `project_datasets` | `knowledge_base_datasets` |
| `project_permissions` | `knowledge_base_permissions` |
| `project_entity_permissions` | `knowledge_base_entity_permissions` |
| `project_chats` | `knowledge_base_chats` |
| `project_searches` | `knowledge_base_searches` |
| `project_sync_configs` | `knowledge_base_sync_configs` |

- **D-13:** `document_categories`, `document_category_versions`, `document_category_version_files` are UNCHANGED (already generic, not project-prefixed).
- **D-14:** All `project_id` FK columns across all tables → `knowledge_base_id`.

### Claude's Discretion
- Index and constraint naming in the migration (auto-generated vs explicit)
- Order of operations within the atomic migration
- How to handle ModelFactory registration (rename vs re-register)
- Test strategy for completeness verification (grep-based vs build-based)
- Whether to update barrel exports in shared/models/ or just the module barrel

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Database Schema
- `be/src/shared/db/migrations/20260312000000_initial_schema.ts` — Defines all project-related tables, FK constraints, indexes. Source of truth for column names and defaults.

### Backend Module (source of rename)
- `be/src/modules/projects/index.ts` — Barrel export for the module
- `be/src/modules/projects/models/project.model.ts` — Main model, ModelFactory registration
- `be/src/modules/projects/models/project-permission.model.ts` — Permission model
- `be/src/modules/projects/models/project-entity-permission.model.ts` — Entity permission model
- `be/src/modules/projects/models/project-dataset.model.ts` — Dataset link model
- `be/src/modules/projects/models/project-chat.model.ts` — Chat link model
- `be/src/modules/projects/models/project-search.model.ts` — Search link model
- `be/src/modules/projects/models/project-sync-config.model.ts` — Git sync config model
- `be/src/modules/projects/models/document-category.model.ts` — Category model (NOT renamed)
- `be/src/modules/projects/models/document-category-version.model.ts` — Version model (NOT renamed)
- `be/src/modules/projects/models/document-category-version-file.model.ts` — Version file model (NOT renamed)
- `be/src/modules/projects/services/projects.service.ts` — Core CRUD service
- `be/src/modules/projects/services/project-category.service.ts` — Category service
- `be/src/modules/projects/services/project-chat.service.ts` — Chat link service
- `be/src/modules/projects/services/project-search.service.ts` — Search link service
- `be/src/modules/projects/services/project-sync.service.ts` — Sync service
- `be/src/modules/projects/controllers/projects.controller.ts` — Controller
- `be/src/modules/projects/routes/projects.routes.ts` — Route definitions
- `be/src/modules/projects/schemas/projects.schemas.ts` — Zod validation schemas

### Shared Types
- `be/src/shared/models/types.ts` — References project table names, may need update
- `be/src/app/routes.ts` — Central route registration, imports projects module

### Python Files (ragflow_ prefix)
- `advance-rag/common/doc_store/es_conn_base.py` — ragflow_doc_meta_ reference
- `advance-rag/common/doc_store/ob_conn_base.py` — ragflow_doc_meta_ reference
- `advance-rag/common/doc_store/infinity_conn_base.py` — ragflow_doc_meta_ reference
- `advance-rag/rag/utils/ob_conn.py` — ragflow_doc_meta_ reference
- `advance-rag/rag/utils/infinity_conn.py` — ragflow_doc_meta_ reference

### Architecture & Conventions
- `be/CLAUDE.md` — Backend module layout rules, naming conventions
- `CLAUDE.md` — Root project conventions, NX module boundary rules, migration naming format

### Research
- `.planning/research/PITFALLS.md` — 13 pitfalls for rename, especially dual-ORM and FK cascade risks
- `.planning/research/STACK.md` — Confirms zero new deps, knex.raw() recommendation
- `.planning/research/ARCHITECTURE.md` — Integration architecture, build order

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **ModelFactory pattern**: All models register via `ModelFactory.register('project', ...)` — rename registration key
- **CASL ability service**: `be/src/shared/services/ability.service.ts` references 'Project' subject — needs update
- **Route registration**: `be/src/app/routes.ts` centrally imports all module routes — single point to update

### Established Patterns
- **Module layout**: Sub-directory layout (controllers/, models/, routes/, schemas/, services/) for modules with 5+ files
- **Migration naming**: `YYYYMMDDhhmmss_<name>.ts` format
- **Knex raw SQL**: Already used in the codebase for complex operations
- **Barrel exports**: Every module has `index.ts` as public API

### Integration Points
- **Route registration**: `be/src/app/routes.ts` — update import path and route prefix
- **ModelFactory**: `be/src/shared/models/` — update type references
- **CASL subjects**: `be/src/shared/services/ability.service.ts` — update 'Project' → 'KnowledgeBase'
- **Shared types**: `be/src/shared/models/types.ts` — update table name references
- **Python doc_store connectors**: 5 files with `ragflow_doc_meta_` prefix

</code_context>

<specifics>
## Specific Ideas

- Table name is SINGULAR: `knowledge_base` (not `knowledge_bases`) — matching RAGFlow's convention
- Full prefix `knowledge_base_*` for all related tables (not abbreviated `kb_*`)
- `document_categories` family stays unchanged — already generic
- Single atomic migration — no staged approach
- `knex.raw()` for all ALTER TABLE operations — avoid Knex renameColumn bug

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
- **Merge latest RAGFlow upstream to b-knowledge** — Already completed in v1.0 Phase 1. Not relevant to rename.

None other — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-db-be-python-rename*
*Context gathered: 2026-04-02*
