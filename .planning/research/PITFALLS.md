# Domain Pitfalls

**Domain:** Full-stack entity rename, RAG chunk quality, RBAC permissions on existing tenant system
**Project:** B-Knowledge v0.2
**Researched:** 2026-04-02
**Confidence:** HIGH (grounded in direct codebase analysis of actual tables, models, migrations, and module boundaries)

---

## Critical Pitfalls

### Pitfall 1: Dual-ORM Table Rename Requires Lockstep Peewee Model Updates

**What goes wrong:** Knex migration renames `projects` to `knowledge_bases` (and all FK columns like `project_id` to `kb_id` or `knowledge_base_id`), but the Python Peewee models in `advance-rag/db/db_models.py` still reference the old table/column names. The Python worker starts throwing `ProgrammingError: relation "projects" does not exist` or silently reads from a nonexistent column. Since the worker runs as a separate process, this failure only manifests at runtime — not at build time.

**Why it happens:** The project enforces "all DB migrations through Knex" (documented in CLAUDE.md), but Peewee models have their own `class Meta: db_table = "..."` declarations and field definitions that are completely independent of Knex. There is no automated check that Peewee model definitions match the actual DB schema. The `Knowledgebase` Peewee model (line 849 of `db_models.py`) already has `db_table = "knowledgebase"` — any rename of related tables will create the same class of bug if Peewee models are not updated in the same commit.

**Consequences:** RAG worker crashes or silently fails to process documents. Since the worker communicates via Redis pub/sub, the frontend shows "processing" indefinitely with no error. Data can also be written to wrong/stale columns if column renames are partial.

**Prevention:**
1. Create a checklist mapping every renamed table/column to its Peewee model counterpart. The current Peewee models that reference project-related data: `Knowledgebase` (db_table: knowledgebase), `Document` (db_table: document), `Task` (db_table: task), `File` (db_table: file). While these specific models may not reference `projects` directly, any new junction tables or FK columns added in v1.0 that Python reads will need updating.
2. The Knex migration and Peewee model changes MUST be in the same PR. Never merge a rename migration without the corresponding Python model update.
3. Add a CI smoke test that imports all Peewee models and runs a basic `SELECT 1 FROM <table>` against each — catches schema drift immediately.

**Detection:** Python worker logs showing `PeeweeException`, `ProgrammingError`, or `UndefinedTable`. Frontend documents stuck in "processing" status after migration.

**Phase to address:** Phase 1 (Rename) — first task, before any feature work. Create the table/column rename mapping document before writing any migration code.

---

### Pitfall 2: Incomplete Rename Leaves Ghost References in API Routes, FE URLs, and i18n Keys

**What goes wrong:** The rename touches 7+ DB tables (`projects`, `project_permissions`, `project_entity_permissions`, `project_datasets`, `project_chats`, `project_searches`, `document_categories.project_id`), a BE module (`be/src/modules/projects/`), an FE feature (`fe/src/features/projects/`), API routes (`/api/projects/*`), URL paths, query keys (`fe/src/lib/queryKeys.ts` has 5 project-related keys), route config (`fe/src/app/routeConfig.ts`), sidebar nav, and i18n strings across 3 locales. A grep for "project" in FE `.ts` files shows 378 occurrences across 14 files. Missing even one reference causes a 404, broken navigation, or untranslated string.

**Why it happens:** Renames are deceptively simple in concept but exponentially complex in a full-stack monorepo. Developers rename the obvious places (module folder, route file) but miss: query key constants, TypeScript interfaces (`Project`, `ProjectPermission`, `ProjectDataset`, `ProjectChat`, `ProjectSearch`, `ProjectEntityPermission` — 6 interfaces in `types.ts`), API client files (`projectApi.ts` with 217 occurrences, `projectQueries.ts` with 93), sidebar navigation config, and the `ragflowApi.ts` file (18 references) inside the projects feature.

**Consequences:** Broken pages, 404 errors on API calls, stale cache keys (TanStack Query caches keyed by old names persist in browser), untranslated UI strings showing raw i18n keys.

**Prevention:**
1. Before writing any code, generate a complete impact inventory using `grep -r "project" --include="*.ts" --include="*.tsx" --include="*.json"` across the entire repo. Document every file that needs changes.
2. Rename in dependency order: DB tables first (Knex migration), then BE models/types, then BE services/controllers, then BE routes, then FE types, then FE API layer, then FE components, then i18n, then route config/nav.
3. Keep the old API routes alive temporarily with redirects (Express middleware that 301s `/api/projects/*` to `/api/knowledge-bases/*`) for any external integrations or bookmarked URLs.
4. After the rename, run a final grep for the old names (`project_id`, `projectId`, `projects`, `/projects`) and verify zero hits outside of migration files and git history.

**Detection:** Post-rename, search for `project` (case-insensitive) in all source files. Any hit outside migration files, comments explaining the rename, or git history is a bug.

**Phase to address:** Phase 1 (Rename) — requires a systematic, file-by-file audit. Do NOT attempt as a "quick find-and-replace."

---

### Pitfall 3: `ragflow_doc_meta_` Prefix Lurking in 5 Python Files Will Break After Rename

**What goes wrong:** The `knowledge_` prefix for OpenSearch index names is correctly set in `rag/nlp/search.py` (`index_name()` returns `knowledge_{uid}`), but there are 17 occurrences of `ragflow_doc_meta_` across 5 Python files (`ob_conn_base.py`, `infinity_conn.py`, `infinity_conn_base.py`, `ob_conn.py`, `es_conn_base.py`). These are used for document metadata index operations. If the rename phase also touches OpenSearch index naming conventions, or if a future upstream merge reintroduces `ragflow_` prefixes, the metadata operations will silently target wrong indexes — creating "phantom" metadata that the app never reads, while the actual metadata indexes remain empty.

**Why it happens:** The `ragflow_` to `knowledge_` rename was applied to the main search index function but not to the metadata index pattern (`ragflow_doc_meta_*`). This is a known upstream artifact from RAGFlow. The CLAUDE.md warns about this but only for merge scenarios — the rename phase could trigger the same issue if developers assume "all prefixes are already `knowledge_`."

**Consequences:** Document metadata operations (doc metadata service, connector metadata) write to `ragflow_doc_meta_*` indexes while the app expects `knowledge_doc_meta_*` (as seen in `doc_metadata_service.py` line 50 which already uses `knowledge_doc_meta_{tenant_id}`). This mismatch means metadata is split across two index families.

**Prevention:**
1. As part of the rename phase, grep the entire `advance-rag/` directory for `ragflow_` and create a cleanup task for each occurrence.
2. The 17 occurrences in the 5 connector files need to be renamed to `knowledge_doc_meta_` to match `doc_metadata_service.py`.
3. Add a CI check: `grep -r "ragflow_" advance-rag/ --include="*.py" | grep -v "test_" | grep -v "ragflow_version" | grep -v "ragflow_crypto"` should return zero results.

**Detection:** OpenSearch index listing shows both `ragflow_doc_meta_*` and `knowledge_doc_meta_*` indexes — this is always a bug.

**Phase to address:** Phase 1 (Rename) — include as explicit subtask. Do not assume this is already handled.

---

### Pitfall 4: RBAC Permission Model Collision Between System Roles and KB-Level Grants

**What goes wrong:** The app already has a role-based system with 4 tiers (`super-admin`, `admin`, `leader`, `user`) and 13 permissions defined in `be/src/shared/config/rbac.ts`. The v0.2 requirement adds a second, orthogonal permission layer: KB-level grants (Read/Write/Admin) per knowledge base. The existing `project_permissions` table already has `grantee_type`, `grantee_id`, and permission columns. Adding KB-level permissions without a clear authority hierarchy creates the "two permission systems" problem: does a system `user` role with KB-level `Admin` grant override the system role's lack of `manage_knowledge_base` permission? Does a system `admin` still need explicit KB grants?

**Why it happens:** The system RBAC and resource-level RBAC serve different purposes but inevitably intersect. The system role controls "can you access the KB management area at all?" while KB-level grants control "what can you do within a specific KB?" Without an explicit resolution rule, every authorization check becomes a potential bug.

**Consequences:** Permission escalation (user with KB Admin grant bypasses system role restrictions), permission denial (admin can't access a KB because they lack an explicit grant), or inconsistent behavior (some endpoints check system role, others check KB grant, some check both with different precedence).

**Prevention:**
1. Define a clear precedence rule BEFORE writing any code. Recommended: System role is the ceiling, KB grant is the floor. A `user` with KB `Admin` gets Admin within that KB but ONLY for operations the `user` system role allows. A system `admin` implicitly has Admin on all KBs without needing explicit grants.
2. Implement authorization as a single function (`canAccessKB(user, kbId, requiredLevel)`) that resolves both layers. Never check system role and KB grant separately in controller code.
3. Document the resolution matrix in an ADR before implementation.

**Detection:** Any authorization check that calls `hasPermission()` and `kbPermissionModel.findByGrantee()` separately without a unifying function is a bug waiting to happen.

**Phase to address:** Phase 3 (Permissions) — first task is the ADR defining the resolution model. Implementation follows the ADR.

---

### Pitfall 5: Chunk Quality Scoring Creates a Synchronization Nightmare Between OpenSearch and PostgreSQL

**What goes wrong:** Chunk data lives in two places: OpenSearch (for search/retrieval) and PostgreSQL (document/task metadata). Adding quality scores to chunks means deciding where the score lives. If stored only in OpenSearch, the score is invisible to the Knex-based backend (which manages document status, progress, and metadata). If stored only in PostgreSQL, search queries can't filter/boost by quality. If stored in both, you have a consistency problem — every score update must write to two stores atomically, and there's no distributed transaction spanning OpenSearch and PostgreSQL.

**Why it happens:** The existing architecture was designed for a one-way flow: parse -> chunk -> embed -> index in OpenSearch. Quality scoring adds a feedback loop (score chunks after indexing, then potentially re-index or filter). This loop crosses the store boundary.

**Consequences:** Quality scores drift between stores. Chunks filtered by quality in OpenSearch don't match the chunk counts shown in the UI (which reads from PostgreSQL `document.chunk_num`). Re-scoring operations partially complete, leaving some chunks with scores and others without.

**Prevention:**
1. OpenSearch is the source of truth for chunk-level data (it already stores chunk content, embeddings, and metadata). Store quality scores as an additional field in the OpenSearch document.
2. PostgreSQL stores only aggregate stats (avg quality score, min score, % above threshold) at the document level — updated asynchronously after scoring completes.
3. Never require real-time consistency between the two stores for quality data. Use eventual consistency with a background sync job.
4. The Python RAG worker should compute and write scores directly to OpenSearch during the chunking pipeline — not as a separate post-processing step that could fail independently.

**Detection:** `document.chunk_num` in PostgreSQL diverges from actual chunk count in OpenSearch for the same document. Quality score filters in search return different result counts than the UI shows.

**Phase to address:** Phase 2 (Chunk Quality) — architecture decision needed before implementation.

---

## Moderate Pitfalls

### Pitfall 6: Migration Ordering When Both ORMs Touch the Same Tables

**What goes wrong:** Knex migrations run automatically on backend startup (part of the startup sequence documented in `be/CLAUDE.md`). The Python worker starts independently and expects the schema to already be correct. If the backend hasn't started (or hasn't finished migrations) when the worker starts, the worker crashes. Conversely, if a migration adds a column that the old Python model doesn't know about, the worker continues working (Peewee ignores extra columns) — but if a migration REMOVES or RENAMES a column that Peewee still references, the worker crashes.

**Prevention:**
1. The worker already has a "wait for database readiness" step in `executor_wrapper.py`. Extend this to also check for a schema version marker (e.g., a `schema_version` row in `system_configs`) that the Knex migration sets after completion.
2. For the rename phase specifically: deploy the Knex migration FIRST, then deploy the updated Python worker. Never the reverse.
3. Make rename migrations backward-compatible where possible: add new columns, copy data, update Peewee to read new columns, then drop old columns in a subsequent migration.

**Detection:** Python worker crashes on startup with schema-related errors. The `npm run dev` command starts all services concurrently — the worker may start before migrations complete.

**Phase to address:** Phase 1 (Rename) — migration strategy must account for deployment order.

---

### Pitfall 7: TanStack Query Cache Invalidation After Rename

**What goes wrong:** TanStack Query caches API responses keyed by query keys like `['projects', projectId]` (visible in `fe/src/lib/queryKeys.ts`). After renaming to `knowledge-bases`, old cached data under `['projects', ...]` keys persists in the browser. If the rename is not accompanied by a query key change, the cache serves stale data. If query keys change but invalidation is missed in mutations, the UI shows stale state after mutations.

**Prevention:**
1. Rename ALL query keys in `queryKeys.ts` atomically with the API URL changes.
2. In the FE feature rename, audit every `useMutation` in `projectQueries.ts` (93 occurrences) to ensure `onSuccess` invalidates the new query keys.
3. Consider bumping a cache version constant that TanStack Query uses as a key prefix, forcing a full cache bust on the next deployment.

**Detection:** After rename deployment, users see empty lists or stale data until they hard-refresh. Mutation callbacks don't trigger list refetches.

**Phase to address:** Phase 1 (Rename) — FE rename subtask.

---

### Pitfall 8: Module Boundary Violation When Permissions Cross Knowledge Base and Chat/Search Modules

**What goes wrong:** The NX-style module boundary rule says "no cross-module imports." But KB-level permissions (in the `knowledge-base` module after rename) need to be checked when accessing chats and searches (in the `chat` and `search` modules). The tempting approach is to import the permission model from the KB module into the chat module — violating the boundary rule.

**Prevention:**
1. Permission checking belongs in `shared/services/` (e.g., `ability.service.ts` which already exists) or `shared/middleware/`, not in any domain module.
2. Create a `shared/middleware/kb-auth.middleware.ts` that resolves KB permissions and attaches them to `req` before the controller runs. Domain modules never import permission models directly.
3. The `project_permissions` and `project_entity_permissions` models (currently in `be/src/modules/projects/models/`) should move to `shared/models/` after rename, since they are cross-cutting concerns.

**Detection:** Any import path matching `@/modules/knowledge-base/models/permission` from a file outside the `knowledge-base` module is a boundary violation.

**Phase to address:** Phase 3 (Permissions) — architecture decision. The permission models must be in `shared/` before any permission-gated endpoint is built.

---

### Pitfall 9: Chunk Quality Scoring Degrades Throughput If Done Synchronously in the Parse Pipeline

**What goes wrong:** The current parse pipeline flow is: upload -> convert (if needed) -> parse -> chunk -> embed -> index. Adding quality scoring as a synchronous step (e.g., between chunk and embed) means every document parse pays the scoring cost. If scoring involves an LLM call (for semantic quality assessment), this adds seconds per chunk — multiplied by hundreds or thousands of chunks per document, this can turn a 30-second parse into a 30-minute parse.

**Prevention:**
1. Quality scoring MUST be asynchronous and optional. Score after indexing, not before.
2. Implement a separate task type in the task executor for "quality scoring" that runs at lower priority than parse/embed tasks.
3. Provide a fast heuristic score (length, structure, keyword density) computed during chunking at near-zero cost, and a slow LLM-based score computed asynchronously post-indexing.
4. Never gate indexing on scoring completion. Chunks should be searchable immediately; quality scores arrive later and update the OpenSearch document.

**Detection:** Document parse times increase dramatically after quality scoring is added. Task executor queue backs up with scoring tasks blocking parse tasks.

**Phase to address:** Phase 2 (Chunk Quality) — architecture decision.

---

### Pitfall 10: Renaming DB Tables with Foreign Keys Requires Careful CASCADE Handling

**What goes wrong:** The `projects` table has CASCADE foreign keys from 6+ dependent tables (`project_permissions`, `project_entity_permissions`, `project_datasets`, `project_chats`, `project_searches`, `document_categories`). Additionally, `audit_logs` and `memory` tables have `project_id` columns with SET NULL references. A naive `ALTER TABLE RENAME` preserves FK constraints pointing to the old table name. Some PostgreSQL versions handle this transparently, but constraint names (which often embed the table name) become confusing and can cause issues with future migrations that reference constraints by name.

**Prevention:**
1. Use a multi-step migration: (a) create new tables with new names, (b) copy data, (c) re-create FK constraints with correct names pointing to new tables, (d) drop old tables. This is safer than `ALTER TABLE RENAME` for complex FK webs.
2. Alternatively, use `ALTER TABLE RENAME` but also rename all FK constraints and indexes explicitly. PostgreSQL `ALTER TABLE ... RENAME CONSTRAINT` handles this.
3. Test the migration on a copy of production data BEFORE deploying. The migration file will be the longest and most complex in the project — it deserves its own review.

**Detection:** `\d+ projects` in psql after migration still shows the table (rename failed silently). Constraint names reference old table names causing confusion in error messages.

**Phase to address:** Phase 1 (Rename) — the migration itself. Allocate significant time for this single migration file.

---

## Minor Pitfalls

### Pitfall 11: i18n Key Rename Misses Pluralization and Interpolation Variants

**What goes wrong:** i18n files may have keys like `project.name`, `project.delete.confirm`, `project.count_one`, `project.count_other` (for pluralization), and interpolation like `{{projectName}}`. A simple find-replace of `project` misses plural forms and interpolation variables, leaving untranslated strings.

**Prevention:** Search i18n JSON files for the regex pattern `project` (not just exact key matches). Verify all 3 locales (en, vi, ja) are updated identically.

**Phase to address:** Phase 1 (Rename) — i18n subtask.

---

### Pitfall 12: OpenSearch Index Aliases Not Updated After Rename

**What goes wrong:** If any OpenSearch aliases or index templates reference "project" naming patterns, they will stop resolving after the rename. The `knowledge_` prefix is already in use for main indexes, but any admin dashboards, Kibana saved searches, or monitoring alerts using old index patterns will break silently.

**Prevention:** Audit OpenSearch index templates and aliases before and after rename. Update any monitoring/alerting that references index patterns.

**Phase to address:** Phase 1 (Rename) — operational subtask.

---

### Pitfall 13: Permission Grants Orphaned When Knowledge Base Is Deleted

**What goes wrong:** The existing `project_permissions` table has `ON DELETE CASCADE` from `projects`, so permissions are cleaned up when a project is deleted. After rename, ensure the new `knowledge_base_permissions` (or equivalent) table maintains this CASCADE. If the migration drops and recreates instead of renames, CASCADE must be explicitly re-declared.

**Prevention:** Include CASCADE behavior in the migration test plan. After migration, delete a test KB and verify all related permission rows are gone.

**Phase to address:** Phase 1 (Rename) — migration validation.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 1: Rename | Peewee model drift from Knex schema (Pitfall 1) | Same-PR updates, CI smoke test |
| Phase 1: Rename | Incomplete rename leaving ghost references (Pitfall 2) | Impact inventory before coding, post-rename grep |
| Phase 1: Rename | `ragflow_doc_meta_` prefix still in 5 files (Pitfall 3) | Grep + CI check for `ragflow_` |
| Phase 1: Rename | FK constraint naming mess (Pitfall 10) | Multi-step migration, test on data copy |
| Phase 1: Rename | TanStack Query cache staleness (Pitfall 7) | Cache version bump, audit invalidation |
| Phase 2: Chunk Quality | Dual-store consistency (Pitfall 5) | OpenSearch as source of truth, async aggregates to PG |
| Phase 2: Chunk Quality | Throughput degradation (Pitfall 9) | Async scoring, heuristic + LLM two-tier approach |
| Phase 3: Permissions | System role vs KB grant collision (Pitfall 4) | ADR defining resolution model first |
| Phase 3: Permissions | Module boundary violation (Pitfall 8) | Permissions in shared/, middleware pattern |

## Sources

- Direct codebase analysis of `be/src/shared/db/migrations/20260312000000_initial_schema.ts` (FK structure, CASCADE rules)
- `advance-rag/db/db_models.py` lines 849-917 (Peewee Knowledgebase and Document models)
- `be/src/shared/config/rbac.ts` (existing 4-tier role system with 13 permissions)
- `be/src/modules/projects/models/` (existing permission models and table names)
- `fe/src/features/projects/` and `fe/src/lib/queryKeys.ts` (378 FE occurrences of "project")
- Grep results: 17 occurrences of `ragflow_doc_meta_` across 5 Python connector files
- `be/CLAUDE.md` and `advance-rag/CLAUDE.md` (documented conventions and gotchas)
