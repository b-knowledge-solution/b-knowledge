# Architecture Patterns

**Domain:** Knowledge Base Management Platform -- v0.2 features (rename refactor, chunk quality, RBAC permissions)
**Researched:** 2026-04-02
**Confidence:** HIGH (based on direct codebase analysis of all four workspaces)

---

## Current Architecture Summary

The codebase is an NX-style modular monorepo with four workspaces:

| Component | Module Pattern | Data Layer |
|-----------|---------------|------------|
| BE (Express) | `be/src/modules/<domain>/` with barrel exports | Knex ORM + PostgreSQL, CASL abilities, Redis sessions |
| FE (React) | `fe/src/features/<domain>/` with API split | TanStack Query, `<domain>Api.ts` + `<domain>Queries.ts` |
| RAG Worker (Python) | `advance-rag/rag/svr/task_executor.py` | Peewee ORM (same PostgreSQL), OpenSearch, Redis queues |
| Converter (Python) | `converter/` | Redis polling |

**Key constraints:**
- All DB migrations through Knex only (even for Peewee-managed tables)
- No cross-module imports; barrel exports only
- CASL ability service caches in Valkey keyed by session ID
- OpenSearch index prefix must be `knowledge_` (not `ragflow_`)
- Python worker reads tasks from Redis Streams, processes chunks, indexes to OpenSearch

---

## Feature 1: Project-to-Knowledge-Base Rename

### Component Boundaries

| Component | What Changes | Impact |
|-----------|-------------|--------|
| DB Migration (Knex) | Rename tables: `projects` -> `knowledge_bases`, `project_*` -> `kb_*` | HIGH - foundational |
| BE Module | Rename `modules/projects/` -> `modules/knowledge-base/` | HIGH - all files |
| BE Routes | `/api/projects` -> `/api/knowledge-bases` | HIGH - breaking API change |
| BE CASL | Subject `'Project'` -> `'KnowledgeBase'` in ability.service.ts | MEDIUM |
| BE Shared Types | `Project` -> `KnowledgeBase` interface in types.ts | MEDIUM |
| FE Feature | `features/projects/` -> `features/knowledge-base/` | HIGH - all files |
| FE Routes | `/data-studio/projects` -> `/data-studio/knowledge-bases` | MEDIUM |
| FE API Layer | `projectApi.ts` -> `knowledgeBaseApi.ts`, `projectQueries.ts` -> `knowledgeBaseQueries.ts` | HIGH |
| FE i18n | `projectManagement.*` keys -> `knowledgeBase.*` in all 3 locales | MEDIUM |
| Python Worker | No change needed (worker references `kb_id` on the RAG `knowledgebase` table, not `project_id`) | NONE |

### Data Flow (Rename)

```
Migration renames tables + columns
  -> BE models reference new table names
    -> BE services use new model names
      -> BE routes mount at /api/knowledge-bases
        -> FE Api.ts calls new endpoints
          -> FE Queries.ts wraps new Api
            -> FE components use new query hooks
```

### DB Migration Strategy

**Use a single Knex migration with `ALTER TABLE ... RENAME`:**

```sql
-- Rename core table
ALTER TABLE projects RENAME TO knowledge_bases;

-- Rename FK columns in child tables
ALTER TABLE project_permissions RENAME TO kb_permissions;
ALTER TABLE project_permissions RENAME COLUMN project_id TO kb_id;

ALTER TABLE project_entity_permissions RENAME TO kb_entity_permissions;
ALTER TABLE project_entity_permissions RENAME COLUMN project_id TO kb_id;

ALTER TABLE document_categories RENAME COLUMN project_id TO kb_id;

ALTER TABLE project_chats RENAME TO kb_chats;
ALTER TABLE project_chats RENAME COLUMN project_id TO kb_id;

ALTER TABLE project_searches RENAME TO kb_searches;
ALTER TABLE project_searches RENAME COLUMN project_id TO kb_id;

ALTER TABLE project_datasets RENAME TO kb_datasets;
ALTER TABLE project_datasets RENAME COLUMN project_id TO kb_id;

ALTER TABLE project_sync_configs RENAME TO kb_sync_configs;
ALTER TABLE project_sync_configs RENAME COLUMN project_id TO kb_id;
```

**Why RENAME not DROP/CREATE:** PostgreSQL `ALTER TABLE RENAME` is metadata-only (instant, no data copy). Foreign key constraints, indexes, and sequences are preserved. The migration is reversible with the inverse renames.

**What about the Peewee side?** The Python worker's `db_models.py` references tables like `knowledgebase` (the RAG dataset table), NOT `projects`. The `projects` table is exclusively managed by the Node.js backend. No Peewee model changes needed for this rename.

### API Versioning Decision

**Recommendation: No API versioning. Clean break.**

Rationale:
- This is an internal app, not a public API (no external consumers besides the SPA)
- The FE and BE deploy together (monorepo)
- External API routes (`/api/v1/external/*`) use the chat/search endpoints, not project endpoints
- OpenAI-compatible endpoints (`/api/v1/chat/*`, `/api/v1/search/*`) are unaffected
- Adding backwards-compatible aliases (redirects from old to new) creates permanent tech debt

### FE Route Migration

```
OLD                                    NEW
/data-studio/projects                  /data-studio/knowledge-bases
/data-studio/projects/:id              /data-studio/knowledge-bases/:id
```

Update in: `App.tsx` (route definitions), `routeConfig.ts` (metadata), `Sidebar.tsx` (nav), all i18n files.

---

## Feature 2: Chunk Quality Enhancement

### Where in the Pipeline (CRITICAL DECISION)

The existing RAG pipeline in `task_executor.py` flows like this:

```
1. build_chunks()    - Parse document -> raw chunks
2. [keyword_extraction, question_proposal, content_tagging]  - LLM enrichment (optional)
3. build_TOC()       - Generate table of contents (optional)
4. embedding()       - Generate vector embeddings
5. OpenSearch index   - Store chunks with embeddings
```

**Recommendation: Insert chunk quality scoring AFTER step 1, BEFORE step 2.**

Rationale:
- Quality scoring needs the raw chunk text (available after parsing)
- Scoring BEFORE LLM enrichment lets us skip expensive keyword/question generation for low-quality chunks
- Scoring BEFORE embedding lets us skip embedding for filtered-out chunks (cost savings)
- Chunks that fail quality threshold can be marked `available_int=0` (hidden) rather than deleted, preserving data for review

### Architecture: New Quality Pipeline Stage

```
advance-rag/rag/
  quality/                    # NEW directory
    __init__.py
    scorer.py                 # ChunkQualityScorer with pluggable strategies
    strategies/
      __init__.py
      length_strategy.py      # Min/max token count
      coherence_strategy.py   # Text coherence heuristics
      duplication_strategy.py # Near-duplicate detection (MinHash/SimHash)
      llm_strategy.py         # Optional LLM-based quality judgment
    filters.py                # Threshold-based filtering logic
    config.py                 # Quality config schema
```

### Integration Point in task_executor.py

```python
# In build_chunks(), after chunking but before return:
from rag.quality.scorer import score_chunks
from rag.quality.filters import apply_quality_filter

# Score all chunks
chunks_with_scores = score_chunks(cks, task["parser_config"].get("quality_config", {}))

# Filter: mark low-quality chunks as hidden (available_int=0)
filtered_chunks = apply_quality_filter(chunks_with_scores, task["parser_config"].get("quality_threshold", 0.0))
```

### Chunk Quality Data Model

Add fields to the OpenSearch chunk document (not PostgreSQL -- chunks live in OpenSearch):

| Field | Type | Purpose |
|-------|------|---------|
| `quality_score_flt` | float | Composite quality score 0.0-1.0 |
| `quality_flags_kwd` | keyword[] | Quality issue tags: `too_short`, `duplicate`, `incoherent` |
| `quality_strategy_kwd` | keyword | Which strategy scored this chunk |

**No DB migration needed** -- OpenSearch is schemaless for new fields. Just add the fields to chunk dicts before indexing.

### BE Integration (Quality Config)

The `parser_config` JSONB column on `knowledgebase` (RAG dataset) table already stores chunking configuration. Extend it:

```typescript
// In the parser_config JSON:
{
  "chunk_token_num": 128,
  "quality_config": {
    "enabled": true,
    "min_tokens": 10,
    "max_tokens": 2000,
    "coherence_threshold": 0.3,
    "dedup_threshold": 0.85,
    "strategies": ["length", "coherence", "duplication"]
  },
  "quality_threshold": 0.5
}
```

No new tables. No new Knex migration for quality config (it's embedded in existing JSONB).

### FE Integration

Add quality config UI to the dataset settings page (`fe/src/features/datasets/`):
- Quality toggle + threshold slider in dataset parser config form
- Quality score column in chunk list view
- Quality filter in chunk list (show all / high quality only / low quality only)

---

## Feature 3: Permission System (3-Tier RBAC)

### Current State Analysis

The existing permission system has TWO layers already:

1. **Global RBAC** (`shared/config/rbac.ts`): Role-based (super-admin/admin/leader/user) with CASL abilities cached in Valkey
2. **Project-level permissions** (`project_permissions` table): Tab-level grants (tab_documents, tab_chat, tab_settings) with grantee_type (user/team)
3. **Entity-level permissions** (`project_entity_permissions` table): Fine-grained on individual categories/chats/searches

The existing tables already implement a permission model. The v0.2 goal is to refine this into a clean 3-tier system (Read/Write/Admin).

### Recommended Architecture: Evolve Existing Tables, Don't Replace

**Do NOT create a new `permissions` module.** The permission logic belongs in the `knowledge-base` module (renamed from `projects`). Here's why:
- Permissions are scoped to KBs -- they are a KB sub-resource
- The existing routes already handle permissions as sub-routes of projects (`/:id/permissions`)
- Creating a separate module would violate the "permissions are a property of the KB" mental model

### Permission Tier Mapping

Transform the existing tab-level permissions into a simpler 3-tier model:

| Tier | Old (tab_documents/tab_chat/tab_settings) | New (single `role` column) |
|------|-------------------------------------------|---------------------------|
| Read | tab_documents='view', tab_chat='view', tab_settings='none' | `role = 'reader'` |
| Write | tab_documents='manage', tab_chat='manage', tab_settings='none' | `role = 'writer'` |
| Admin | tab_documents='manage', tab_chat='manage', tab_settings='manage' | `role = 'admin'` |

### DB Migration Strategy

```sql
-- Add new role column with default
ALTER TABLE kb_permissions ADD COLUMN role TEXT NOT NULL DEFAULT 'reader';

-- Migrate existing data: map tab_settings='manage' -> admin, tab_documents='manage' -> writer, else reader
UPDATE kb_permissions SET role = CASE
  WHEN tab_settings = 'manage' THEN 'admin'
  WHEN tab_documents = 'manage' THEN 'writer'
  ELSE 'reader'
END;

-- Drop old tab columns (in a follow-up migration after verification)
-- ALTER TABLE kb_permissions DROP COLUMN tab_documents, DROP COLUMN tab_chat, DROP COLUMN tab_settings;
```

**Important:** Do the column drop in a SEPARATE migration (not the same one as the rename migration). This allows rollback if the new permission model has issues.

### KB-to-Resource Permission Inheritance

```
KnowledgeBase (kb_permissions.role)
  |
  +-- inherits to --> Categories (document_categories)
  |                     |
  |                     +-- inherits to --> Versions (document_category_versions)
  |                     |                     |
  |                     |                     +-- inherits to --> Documents
  |                     |
  |                     +-- (code/standard categories inherit same)
  |
  +-- inherits to --> Chats (kb_chats)
  |
  +-- inherits to --> Searches (kb_searches)
  |
  +-- OVERRIDES via --> kb_entity_permissions (per-entity overrides)
```

**Inheritance rule:** A user's effective permission on a resource is `MAX(kb_permission.role, entity_permission.role)`. Entity permissions can ONLY escalate (grant more access), never restrict below the KB-level grant.

### Authorization Middleware Pattern

Create a new middleware factory in the knowledge-base module (not in shared/middleware):

```typescript
// be/src/modules/knowledge-base/middleware/kb-auth.middleware.ts

/**
 * @description Middleware that checks KB-level permission for the current user.
 * Loads KB permission from DB, checks entity override, resolves effective role.
 * Attaches resolved permission to req for downstream use.
 */
export function requireKbRole(minimumRole: 'reader' | 'writer' | 'admin') {
  return async (req, res, next) => {
    const kbId = req.params.id
    const userId = req.user.id
    
    // 1. Check if user is KB creator (implicit admin)
    // 2. Check kb_permissions table for explicit grant
    // 3. Check team memberships for inherited grants
    // 4. Resolve effective role (max of all grants)
    // 5. Compare against minimumRole
  }
}
```

**Integration with existing CASL:** The global CASL ability check (`requireAbility('read', 'Project')`) stays as-is but becomes `requireAbility('read', 'KnowledgeBase')`. The KB-level role check is a SECOND middleware that runs after CASL:

```typescript
// Route example:
router.put('/:id/categories/:catId',
  requireAuth,
  requireTenant,
  requireAbility('read', 'KnowledgeBase'),  // Global: can user access KBs at all?
  requireKbRole('writer'),                   // KB-level: does user have write on THIS KB?
  validate(...),
  controller.updateCategory
)
```

### Service Layer Changes

The `projects.service.ts` (renamed to `knowledge-base.service.ts`) needs:

```typescript
// New methods:
resolveEffectiveRole(kbId: string, userId: string): Promise<'reader' | 'writer' | 'admin' | null>
resolveEffectiveRoleWithTeams(kbId: string, userId: string, teamIds: string[]): Promise<...>
listAccessibleKbs(userId: string, teamIds: string[]): Promise<KnowledgeBase[]>
```

The `resolveEffectiveRole` method queries `kb_permissions` for direct user grants AND team grants (via `user_teams` table), then takes the maximum.

### FE Permission Integration

Add permission context to the KB detail page:

```typescript
// In features/knowledge-base/api/knowledgeBaseQueries.ts
export function useKbPermission(kbId: string) {
  return useQuery({
    queryKey: queryKeys.knowledgeBases.permission(kbId),
    queryFn: () => knowledgeBaseApi.getMyPermission(kbId),
  })
}
```

Components conditionally render edit/delete buttons based on the resolved permission tier.

---

## New vs Modified Components

### New Files (Created)

| Location | File/Directory | Purpose |
|----------|---------------|---------|
| BE | `modules/knowledge-base/` | Renamed from `modules/projects/` (all files renamed) |
| BE | `modules/knowledge-base/middleware/kb-auth.middleware.ts` | KB-level role authorization |
| BE | `shared/db/migrations/2026XXXX_rename_projects_to_knowledge_bases.ts` | Table/column renames |
| BE | `shared/db/migrations/2026XXXX_simplify_kb_permissions.ts` | 3-tier role column |
| Python | `advance-rag/rag/quality/__init__.py` | Quality scoring module |
| Python | `advance-rag/rag/quality/scorer.py` | Pluggable quality scorer |
| Python | `advance-rag/rag/quality/strategies/*.py` | Individual scoring strategies |
| Python | `advance-rag/rag/quality/filters.py` | Threshold filtering |
| Python | `advance-rag/rag/quality/config.py` | Quality config schema |
| FE | `features/knowledge-base/` | Renamed from `features/projects/` (all files renamed) |
| FE | `features/datasets/components/QualityConfig.tsx` | Quality settings UI |
| FE | `features/datasets/components/QualityBadge.tsx` | Chunk quality indicator |

### Modified Files (Key Changes)

| File | Change |
|------|--------|
| `be/src/app/routes.ts` | Mount `/api/knowledge-bases` instead of `/api/projects` |
| `be/src/shared/services/ability.service.ts` | Subject `'Project'` -> `'KnowledgeBase'` in CASL Subjects type and buildAbilityFor |
| `be/src/shared/config/rbac.ts` | Permission `manage_knowledge_base` (already exists, no change) |
| `be/src/shared/models/types.ts` | `Project` -> `KnowledgeBase` interface, `ProjectPermission` -> `KbPermission` |
| `be/src/shared/models/factory.ts` | Register new model names in ModelFactory singleton |
| `advance-rag/rag/svr/task_executor.py` | Insert quality scoring call in `build_chunks()` after parsing, before enrichment |
| `fe/src/app/App.tsx` | Route paths `/data-studio/knowledge-bases` |
| `fe/src/app/routeConfig.ts` | Route metadata for knowledge-base paths |
| `fe/src/layouts/Sidebar.tsx` | Nav item label + path |
| `fe/src/lib/queryKeys.ts` | `knowledgeBases` key factory (replaces `projects`) |
| `fe/src/i18n/en.json` | All `projectManagement.*` -> `knowledgeBase.*` |
| `fe/src/i18n/vi.json` | Same |
| `fe/src/i18n/ja.json` | Same |

---

## Suggested Build Order (Dependency-Aware)

### Phase 1: DB Migration + BE Rename (Foundation)

**Must be first.** Everything else depends on the new names being in place.

1. Create Knex migration: rename `projects` -> `knowledge_bases` and all child tables/columns
2. Rename `be/src/modules/projects/` -> `be/src/modules/knowledge-base/`
3. Update all model classes, services, controllers, routes, schemas
4. Update `app/routes.ts` mount point
5. Update CASL subjects in `ability.service.ts`
6. Update `shared/models/types.ts` interfaces
7. Run `npm run build` to verify zero TypeScript errors

**Why first:** The FE cannot be renamed until the API endpoints exist. The permission changes target the renamed tables.

### Phase 2: FE Rename (Depends on Phase 1)

1. Rename `fe/src/features/projects/` -> `fe/src/features/knowledge-base/`
2. Update all Api, Queries, types, components, pages
3. Update route definitions in `App.tsx`
4. Update `routeConfig.ts` metadata
5. Update `Sidebar.tsx` navigation
6. Update all 3 i18n locale files
7. Update `queryKeys.ts`
8. Run `npm run build` to verify

### Phase 3: Permission System Enhancement (Depends on Phase 1)

1. Create Knex migration: add `role` column to `kb_permissions`, migrate existing data
2. Create `kb-auth.middleware.ts` in the knowledge-base module
3. Update `knowledge-base.service.ts` with `resolveEffectiveRole` methods
4. Wire middleware into knowledge-base routes (two-step auth: CASL then KB role)
5. Add FE permission query hook + conditional rendering
6. Follow-up migration: drop old `tab_*` columns (after validation)

### Phase 4: Chunk Quality Pipeline (Independent after Phase 1)

**Can run in parallel with Phases 2-3.** Touches Python worker code and FE dataset UI but not the renamed KB module.

1. Create `advance-rag/rag/quality/` module with scorer + strategies
2. Integrate into `task_executor.py` build_chunks flow
3. Add quality config fields to parser_config JSONB (document in BE, no migration needed)
4. Add quality score display in FE dataset chunks view
5. Add quality config UI in FE dataset settings

### Dependency Graph

```
Phase 1 (DB + BE Rename)
  |
  +---> Phase 2 (FE Rename)
  |
  +---> Phase 3 (Permissions)
  |
  +---> Phase 4 (Chunk Quality) -- parallel, least dependencies
```

**Phase ordering rationale:**
- Phase 1 is the foundation -- every other phase references renamed entities
- Phase 2 is a pure FE rename with no logic changes, lowest risk
- Phase 3 builds on the renamed permission tables from Phase 1
- Phase 4 is the most independent -- touches only Python worker + dataset FE, no KB module overlap

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Symlink/Alias Migration
**What:** Creating `/api/projects` -> `/api/knowledge-bases` redirect aliases for "backwards compatibility."
**Why bad:** Internal SPA has no external consumers. Aliases become permanent tech debt that nobody removes.
**Instead:** Clean break. Rename everywhere in one phase. Deploy FE + BE together.

### Anti-Pattern 2: Separate Permissions Module
**What:** Creating `be/src/modules/permissions/` as a standalone module.
**Why bad:** Violates the principle that permissions are a property of the KB, not a standalone domain. Creates cross-module dependency (permissions module would need to import KB models, violating module boundaries).
**Instead:** Keep permission logic inside `modules/knowledge-base/` as middleware + service methods.

### Anti-Pattern 3: Quality Scoring at Query Time
**What:** Computing chunk quality scores when the user views chunks, not during indexing.
**Why bad:** Adds latency to every chunk list query. Cannot filter low-quality chunks from RAG retrieval without re-scoring.
**Instead:** Score during the indexing pipeline (after parsing, before embedding). Store scores in OpenSearch.

### Anti-Pattern 4: Separate Quality Scoring Microservice
**What:** Creating a new Python service for quality scoring.
**Why bad:** Adds deployment complexity. Quality scoring is a pipeline stage, not a standalone service. The task_executor already has all the context (chunk text, parser config, tenant info).
**Instead:** Add quality scoring as a module within `advance-rag/rag/quality/` called by task_executor.

### Anti-Pattern 5: Incremental DB Renames (Multiple Migrations)
**What:** Renaming one table per migration across multiple deployments.
**Why bad:** Intermediate states where some tables say "project" and others say "kb" cause confusion. The code must handle both naming conventions during the transition.
**Instead:** Single atomic migration that renames ALL tables and columns at once. PostgreSQL RENAME is DDL (instant, metadata-only).

---

## Scalability Considerations

| Concern | At 100 KBs | At 10K KBs | At 100K KBs |
|---------|-----------|-----------|-------------|
| Permission resolution | In-memory lookup (fast) | Add Redis cache per-session for resolved KB roles | Materialized view of user-accessible KBs |
| Quality scoring | Inline in task_executor (CPU-bound) | Inline still fine (per-chunk scoring is O(n) with small constants) | Consider batch scoring with separate semaphore |
| KB listing with permissions | JOIN kb_permissions in query | Pre-compute accessible KB IDs in Redis | Paginated with pre-filtered KB ID set |
| Chunk quality filtering | OpenSearch range query on quality_score_flt | OpenSearch handles this natively (numeric range) | No concern (field is indexed automatically) |

---

## Sources

- Direct codebase analysis: `be/src/shared/db/migrations/20260312000000_initial_schema.ts` (current schema)
- Direct codebase analysis: `be/src/shared/services/ability.service.ts` (CASL implementation)
- Direct codebase analysis: `be/src/shared/config/rbac.ts` (role hierarchy + permissions)
- Direct codebase analysis: `be/src/modules/projects/` (current project module -- 10 models, 5 services, routes)
- Direct codebase analysis: `advance-rag/rag/svr/task_executor.py` (RAG pipeline: build_chunks -> enrich -> embed -> index)
- Direct codebase analysis: `fe/src/features/projects/` (current FE project feature)
- Direct codebase analysis: `fe/src/app/routeConfig.ts` (route metadata)
- Direct codebase analysis: `be/src/app/routes.ts` (route registration)
- All confidence: HIGH (primary source is direct code inspection, no external sources needed)
