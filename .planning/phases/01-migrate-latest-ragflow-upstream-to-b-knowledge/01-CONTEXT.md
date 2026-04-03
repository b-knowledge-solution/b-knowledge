# Phase 1: Migrate latest RAGFlow upstream to b-knowledge - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Merge 49 upstream RAGFlow commits (c732a1c → df2cc32f5, nightly-4-gdf2cc32f5) from the local `ragflow/` folder into b-knowledge's `advance-rag/` service using selective copy (Option A). Preserve all b-knowledge integration files. Port all new features and improvements — including implementing relevant concepts in b-knowledge's TypeScript backend services. Create comprehensive patch documentation.

</domain>

<decisions>
## Implementation Decisions

### Merge Strategy
- **D-01:** Use **hybrid approach** for ~10-15 b-knowledge-modified RAGFlow files: commit current state, copy upstream files, use `git diff` to review changes, then manually restore b-knowledge-specific modifications (db.services imports, tenant model resolution, opensearch_conn.py).
- **D-02:** Pure RAGFlow directories (deepdoc/, rag/llm/, rag/nlp/, rag/prompts/, rag/utils/ except opensearch_conn.py, rag/flow/, common/) are safe to overwrite directly.
- **D-03:** Protected files (db/, memory/, config.py, executor_wrapper.py, system_tenant.py, api/, pyproject.toml) must NEVER be overwritten — they are b-knowledge integration layer.

### Feature Porting Scope
- **D-04:** Port **ALL** new upstream features including:
  - EPUB parser (new file format support)
  - Perplexity + MiniMax LLM providers (comes with rag/llm/ copy)
  - PDF garbled text OCR fallback (comes with deepdoc/ copy)
  - Deadlock retry in task_executor (stability fix)
  - Aggregated parsing status API
  - Chunk image support (image_base64 in add_chunk)
  - Docling server support (DOCLING_SERVER_URL env var)
  - Cross-KB collision guard
  - Similarity threshold bypass for explicit doc_ids
- **D-05:** No features deferred — everything gets ported in this phase.

### DB Migration Approach
- **D-06:** Create **Knex migrations** for both new upstream columns:
  - `user_canvas_version.release` (BooleanField, default false, indexed)
  - `api_4_conversation.version_title` (CharField, max 255, nullable)
- **D-07:** Knex migrations maintain schema consistency and prevent conflicts with Peewee auto-migration.

### TypeScript Feature Improvements
- **D-08:** Port **ALL** ragflow improvements to b-knowledge's TypeScript services:
  - **Datasets:** Aggregated parsing status method for dataset dashboard, metadata query optimization (scope to page-level doc IDs), delete-all support for documents
  - **Search:** Similarity threshold bypass when explicit doc_ids provided
  - **Chat:** Empty doc filter fix in retrieval, delete-all session support
  - **Agent:** Canvas version `release` flag support, `version_title` in conversation sessions
  - **Memory:** Record user_id in memory messages
- **D-09:** These are concept ports (rewrite in TypeScript), NOT file copies from ragflow.

### Validation Criteria
- **D-10:** Run `npm run build` (TypeScript compilation) + `npm test` (all workspaces) + pytest (advance-rag tests) to catch regressions.
- **D-11:** Build + test suite pass is the acceptance gate. No manual pipeline testing required.

### Patch Documentation
- **D-12:** MANDATORY: Create new patch note at `patches/ragflow-port-v<VERSION>-df2cc32.md` following the format of existing `patches/ragflow-port-v0.24.0-c732a1c.md`. Must document:
  - New upstream commit hash and version
  - Source copy map (updated for any new directories/files)
  - New features ported (EPUB, chunk images, Docling, LLM providers, etc.)
  - DB schema changes (2 new columns)
  - Dependency changes (pypdf bump)
  - b-knowledge TypeScript improvements ported
  - Updated known limitations

### Claude's Discretion
- Exact order of operations within each tier
- How to structure the Knex migration file(s) (single or split)
- Whether to update advance-rag/pyproject.toml deps in one commit or alongside related feature commits

### Folded Todos
- **"Merge latest RAGFlow upstream to b-knowledge"** (todo from 2026-03-23, area: rag) — this todo IS the phase. Contains the original 7-phase plan that was refined into this context.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Upstream Documentation
- `patches/ragflow-port-v0.24.0-c732a1c.md` — Current patch note documenting the v0.24.0 port. Follow this format for the new patch note. Contains upgrade workflow, source copy map, protected files list, architecture differences.

### Codebase Maps
- `.planning/codebase/INTEGRATIONS.md` — Service dependencies, API integrations, agent tools
- `.planning/codebase/STRUCTURE.md` — Directory layout, module structure

### Protected Files Reference
- `advance-rag/db/` — All 16+ custom service files (b-knowledge integration layer)
- `advance-rag/memory/` — B-knowledge memory extraction feature
- `advance-rag/config.py` — B-knowledge environment config
- `advance-rag/executor_wrapper.py` — Redis pub/sub progress hook
- `advance-rag/system_tenant.py` — System tenant verification
- `advance-rag/pyproject.toml` — Custom dependencies (update manually)

### Upstream Source
- `ragflow/` (local folder) — Current HEAD: df2cc32f5 (nightly-4-gdf2cc32f5)
- Base commit: c732a1c8e03aef804ce00c9c8fa5e4b39393e3eb

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `be/src/modules/rag/services/rag.service.ts` — Dataset CRUD service, will need aggregated parsing status method
- `be/src/modules/rag/services/rag-search.service.ts` — Search service, needs similarity threshold bypass
- `be/src/modules/chat/services/chat-conversation.service.ts` — Chat pipeline, needs empty doc filter fix
- `be/src/modules/agents/` — Agent canvas module, needs release flag support
- `be/src/modules/memory/services/memory.service.ts` — Memory service, needs user_id tracking

### Established Patterns
- **Dual-write pattern:** Node.js creates in PostgreSQL, proxies to advance-rag for RAG pipeline
- **Knex migrations:** All DB schema changes through Knex, never Peewee migrators
- **Module boundaries:** No cross-module imports, barrel exports via index.ts
- **RAG service layer:** `be/src/modules/rag/` proxies to advance-rag FastAPI endpoints

### Integration Points
- `advance-rag/rag/app/naive.py` — Parser registration (needs EPUB added)
- `advance-rag/deepdoc/parser/` — Document parsers (new epub_parser.py)
- `advance-rag/rag/llm/chat_model.py` — LLM provider registry (Perplexity, MiniMax)
- `advance-rag/rag/svr/task_executor.py` — Task execution (deadlock retry)
- `advance-rag/db/db_models.py` — Peewee schema (2 new columns, but Knex manages migrations)

</code_context>

<specifics>
## Specific Ideas

- Follow the upgrade workflow documented in `patches/ragflow-port-v0.24.0-c732a1c.md` section "Upgrade Workflow (Future RAGFlow Versions)"
- The Infinity connector refactors (~1,585 lines changed) are irrelevant since b-knowledge uses OpenSearch — these come along with the copy but don't need attention
- No enum changes in `api/db/__init__.py` since c732a1c — import shim does not need updating
- No new service files in `api/db/services/` — no new FastAPI endpoints needed

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)
None — the only matching todo was folded into this phase.

</deferred>

---

*Phase: 01-migrate-latest-ragflow-upstream-to-b-knowledge*
*Context gathered: 2026-03-23*
