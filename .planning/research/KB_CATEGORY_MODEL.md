# DocumentCategory Data Model

**Researched:** 2026-04-07
**Sources:** `be/src/modules/knowledge-base/services/knowledge-base-category.service.ts`, `be/src/shared/db/migrations/20260312000000_initial_schema.ts` (lines 1100-1260), `be/src/shared/db/migrations/20260402000000_rename_projects_to_knowledge_base.ts`
**Confidence:** HIGH

## Schema (`document_categories`)

Defined at `be/src/shared/db/migrations/20260312000000_initial_schema.ts:1106`:

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | hex UUID default |
| `project_id` (now `knowledge_base_id` after the rename migration) | text NOT NULL | FK → `projects.id` (now `knowledge_bases.id`) ON DELETE CASCADE |
| `name` | text NOT NULL | |
| `description` | text | |
| `category_type` | text NOT NULL DEFAULT `'documents'` | Discriminator: `documents` (versioned), `standard` (1 dataset), `code` (code parser) |
| `dataset_id` | text NULLABLE | FK → `datasets.id` ON DELETE SET NULL — only populated for `standard`/`code` types |
| `sort_order` | integer DEFAULT 0 | UI ordering |
| `dataset_config` | jsonb DEFAULT `'{}'` | Per-category dataset overrides |
| `created_by` / `updated_by` | text | User UUIDs |
| `created_at` / `updated_at` | timestamptz | |

**Indexes:** `project_id`, `category_type`, `sort_order`. No tenant_id index because tenant scoping is **inherited transitively** from `knowledge_bases.tenant_id` (the parent).

### Critical observation: NO tenant_id column on `document_categories`

This means every access check today must JOIN through `knowledge_bases` to find the tenant. Confirmed by `knowledge-base-category.service.ts:80-85`, where the service explicitly looks up `ModelFactory.knowledgeBase.findById(knowledgeBaseId)` to fetch `tenant_id` whenever it needs one.

**Implication for `resource_grants`:** The `resource_grants` table itself MUST carry `tenant_id` (denormalized from the parent KB) so the ability builder can scope grants without an extra JOIN.

## Sub-tables

### `document_category_versions` (initial_schema.ts:1134)
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `category_id` | text NOT NULL | FK → `document_categories.id` ON DELETE CASCADE |
| `version_label` | text NOT NULL | |
| `ragflow_dataset_id` | text | Maps to a Peewee-managed `dataset` row (one-per-version) |
| `ragflow_dataset_name` | text | `<knowledgeBase.name>_<version_label>` (built in service line 228) |
| `status` | text DEFAULT `'active'` | |
| `last_synced_at` | timestamptz | |
| `metadata` | jsonb | |
| Unique | `(category_id, version_label)` | |

### `document_category_version_files` (initial_schema.ts:1159)
Per-uploaded-file tracking with `version_id`, `file_name`, `ragflow_doc_id`, `status`, `error`. Cascades from version.

### `knowledge_base_entity_permissions` (initial_schema.ts:1236, originally `project_entity_permissions`)
**Already exists.** This is essentially a proto-`resource_grants` table.

| Column | Notes |
|---|---|
| `id` | PK |
| `project_id` (now `knowledge_base_id`) | NOT NULL, FK CASCADE |
| `entity_type` | `'category' \| 'chat' \| 'search'` |
| `entity_id` | UUID of the specific entity |
| `grantee_type` | `'user' \| 'team'` |
| `grantee_id` | UUID |
| `permission_level` | `'none' \| 'view' \| 'create' \| 'edit' \| 'delete'` |
| Unique | `(project_id, entity_type, entity_id, grantee_type, grantee_id)` |

This table is the **most direct lineage** for the new `resource_grants`. Migration plan: rename + extend (add `tenant_id`, add `role` to `grantee_type` enum, add `expires_at`, add `created_at` if missing) rather than creating from scratch. R6 should preserve existing rows.

### `knowledge_base_members` (referenced by L145-147 of `knowledge-base.routes.ts`)
A separate sharing concept managed by `knowledge_base.controller.addMember`. Per `db/seeds` and `team.types.ts`, members carry a `role` of `'member' \| 'leader'`. This is different from `entity_permissions` — it's a **principal grant on the entire KB** (not on a sub-resource).

## Service-level patterns

| Operation | Function | File:line |
|---|---|---|
| List by KB | `listCategories(kbId)` | `knowledge-base-category.service.ts:37` |
| Get by id | `getCategoryById(categoryId)` | L46 |
| Create | `createCategory(kbId, data, user)` — auto-creates linked dataset for `standard`/`code` types (L77-122) | L59 |
| Update | `updateCategory(categoryId, data, user)` | L147 |
| Delete | `deleteCategory(categoryId)` — soft-deletes linked dataset first | L165 |
| List versions | `listVersions(categoryId)` | L193 |
| Create version | `createVersion(categoryId, data, user)` — auto-creates dataset named `<kbName>_<version_label>` (L228) | L215 |
| Import git | `importGitRepo(kbId, categoryId, tenantId, params)` — clones, filters by `CODE_EXTENSIONS`, creates File+Document records, queues parse | L420 |
| Import zip | `importZipFile(kbId, categoryId, tenantId, fileBuffer, fileName)` | L492 |

## How categories interact with OpenSearch

Categories themselves are **not directly indexed**. The relationship is:

```
KnowledgeBase
  → DocumentCategory (in PG)
    → DocumentCategoryVersion (in PG, has ragflow_dataset_id)
      → Dataset (Peewee table, kb_id in OS = dataset.id)
        → Document (Peewee table)
          → Chunks in OpenSearch index `knowledge_<tenant_id>`, with `kb_id` field = dataset.id
```

So in OpenSearch chunks:
- `kb_id` field = **dataset id** (from `advance-rag/rag/nlp/search.py` references — every chunk has `kb_id`)
- There is **NO `category_id` field** indexed today (verified: grep finds zero matches in `advance-rag/api/db` and `advance-rag/rag/nlp/search.py`)

This is the core finding for `OPENSEARCH_INTEGRATION.md`: to support category-level filters, the indexing pipeline must start writing `category_id` (and ideally `knowledge_base_id`) onto every chunk, OR the backend must translate category grants → dataset_id list at query time.

## Frontend access concept signals

The KB share UI already exists:
- `fe/src/features/knowledge-base/components/KnowledgeBasePermissionModal.tsx` — KB-level share
- `fe/src/features/knowledge-base/components/EntityPermissionModal.tsx` — entity-level share (categories/chats/searches)
- `fe/src/features/knowledge-base/components/DocumentsTab.tsx` — category sidebar UI

The fact that `EntityPermissionModal` already exists and the backend table `knowledge_base_entity_permissions` already supports `entity_type='category'` means **per-category access is already a partially implemented concept**. R6 doesn't invent it — it formalizes and routes it through the unified ability engine.

## Implication for `resource_grants` table design

```ts
resource_grants {
  id PK
  tenant_id TEXT NOT NULL  // denormalized from parent KB; needed for ability scoping
  resource_type TEXT NOT NULL  // 'KnowledgeBase' | 'DocumentCategory' | (future) 'Document'
  resource_id TEXT NOT NULL
  grantee_type TEXT NOT NULL  // 'user' | 'team' | 'role'
  grantee_id TEXT NOT NULL    // user_id, team_id, or role name
  actions TEXT[] NOT NULL     // ['view'] | ['view','edit'] | ['manage']
  expires_at TIMESTAMPTZ NULL
  created_by TEXT
  created_at TIMESTAMPTZ
  UNIQUE(tenant_id, resource_type, resource_id, grantee_type, grantee_id)
  INDEX(grantee_type, grantee_id)         // hot path: load all grants for a user
  INDEX(resource_type, resource_id)       // hot path: who-can-do-X-on-Y query
}
```

Migrating `knowledge_base_entity_permissions` rows into this shape:
- `entity_type='category'` → `resource_type='DocumentCategory'`
- `entity_type='chat'` → `resource_type='ChatAssistant'` (in scope as separate subject)
- `entity_type='search'` → `resource_type='SearchApp'`
- `permission_level` → expand into `actions[]` (e.g. `'edit'` → `['view','edit']`)
- Pull `tenant_id` from joined `knowledge_bases` row.
