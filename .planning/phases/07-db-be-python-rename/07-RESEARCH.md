# Phase 7: DB + BE + Python Rename - Research

**Researched:** 2026-04-02
**Domain:** Full-stack entity rename (Project -> Knowledge Base) across PostgreSQL, Express backend, and Python RAG worker
**Confidence:** HIGH

## Summary

Phase 7 is a systematic rename of "Project" to "Knowledge Base" across three layers: PostgreSQL schema (7 tables + FK columns + 1 external FK), Express backend module (10 models, 5 services, 1 controller, 1 route file, 1 schema file, barrel export), and Python RAG worker prefix (`ragflow_doc_meta_` -> `knowledge_doc_meta_` in 5 connector files). The rename is a big-bang approach with no API versioning -- the SPA and BE deploy together from a monorepo with no external API consumers of `/api/projects`.

The critical insight from codebase analysis: PostgreSQL `ALTER TABLE RENAME` and `ALTER TABLE RENAME COLUMN` are metadata-only operations (instant, no data copy) and preserve all FK constraints, indexes, and sequences automatically. The `agents` table also has a `project_id` FK column referencing `projects.id` that must be renamed. Peewee models in `advance-rag/db/db_models.py` have zero references to `project` -- only the doc_store connector files need updating.

**Primary recommendation:** Execute in strict dependency order -- DB migration first (single atomic migration), then BE module rename (directory + all files), then shared types/factory/ability/routes updates, then Python prefix cleanup. Verify with `npm run build` after BE changes and `grep -r "ragflow_doc_meta_" advance-rag/` after Python changes.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Main DB table: `projects` -> `knowledge_base` (singular, matching RAGFlow convention)
- **D-02:** FK columns: `project_id` -> `knowledge_base_id` (full, explicit)
- **D-03:** BE module directory: `be/src/modules/projects/` -> `be/src/modules/knowledge-base/` (singular, kebab-case)
- **D-04:** API routes: `/api/projects` -> `/api/knowledge-base` (singular)
- **D-05:** ModelFactory: `ModelFactory.project` -> `ModelFactory.knowledgeBase`
- **D-06:** TS types: `Project` -> `KnowledgeBase`, `CreateProjectDto` -> `CreateKnowledgeBaseDto`, etc.
- **D-07:** Single atomic Knex migration for all table and column renames. No staged approach.
- **D-08:** Use `knex.raw('ALTER TABLE ... RENAME TO ...')` for all renames. Do NOT use Knex `.renameColumn()` due to known bug (#933) that drops DEFAULT constraints on PostgreSQL.
- **D-09:** PostgreSQL `ALTER TABLE RENAME` is instant (metadata-only, no data copy). Safe for production.
- **D-10:** `ragflow_doc_meta_` -> `knowledge_doc_meta_` in all 5 Python files.
- **D-11:** Files to update: `common/doc_store/es_conn_base.py`, `common/doc_store/ob_conn_base.py`, `common/doc_store/infinity_conn_base.py`, `rag/utils/ob_conn.py`, `rag/utils/infinity_conn.py`
- **D-12:** ALL `project_*` tables rename to `knowledge_base_*` (full map in CONTEXT.md)
- **D-13:** `document_categories`, `document_category_versions`, `document_category_version_files` are UNCHANGED (already generic).
- **D-14:** All `project_id` FK columns across all tables -> `knowledge_base_id`.

### Claude's Discretion
- Index and constraint naming in the migration (auto-generated vs explicit)
- Order of operations within the atomic migration
- How to handle ModelFactory registration (rename vs re-register)
- Test strategy for completeness verification (grep-based vs build-based)
- Whether to update barrel exports in shared/models/ or just the module barrel

### Deferred Ideas (OUT OF SCOPE)
- Merge latest RAGFlow upstream to b-knowledge (already done in v1.0)
- Frontend rename (Phase 8)
- Permission model simplification (Phase 9)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REN-02 | All DB tables renamed (`projects` -> `knowledge_base`, `project_*` -> `knowledge_base_*`, all `project_id` FK columns -> `knowledge_base_id`) | Complete table/column inventory documented; single atomic Knex migration using `knex.raw('ALTER TABLE RENAME')` |
| REN-03 | All BE module files, routes, models renamed (`/api/projects/*` -> `/api/knowledge-base/*`, module directory, barrel exports) | Full file inventory of 26 files in projects module; ModelFactory has 10 model registrations to rename; routes.ts has single mount point; ability.service.ts has 'Project' subject |
| REN-05 | Python worker `ragflow_doc_meta_` prefix renamed to `knowledge_doc_meta_` in all connector files | 17 occurrences across 5 files confirmed; plus 1 additional `table_name_prefix="ragflow_"` default param in infinity_conn_base.py |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Knex | ^3.1.0 (installed) | DB migration via `knex.raw()` | Project's sole migration tool; raw SQL avoids `.renameColumn()` bug |
| PostgreSQL | 17 (installed) | `ALTER TABLE RENAME` is DDL, metadata-only, instant | Native PG capability, no extensions needed |

### Supporting
No new libraries needed. This is a pure refactoring phase using existing tooling.

**Installation:**
```bash
# No new packages to install
```

## Architecture Patterns

### Complete Rename Map (DB Layer)

**Tables to rename:**

| Current Table | New Table | Has FK `project_id`? |
|---|---|---|
| `projects` | `knowledge_base` | N/A (is the parent) |
| `project_permissions` | `knowledge_base_permissions` | Yes -> `knowledge_base_id` |
| `project_entity_permissions` | `knowledge_base_entity_permissions` | Yes -> `knowledge_base_id` |
| `project_datasets` | `knowledge_base_datasets` | Yes -> `knowledge_base_id` |
| `project_chats` | `knowledge_base_chats` | Yes -> `knowledge_base_id` |
| `project_searches` | `knowledge_base_searches` | Yes -> `knowledge_base_id` |
| `project_sync_configs` | `knowledge_base_sync_configs` | Yes -> `knowledge_base_id` |

**External FK columns to rename (tables NOT renamed):**

| Table | Column | New Column | FK Target |
|---|---|---|---|
| `document_categories` | `project_id` | `knowledge_base_id` | `knowledge_base.id` |
| `agents` | `project_id` | `knowledge_base_id` | `knowledge_base.id` (SET NULL) |

**CRITICAL: The `agents` table has `project_id` referencing `projects.id` with ON DELETE SET NULL.** This is NOT listed in CONTEXT.md D-12 but MUST be included in the migration. The agents module (`be/src/modules/agents/`) has 8+ references to `project_id` in its model, service, and schema files that need updating.

**Tables NOT renamed (confirmed):**
- `document_categories` (table name unchanged, only FK column renames)
- `document_category_versions` (no project_id)
- `document_category_version_files` (no project_id)
- `audit_logs` (no project_id -- verified)
- `memory` module tables (no project_id -- verified)

### Migration SQL Pattern

```sql
-- Core table
ALTER TABLE projects RENAME TO knowledge_base;

-- Child tables (order doesn't matter within a transaction)
ALTER TABLE project_permissions RENAME TO knowledge_base_permissions;
ALTER TABLE project_entity_permissions RENAME TO knowledge_base_entity_permissions;
ALTER TABLE project_datasets RENAME TO knowledge_base_datasets;
ALTER TABLE project_chats RENAME TO knowledge_base_chats;
ALTER TABLE project_searches RENAME TO knowledge_base_searches;
ALTER TABLE project_sync_configs RENAME TO knowledge_base_sync_configs;

-- FK columns in renamed tables
ALTER TABLE knowledge_base_permissions RENAME COLUMN project_id TO knowledge_base_id;
ALTER TABLE knowledge_base_entity_permissions RENAME COLUMN project_id TO knowledge_base_id;
ALTER TABLE knowledge_base_datasets RENAME COLUMN project_id TO knowledge_base_id;
ALTER TABLE knowledge_base_chats RENAME COLUMN project_id TO knowledge_base_id;
ALTER TABLE knowledge_base_searches RENAME COLUMN project_id TO knowledge_base_id;
ALTER TABLE knowledge_base_sync_configs RENAME COLUMN project_id TO knowledge_base_id;

-- FK columns in tables that are NOT renamed
ALTER TABLE document_categories RENAME COLUMN project_id TO knowledge_base_id;
ALTER TABLE agents RENAME COLUMN project_id TO knowledge_base_id;
```

**PostgreSQL auto-handles:** FK constraints follow the renamed table automatically. Indexes follow the renamed column. Sequences follow. No need to explicitly rename constraints or indexes unless desired for clarity.

**Constraint naming:** PostgreSQL auto-renames constraint targets but keeps the original constraint name (e.g., `project_permissions_project_id_foreign` stays as-is after rename). This is cosmetically ugly but functionally correct. Optionally rename constraints for clarity, but it adds migration complexity with zero runtime impact.

### Recommended Constraint Rename Strategy

**Recommendation: Do NOT rename constraints.** The auto-generated constraint names (e.g., `project_permissions_project_id_foreign`) are never referenced by application code. They only appear in error messages. Renaming them adds 20+ ALTER statements to the migration for zero functional benefit and increases rollback complexity.

### BE Module File Rename Map

**Directory rename:** `be/src/modules/projects/` -> `be/src/modules/knowledge-base/`

**Files to rename within the module:**

| Current File | New File |
|---|---|
| `models/project.model.ts` | `models/knowledge-base.model.ts` |
| `models/project-permission.model.ts` | `models/knowledge-base-permission.model.ts` |
| `models/project-entity-permission.model.ts` | `models/knowledge-base-entity-permission.model.ts` |
| `models/project-dataset.model.ts` | `models/knowledge-base-dataset.model.ts` |
| `models/project-chat.model.ts` | `models/knowledge-base-chat.model.ts` |
| `models/project-search.model.ts` | `models/knowledge-base-search.model.ts` |
| `models/project-sync-config.model.ts` | `models/knowledge-base-sync-config.model.ts` |
| `models/document-category.model.ts` | `models/document-category.model.ts` (unchanged) |
| `models/document-category-version.model.ts` | `models/document-category-version.model.ts` (unchanged) |
| `models/document-category-version-file.model.ts` | `models/document-category-version-file.model.ts` (unchanged) |
| `services/projects.service.ts` | `services/knowledge-base.service.ts` |
| `services/project-category.service.ts` | `services/knowledge-base-category.service.ts` |
| `services/project-chat.service.ts` | `services/knowledge-base-chat.service.ts` |
| `services/project-search.service.ts` | `services/knowledge-base-search.service.ts` |
| `services/project-sync.service.ts` | `services/knowledge-base-sync.service.ts` |
| `controllers/projects.controller.ts` | `controllers/knowledge-base.controller.ts` |
| `routes/projects.routes.ts` | `routes/knowledge-base.routes.ts` |
| `schemas/projects.schemas.ts` | `schemas/knowledge-base.schemas.ts` |
| `index.ts` | `index.ts` (renamed exports) |

### External Files That Reference the Projects Module

| File | What to Change |
|---|---|
| `be/src/app/routes.ts` (line 41, 192) | Import path + mount point `/projects` -> `/knowledge-base` |
| `be/src/shared/models/factory.ts` (lines 45-55, 159-179, 573-663) | 10 import paths, 10 private fields, 10 getter names |
| `be/src/shared/models/types.ts` | 7 interfaces: `Project`, `ProjectPermission`, `ProjectDataset`, `ProjectSyncConfig`, `ProjectChat`, `ProjectSearch`, `ProjectEntityPermission`. Also `DocumentCategory.project_id` -> `knowledge_base_id` |
| `be/src/shared/services/ability.service.ts` (line 27, 121, 135) | Subject `'Project'` -> `'KnowledgeBase'` in type union + ability rules |
| `be/src/modules/agents/models/agent.model.ts` | `project_id` field -> `knowledge_base_id` |
| `be/src/modules/agents/services/agent.service.ts` | 6+ references to `project_id` |
| `be/src/modules/agents/schemas/agent.schemas.ts` | `project_id` field in 2 schemas |

### Python File Changes

**5 connector files (17 occurrences of `ragflow_doc_meta_`):**

| File | Occurrences | Change |
|---|---|---|
| `advance-rag/common/doc_store/es_conn_base.py` | 1 (docstring) | Update docstring pattern |
| `advance-rag/common/doc_store/ob_conn_base.py` | 4 (1 docstring + 3 startswith checks) | Update all |
| `advance-rag/common/doc_store/infinity_conn_base.py` | 5 (1 docstring + 3 startswith + 1 default param `table_name_prefix="ragflow_"`) | Update all including default param |
| `advance-rag/rag/utils/ob_conn.py` | 3 (all startswith checks) | Update all |
| `advance-rag/rag/utils/infinity_conn.py` | 5 (all startswith checks) | Update all |

**Additional `ragflow_` reference found (in scope):**
- `infinity_conn_base.py` line 36: `table_name_prefix: str="ragflow_"` -- this default parameter should become `"knowledge_"` to match the system prefix convention.

**NOT in scope (do not change):**
- `common/crypto_utils.py`: `ragflow_crypto_salt` -- changing salt breaks all existing encrypted data
- `common/versions.py`: `get_ragflow_version()` -- version utility, not a prefix
- `api/utils/crypt.py`: comment mentioning `ragflow_cli` -- just documentation

### Recommended Build Order

```
1. DB Migration (Knex)
   ├── Rename 7 tables
   ├── Rename FK columns in 9 tables (7 renamed + document_categories + agents)
   └── Rollback function (reverse renames)

2. BE Module Rename
   ├── Create new directory be/src/modules/knowledge-base/
   ├── Move + rename all files
   ├── Update all internal imports and class names
   ├── Update tableName in all models
   └── Update barrel exports in index.ts

3. Shared Code Updates
   ├── types.ts: Rename 7 interfaces + update project_id fields
   ├── factory.ts: Update 10 imports, fields, getters
   ├── ability.service.ts: Update 'Project' -> 'KnowledgeBase' subject
   └── routes.ts: Update import + mount point

4. Agents Module Updates
   ├── agent.model.ts: project_id -> knowledge_base_id
   ├── agent.service.ts: project_id references
   └── agent.schemas.ts: project_id field

5. Python Prefix Cleanup
   ├── 5 connector files: ragflow_doc_meta_ -> knowledge_doc_meta_
   └── infinity_conn_base.py: table_name_prefix default

6. Verification
   ├── npm run build (TypeScript compilation)
   ├── grep -r "project_id" be/src/ (should only be in migration files)
   ├── grep -r "ragflow_doc_meta_" advance-rag/ (should be zero)
   └── npm run dev (smoke test startup)
```

### Anti-Patterns to Avoid
- **Incremental migration (multiple migration files):** All renames in one atomic transaction. Intermediate states where some tables say "project" and others say "knowledge_base" cause confusion.
- **Using Knex `.renameColumn()`:** Known bug #933 drops DEFAULT constraints on PostgreSQL. Always use `knex.raw('ALTER TABLE ... RENAME COLUMN ...')`.
- **API version aliases:** No redirect from `/api/projects` to `/api/knowledge-base`. Clean break.
- **Partial project_id rename:** The `agents` table has `project_id` too. Missing it creates a schema inconsistency that breaks agent-KB association.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Table rename | DROP + CREATE + data copy | `ALTER TABLE RENAME` via knex.raw() | Native PG DDL is instant, preserves constraints, indexes, sequences |
| Column rename | DROP COLUMN + ADD COLUMN + UPDATE | `ALTER TABLE RENAME COLUMN` via knex.raw() | Native PG DDL, preserves defaults and NOT NULL |
| FK constraint update after rename | DROP + re-CREATE foreign keys | Nothing -- PG auto-follows renamed tables | FK references are by OID, not name |

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | PostgreSQL: 7 `project_*` tables with live data, `document_categories.project_id`, `agents.project_id` | DB migration renames tables/columns (metadata-only, no data loss) |
| Live service config | None -- all configuration is in `.env` files and code, not in external service UIs | None |
| OS-registered state | None -- services run via `npm run dev` or Docker, no OS-registered tasks reference "project" | None |
| Secrets/env vars | None -- no env vars reference "project" naming | None |
| Build artifacts | `be/dist/` will contain stale compiled JS with old module paths after rename | `npm run build` will regenerate; no manual cleanup needed |

**OpenSearch indexes:** The `knowledge_` prefix is already in use for main indexes. The `ragflow_doc_meta_*` indexes in OpenSearch will NOT be automatically renamed by this migration -- but the code change (`ragflow_doc_meta_` -> `knowledge_doc_meta_`) means NEW metadata indexes will use the `knowledge_` prefix. Existing `ragflow_doc_meta_*` indexes in OpenSearch will become orphaned. This is acceptable for dev/staging; for production, a one-time reindex or alias creation would be needed.

**Valkey/Redis cache:** CASL ability cache is keyed by session ID, not by entity name. No cache entries reference "project" naming. No action needed.

## Common Pitfalls

### Pitfall 1: Missing the `agents.project_id` Column
**What goes wrong:** The CONTEXT.md D-12 lists 7 `project_*` tables but does not mention the `agents` table which has `project_id` referencing `projects.id` (ON DELETE SET NULL). After renaming `projects` to `knowledge_base`, the FK still works (PG follows by OID), but the column name remains `project_id` creating an inconsistency.
**Why it happens:** The agents module was added later and its FK to projects is easy to overlook.
**How to avoid:** Include `ALTER TABLE agents RENAME COLUMN project_id TO knowledge_base_id` in the migration. Update `agent.model.ts`, `agent.service.ts`, and `agent.schemas.ts`.
**Warning signs:** `grep -r "project_id" be/src/` returning hits outside migration files after the rename.

### Pitfall 2: Knex `.renameColumn()` Dropping DEFAULT Constraints
**What goes wrong:** Using Knex's built-in `.renameColumn()` instead of raw SQL silently drops DEFAULT values and NOT NULL constraints on PostgreSQL.
**Why it happens:** Known Knex bug #933, unfixed.
**How to avoid:** Decision D-08 already locks this: use `knex.raw('ALTER TABLE ... RENAME COLUMN ...')` exclusively.
**Warning signs:** Post-migration, INSERTs fail with "NOT NULL violation" on columns that previously had defaults.

### Pitfall 3: `infinity_conn_base.py` Default Parameter
**What goes wrong:** The `ragflow_doc_meta_` prefix is renamed in the 5 files listed in D-11, but `infinity_conn_base.py` line 36 has a constructor default `table_name_prefix: str="ragflow_"` that is not a `startswith("ragflow_doc_meta_")` check -- it's the base prefix for ALL Infinity tables.
**Why it happens:** D-11 lists the 5 files but this specific line is a different kind of reference (default parameter vs. string comparison).
**How to avoid:** Change `table_name_prefix: str="ragflow_"` to `table_name_prefix: str="knowledge_"` in `infinity_conn_base.py`.
**Warning signs:** New Infinity connector tables created with `ragflow_` prefix instead of `knowledge_`.

### Pitfall 4: CASL Subject String Not Updated
**What goes wrong:** `ability.service.ts` uses `'Project'` as a CASL subject string in the `Subjects` type union and in `can('manage', 'Project', ...)` rules. Routes use `requireAbility('read', 'Project')`. If the subject string is renamed in one place but not the other, CASL denies all KB access.
**Why it happens:** The subject string appears in 3 places: type union (line 27), super-admin rules (line 121), admin rules (line 135). Route files use `requireAbility('read', 'Project')` extensively.
**How to avoid:** Search for the exact string `'Project'` in ability.service.ts and all route files. Rename consistently to `'KnowledgeBase'`.
**Warning signs:** 403 errors on all knowledge-base endpoints after deploy.

### Pitfall 5: TypeScript Build Fails Due to Circular Import After Directory Rename
**What goes wrong:** When renaming the directory from `projects/` to `knowledge-base/`, git may not cleanly track the rename. Files copied with new names but old content still import from `./services/projects.service.js` (the old path).
**Why it happens:** Directory renames in git are tracked as delete + add, not as a move. Internal relative imports within the module break if filenames change but import paths don't.
**How to avoid:** After directory + file rename, systematically update ALL internal relative imports within the module. Run `npm run build` immediately to catch any broken import.
**Warning signs:** TypeScript errors like "Cannot find module './services/projects.service.js'".

## Code Examples

### Migration File Pattern (Knex)

```typescript
// Source: CONTEXT.md D-07, D-08, D-09
// be/src/shared/db/migrations/YYYYMMDDhhmmss_rename_projects_to_knowledge_base.ts

import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Rename core table first (all FKs follow automatically via OID)
  await knex.raw('ALTER TABLE projects RENAME TO knowledge_base')

  // Rename child tables
  await knex.raw('ALTER TABLE project_permissions RENAME TO knowledge_base_permissions')
  await knex.raw('ALTER TABLE project_entity_permissions RENAME TO knowledge_base_entity_permissions')
  await knex.raw('ALTER TABLE project_datasets RENAME TO knowledge_base_datasets')
  await knex.raw('ALTER TABLE project_chats RENAME TO knowledge_base_chats')
  await knex.raw('ALTER TABLE project_searches RENAME TO knowledge_base_searches')
  await knex.raw('ALTER TABLE project_sync_configs RENAME TO knowledge_base_sync_configs')

  // Rename FK columns in renamed tables
  await knex.raw('ALTER TABLE knowledge_base_permissions RENAME COLUMN project_id TO knowledge_base_id')
  await knex.raw('ALTER TABLE knowledge_base_entity_permissions RENAME COLUMN project_id TO knowledge_base_id')
  await knex.raw('ALTER TABLE knowledge_base_datasets RENAME COLUMN project_id TO knowledge_base_id')
  await knex.raw('ALTER TABLE knowledge_base_chats RENAME COLUMN project_id TO knowledge_base_id')
  await knex.raw('ALTER TABLE knowledge_base_searches RENAME COLUMN project_id TO knowledge_base_id')
  await knex.raw('ALTER TABLE knowledge_base_sync_configs RENAME COLUMN project_id TO knowledge_base_id')

  // Rename FK columns in tables that are NOT renamed
  await knex.raw('ALTER TABLE document_categories RENAME COLUMN project_id TO knowledge_base_id')
  await knex.raw('ALTER TABLE agents RENAME COLUMN project_id TO knowledge_base_id')
}

export async function down(knex: Knex): Promise<void> {
  // Reverse column renames first (before table renames)
  await knex.raw('ALTER TABLE document_categories RENAME COLUMN knowledge_base_id TO project_id')
  await knex.raw('ALTER TABLE agents RENAME COLUMN knowledge_base_id TO project_id')

  await knex.raw('ALTER TABLE knowledge_base_permissions RENAME COLUMN knowledge_base_id TO project_id')
  await knex.raw('ALTER TABLE knowledge_base_entity_permissions RENAME COLUMN knowledge_base_id TO project_id')
  await knex.raw('ALTER TABLE knowledge_base_datasets RENAME COLUMN knowledge_base_id TO project_id')
  await knex.raw('ALTER TABLE knowledge_base_chats RENAME COLUMN knowledge_base_id TO project_id')
  await knex.raw('ALTER TABLE knowledge_base_searches RENAME COLUMN knowledge_base_id TO project_id')
  await knex.raw('ALTER TABLE knowledge_base_sync_configs RENAME COLUMN knowledge_base_id TO project_id')

  // Reverse table renames
  await knex.raw('ALTER TABLE knowledge_base_sync_configs RENAME TO project_sync_configs')
  await knex.raw('ALTER TABLE knowledge_base_searches RENAME TO project_searches')
  await knex.raw('ALTER TABLE knowledge_base_chats RENAME TO project_chats')
  await knex.raw('ALTER TABLE knowledge_base_datasets RENAME TO project_datasets')
  await knex.raw('ALTER TABLE knowledge_base_entity_permissions RENAME TO project_entity_permissions')
  await knex.raw('ALTER TABLE knowledge_base_permissions RENAME TO project_permissions')
  await knex.raw('ALTER TABLE knowledge_base RENAME TO projects')
}
```

### Model Rename Pattern

```typescript
// Source: existing project.model.ts pattern
// be/src/modules/knowledge-base/models/knowledge-base.model.ts

import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { KnowledgeBase } from '@/shared/models/types.js'

export class KnowledgeBaseModel extends BaseModel<KnowledgeBase> {
  protected tableName = 'knowledge_base'
  protected knex = db

  async findByCreator(userId: string): Promise<KnowledgeBase[]> {
    return this.knex(this.tableName)
      .where('created_by', userId)
      .orderBy('created_at', 'desc')
  }
}
```

### ModelFactory Update Pattern

```typescript
// Source: existing factory.ts pattern
// Key changes in be/src/shared/models/factory.ts

import { KnowledgeBaseModel } from '@/modules/knowledge-base/models/knowledge-base.model.js'
// ... other renamed imports

class ModelFactory {
  private static knowledgeBaseModel: KnowledgeBaseModel;

  static get knowledgeBase() {
    if (!this.knowledgeBaseModel) this.knowledgeBaseModel = new KnowledgeBaseModel();
    return this.knowledgeBaseModel;
  }
  // ... similar for knowledgeBasePermission, knowledgeBaseDataset, etc.
}
```

### CASL Subject Update Pattern

```typescript
// Source: ability.service.ts line 27
// Before:
type Subjects = 'Dataset' | 'Document' | 'ChatAssistant' | 'SearchApp' | 'User' | 'AuditLog' | 'Policy' | 'Org' | 'Project' | 'Agent' | 'Memory' | 'all'

// After:
type Subjects = 'Dataset' | 'Document' | 'ChatAssistant' | 'SearchApp' | 'User' | 'AuditLog' | 'Policy' | 'Org' | 'KnowledgeBase' | 'Agent' | 'Memory' | 'all'
```

### Python Prefix Cleanup Pattern

```python
# Before (in all 5 connector files):
if index_name.startswith("ragflow_doc_meta_"):

# After:
if index_name.startswith("knowledge_doc_meta_"):

# infinity_conn_base.py constructor:
# Before:
def __init__(self, mapping_file_name: str = "infinity_mapping.json", logger_name: str = "ragflow.infinity_conn", table_name_prefix: str="ragflow_"):
# After:
def __init__(self, mapping_file_name: str = "infinity_mapping.json", logger_name: str = "ragflow.infinity_conn", table_name_prefix: str="knowledge_"):
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (installed in be/) |
| Config file | `be/vitest.config.ts` |
| Quick run command | `npm run test -w be` |
| Full suite command | `npm run test -w be` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REN-02 | DB tables renamed, app starts without errors | smoke | `npm run db:migrate && npm run build -w be` | N/A (build test) |
| REN-03 | Backend API serves at /api/knowledge-base/*, old routes gone | build | `npm run build -w be` (TypeScript compilation catches broken imports) | N/A |
| REN-05 | Python ragflow_doc_meta_ -> knowledge_doc_meta_ | grep | `grep -r "ragflow_doc_meta_" advance-rag/ \| wc -l` (should be 0) | N/A |

### Sampling Rate
- **Per task commit:** `npm run build -w be` (TypeScript compilation is the primary validation)
- **Per wave merge:** `npm run build` (full monorepo build)
- **Phase gate:** `npm run build` + `grep -r "project_id" be/src/ --include="*.ts" | grep -v migration` (should be zero) + `grep -r "ragflow_doc_meta_" advance-rag/` (should be zero)

### Wave 0 Gaps
- No existing test files for the projects module (no `*.test.ts` or `*.spec.ts` files exist in the entire `be/src/` tree)
- Primary validation strategy is TypeScript build + grep verification (not unit tests)
- This is acceptable for a rename phase -- the TypeScript compiler catches all broken imports and type mismatches

## Open Questions

1. **Unique constraint naming after rename**
   - What we know: PostgreSQL keeps original constraint names after `ALTER TABLE RENAME` (e.g., `project_permissions_project_id_grantee_type_grantee_id_unique` stays as-is)
   - What's unclear: Whether any future migration will reference these constraints by name
   - Recommendation: Skip constraint renaming. The names are auto-generated and never referenced in code. If needed later, a separate migration can rename them.

2. **Orphaned `ragflow_doc_meta_*` OpenSearch indexes**
   - What we know: Existing OpenSearch indexes named `ragflow_doc_meta_{tenant_id}` will not be automatically renamed. New indexes will use `knowledge_doc_meta_` prefix.
   - What's unclear: Whether existing data in `ragflow_doc_meta_*` indexes needs to be accessible after rename
   - Recommendation: For dev/staging, accept orphaned indexes (re-parse documents to populate new indexes). For production, create index aliases or a one-time reindex script. Document this as a post-migration operational step.

3. **`teams.project_name` column**
   - What we know: The `teams` table has a `project_name` text column (line 68 of initial migration). This is a display field, not a FK.
   - What's unclear: Whether this column is actively used or should be renamed
   - Recommendation: This is likely a legacy field from the original schema. It is NOT a FK and does not reference the `projects` table. Leave it as-is for Phase 7; if it needs renaming, it's a separate concern.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified). This phase is purely code/config/migration changes using existing installed tools (Node.js, PostgreSQL, Python).

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of `be/src/shared/db/migrations/20260312000000_initial_schema.ts` -- complete FK structure, CASCADE rules, index definitions
- Direct codebase analysis of `be/src/modules/projects/` -- all 19 source files inventoried
- Direct codebase analysis of `be/src/shared/models/factory.ts` -- all 10 model registrations
- Direct codebase analysis of `be/src/shared/services/ability.service.ts` -- CASL subject type + rules
- Direct codebase analysis of `be/src/modules/agents/` -- project_id references in model, service, schema
- Direct codebase analysis of `advance-rag/` -- 17 `ragflow_doc_meta_` occurrences + 1 `table_name_prefix` default
- `.planning/research/PITFALLS.md` -- 13 pitfalls documented from prior research
- `.planning/research/STACK.md` -- confirms zero new deps needed
- `.planning/research/ARCHITECTURE.md` -- integration architecture and build order

### Secondary (MEDIUM confidence)
- PostgreSQL documentation on `ALTER TABLE RENAME` -- metadata-only DDL, FK preservation by OID
- Knex issue #933 -- `.renameColumn()` drops DEFAULT constraints

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - zero new dependencies, using existing Knex + raw SQL
- Architecture: HIGH - complete file inventory from direct codebase analysis, all FK relationships mapped
- Pitfalls: HIGH - 5 specific pitfalls identified from actual code patterns, especially the missed agents.project_id

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable -- rename targets are unlikely to change)
