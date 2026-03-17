# Merge model_providers and tenant_llm Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the `tenant_llm` table and make `model_providers` the single source of truth for LLM model configurations across both backend and advance-rag.

**Architecture:** Add `tenant_id` and `used_tokens` columns to `model_providers`, remap the advance-rag Peewee `TenantLLM` model to point at `model_providers` using `column_name` aliasing, remove all sync logic from the backend.

**Tech Stack:** Knex migrations (TypeScript), Peewee ORM (Python), PostgreSQL

**Spec:** `docs/superpowers/specs/2026-03-17-merge-model-providers-tenant-llm-design.md`

---

## Chunk 1: Migration — Consolidate Schema

### Task 1: Update `model_providers` table in initial migration

**Files:**
- Modify: `be/src/shared/db/migrations/20260312000000_initial_schema.ts`

- [ ] **Step 1: Add `tenant_id` and `used_tokens` columns to model_providers createTable block**

In the `model_providers` createTable block (around line 483), add these columns after `table.boolean('is_default')`:

```typescript
    // Tenant scoping (single-tenant default, future multi-tenant ready)
    table.string('tenant_id', 32).notNullable().defaultTo(
      (process.env['SYSTEM_TENANT_ID'] || '00000000000000000000000000000001').replace(/-/g, '')
    )
    // Cumulative token usage tracked by advance-rag worker
    table.integer('used_tokens').notNullable().defaultTo(0)
```

- [ ] **Step 2: Widen `model_type` from VARCHAR(32) to VARCHAR(128)**

In the same createTable block, change:
```typescript
    table.string('model_type', 32).notNullable()
```
to:
```typescript
    table.string('model_type', 128).notNullable()
```

- [ ] **Step 3: Update the unique index to include tenant_id**

Replace the `model_providers_factory_model_active_unique` raw SQL (around line 500):
```typescript
  await knex.raw(`
    CREATE UNIQUE INDEX model_providers_factory_model_active_unique
    ON model_providers (factory_name, model_name)
    WHERE status = 'active'
  `)
```
with:
```typescript
  await knex.raw(`
    CREATE UNIQUE INDEX model_providers_tenant_factory_model_active_unique
    ON model_providers (tenant_id, factory_name, model_name)
    WHERE status = 'active'
  `)
```

- [ ] **Step 4: Verify no references to old index name in rollback**

In the `down()` function, find:
```typescript
  await knex.raw('DROP INDEX IF EXISTS datasets_name_active_unique')
```
and add below it (if not already there):
```typescript
  await knex.raw('DROP INDEX IF EXISTS model_providers_tenant_factory_model_active_unique')
```

### Task 2: Add Peewee tables to initial migration

**Files:**
- Modify: `be/src/shared/db/migrations/20260312000000_initial_schema.ts`
- Delete: `be/src/shared/db/migrations/20260317000000_add_ragflow_peewee_tables.ts`

- [ ] **Step 1: Add `tenant` table creation before the model_providers block**

Insert after the RAG pipeline section comment (around line 432), before `datasets`:

```typescript
  // ──────────────────────────────────────────────
  // 9a. Peewee-managed tables (shared with advance-rag Python worker)
  // ──────────────────────────────────────────────

  const SYSTEM_TENANT_ID = (
    process.env['SYSTEM_TENANT_ID'] || '00000000000000000000000000000001'
  ).replace(/-/g, '')

  // Tenant — system tenant record (single-tenant mode)
  await knex.schema.createTable('tenant', (t) => {
    t.string('id', 32).primary()
    t.string('name', 100).nullable().index()
    t.string('public_key', 255).nullable().index()
    t.string('llm_id', 128).notNullable().defaultTo('').index()
    t.text('tenant_llm_id').nullable().index()
    t.string('embd_id', 128).notNullable().defaultTo('').index()
    t.text('tenant_embd_id').nullable().index()
    t.string('asr_id', 128).notNullable().defaultTo('').index()
    t.text('tenant_asr_id').nullable().index()
    t.string('img2txt_id', 128).notNullable().defaultTo('').index()
    t.text('tenant_img2txt_id').nullable().index()
    t.string('rerank_id', 128).notNullable().defaultTo('').index()
    t.text('tenant_rerank_id').nullable().index()
    t.string('tts_id', 256).nullable().index()
    t.text('tenant_tts_id').nullable().index()
    t.string('parser_ids', 256).notNullable().defaultTo('').index()
    t.integer('credit').defaultTo(512).index()
    t.string('status', 1).nullable().defaultTo('1').index()
    t.bigInteger('create_time').nullable().index()
    t.timestamp('create_date').nullable().index()
    t.bigInteger('update_time').nullable().index()
    t.timestamp('update_date').nullable().index()
  })

  // Seed system tenant
  await knex('tenant').insert({
    id: SYSTEM_TENANT_ID,
    name: 'system',
    llm_id: '',
    embd_id: '',
    asr_id: '',
    img2txt_id: '',
    rerank_id: '',
    tts_id: '',
    parser_ids: 'naive:General,qa:Q&A,table:Table,paper:Paper,book:Book,laws:Laws,presentation:Presentation,picture:Picture,one:One,audio:Audio,email:Email',
    credit: 9999999,
    status: '1',
    create_time: Date.now(),
    create_date: new Date(),
    update_time: Date.now(),
    update_date: new Date(),
  })
```

- [ ] **Step 2: Add `knowledgebase` table**

```typescript
  // Knowledgebase — dataset/knowledge base metadata (Peewee-managed)
  await knex.schema.createTable('knowledgebase', (t) => {
    t.string('id', 32).primary()
    t.text('avatar').nullable()
    t.string('tenant_id', 32).notNullable().index()
    t.string('name', 128).notNullable().index()
    t.string('language', 32).nullable().defaultTo('English').index()
    t.text('description').nullable()
    t.string('embd_id', 128).notNullable().defaultTo('').index()
    t.text('tenant_embd_id').nullable().index()
    t.string('permission', 16).notNullable().defaultTo('me').index()
    t.string('created_by', 32).notNullable().index()
    t.integer('doc_num').defaultTo(0).index()
    t.integer('token_num').defaultTo(0).index()
    t.integer('chunk_num').defaultTo(0).index()
    t.float('similarity_threshold').defaultTo(0.2).index()
    t.float('vector_similarity_weight').defaultTo(0.3).index()
    t.string('parser_id', 32).notNullable().defaultTo('naive').index()
    t.string('pipeline_id', 32).nullable().index()
    t.jsonb('parser_config').notNullable().defaultTo('{"pages":[[1,1000000]],"table_context_size":0,"image_context_size":0}')
    t.integer('pagerank').defaultTo(0)
    t.string('graphrag_task_id', 32).nullable().index()
    t.timestamp('graphrag_task_finish_at').nullable()
    t.string('raptor_task_id', 32).nullable().index()
    t.timestamp('raptor_task_finish_at').nullable()
    t.string('mindmap_task_id', 32).nullable().index()
    t.timestamp('mindmap_task_finish_at').nullable()
    t.string('status', 1).nullable().defaultTo('1').index()
    t.bigInteger('create_time').nullable().index()
    t.timestamp('create_date').nullable().index()
    t.bigInteger('update_time').nullable().index()
    t.timestamp('update_date').nullable().index()
  })
```

- [ ] **Step 3: Add `document`, `file`, `file2document`, `task` tables**

```typescript
  // Document — document records for RAG processing (Peewee-managed)
  await knex.schema.createTable('document', (t) => {
    t.string('id', 32).primary()
    t.text('thumbnail').nullable()
    t.string('kb_id', 256).notNullable().index()
    t.string('parser_id', 32).notNullable().index()
    t.string('pipeline_id', 32).nullable().index()
    t.jsonb('parser_config').notNullable().defaultTo('{"pages":[[1,1000000]],"table_context_size":0,"image_context_size":0}')
    t.string('source_type', 128).notNullable().defaultTo('local').index()
    t.string('type', 32).notNullable().index()
    t.string('created_by', 32).notNullable().index()
    t.string('name', 255).nullable().index()
    t.string('location', 255).nullable().index()
    t.integer('size').defaultTo(0).index()
    t.integer('token_num').defaultTo(0).index()
    t.integer('chunk_num').defaultTo(0).index()
    t.float('progress').defaultTo(0).index()
    t.text('progress_msg').nullable().defaultTo('')
    t.timestamp('process_begin_at').nullable().index()
    t.float('process_duration').defaultTo(0)
    t.string('suffix', 32).notNullable().defaultTo('').index()
    t.string('content_hash', 32).nullable().defaultTo('').index()
    t.string('run', 1).nullable().defaultTo('0').index()
    t.string('status', 1).nullable().defaultTo('1').index()
    t.string('source_url', 2048).nullable()
    t.bigInteger('create_time').nullable().index()
    t.timestamp('create_date').nullable().index()
    t.bigInteger('update_time').nullable().index()
    t.timestamp('update_date').nullable().index()
  })

  // File — file metadata (S3 storage references, Peewee-managed)
  await knex.schema.createTable('file', (t) => {
    t.string('id', 32).primary()
    t.string('parent_id', 32).notNullable().index()
    t.string('tenant_id', 32).notNullable().index()
    t.string('created_by', 32).notNullable().index()
    t.string('name', 255).notNullable().index()
    t.string('location', 255).nullable().index()
    t.integer('size').defaultTo(0).index()
    t.string('type', 32).notNullable().index()
    t.string('source_type', 128).notNullable().defaultTo('').index()
    t.bigInteger('create_time').nullable().index()
    t.timestamp('create_date').nullable().index()
    t.bigInteger('update_time').nullable().index()
    t.timestamp('update_date').nullable().index()
  })

  // File2Document — join table linking files to documents (Peewee-managed)
  await knex.schema.createTable('file2document', (t) => {
    t.string('id', 32).primary()
    t.string('file_id', 32).nullable().index()
    t.string('document_id', 32).nullable().index()
    t.bigInteger('create_time').nullable().index()
    t.timestamp('create_date').nullable().index()
    t.bigInteger('update_time').nullable().index()
    t.timestamp('update_date').nullable().index()
  })

  // Task — RAG processing task queue (Peewee-managed)
  await knex.schema.createTable('task', (t) => {
    t.string('id', 32).primary()
    t.string('doc_id', 32).notNullable().index()
    t.integer('from_page').defaultTo(0)
    t.integer('to_page').defaultTo(100000000)
    t.string('task_type', 32).notNullable().defaultTo('')
    t.integer('priority').defaultTo(0)
    t.timestamp('begin_at').nullable().index()
    t.float('process_duration').defaultTo(0)
    t.float('progress').defaultTo(0).index()
    t.text('progress_msg').nullable().defaultTo('')
    t.integer('retry_count').defaultTo(0)
    t.text('digest').nullable().defaultTo('')
    t.text('chunk_ids').nullable().defaultTo('')
    t.bigInteger('create_time').nullable().index()
    t.timestamp('create_date').nullable().index()
    t.bigInteger('update_time').nullable().index()
    t.timestamp('update_date').nullable().index()
  })
```

- [ ] **Step 4: Remove Section 13 (conditional Peewee table alterations)**

Delete the entire Section 13 block (lines ~801-826) that conditionally alters `document` and `file` tables — these tables are now created fresh with correct columns above.

- [ ] **Step 5: Remove `tenant_llm` encryption block from Section 14**

Delete the `tenant_llm` encryption block (lines ~849-867) — the table no longer exists. Keep only the `model_providers` encryption block.

- [ ] **Step 6: Add Peewee tables to `down()` function**

In the `down()` function, add drops before the existing RAG pipeline drops:

```typescript
  // Peewee-managed tables
  await knex.schema.dropTableIfExists('task')
  await knex.schema.dropTableIfExists('file2document')
  await knex.schema.dropTableIfExists('file')
  await knex.schema.dropTableIfExists('document')
  await knex.schema.dropTableIfExists('knowledgebase')
  await knex.schema.dropTableIfExists('tenant')
```

Also update the `down()` to remove the old index name and add the new one:
```typescript
  await knex.raw('DROP INDEX IF EXISTS model_providers_tenant_factory_model_active_unique')
```

- [ ] **Step 7: Delete the second migration file**

```bash
rm be/src/shared/db/migrations/20260317000000_add_ragflow_peewee_tables.ts
```

- [ ] **Step 8: Build and verify**

```bash
npm run build -w be
```

Expected: Build succeeds with no errors.

- [ ] **Step 9: Commit**

```bash
git add be/src/shared/db/migrations/
git commit -m "refactor: consolidate schema — merge model_providers+tenant_llm, add Peewee tables to initial migration"
```

---

## Chunk 2: Backend — Remove Sync Logic

### Task 3: Remove tenant-llm sync model and factory getter

**Files:**
- Delete: `be/src/modules/llm-provider/models/tenant-llm.model.ts`
- Modify: `be/src/shared/models/factory.ts`

- [ ] **Step 1: Delete the sync model file**

```bash
rm be/src/modules/llm-provider/models/tenant-llm.model.ts
```

- [ ] **Step 2: Remove TenantLlmModel import and getter from factory.ts**

In `be/src/shared/models/factory.ts`, remove the import (line ~27):
```typescript
import { TenantLlmModel } from '@/modules/llm-provider/models/tenant-llm.model.js';
```

Remove the static property declaration for `tenantLlmModel` and the getter (lines ~377-381):
```typescript
  static get tenantLlm() {
    // Create instance on first access (lazy initialization)
    if (!this.tenantLlmModel) this.tenantLlmModel = new TenantLlmModel();
    return this.tenantLlmModel;
  }
```

Also remove the `private static tenantLlmModel` property declaration.

### Task 4: Remove sync logic from llm-provider service

**Files:**
- Modify: `be/src/modules/llm-provider/services/llm-provider.service.ts`

- [ ] **Step 1: Remove syncFromProvider try/catch from create() (lines ~118-123)**

Delete:
```typescript
        // Sync to shared tenant_llm table (used by task executors)
        try {
            await ModelFactory.tenantLlm.syncFromProvider(provider);
        } catch (err) {
            log.warn('Failed to sync model provider to tenant_llm', { error: String(err) });
        }
```

- [ ] **Step 2: Remove syncFromProvider try/catch from update() (lines ~168-172)**

Delete:
```typescript
        try {
            await ModelFactory.tenantLlm.syncFromProvider(provider);
        } catch (err) {
            log.warn('Failed to sync model provider update to tenant_llm', { error: String(err) });
        }
```

- [ ] **Step 3: Remove deleteByProvider try/catch from delete() (lines ~202-208)**

Delete:
```typescript
        // Remove the corresponding tenant_llm row so Python workers stop using it
        if (provider) {
            try {
                await ModelFactory.tenantLlm.deleteByProvider(provider);
            } catch (err) {
                log.warn('Failed to remove tenant_llm row on provider delete', { error: String(err) });
            }
        }
```

- [ ] **Step 4: Remove ModelFactory.tenantLlm import if present in the service file**

Check for and remove any `ModelFactory` usage that only existed for the sync.

### Task 5: Add tenant_id and used_tokens to model-provider create

**Files:**
- Modify: `be/src/modules/llm-provider/models/model-provider.model.ts`

- [ ] **Step 1: Check how BaseModel.create works**

Read the BaseModel create method to understand how inserts are constructed. The `tenant_id` and `used_tokens` defaults are handled by the DB schema (DEFAULT values in migration), so no model change is strictly needed. However, if the service explicitly builds the insert payload, ensure `tenant_id` is included.

Check `be/src/modules/llm-provider/services/llm-provider.service.ts` create method — if it builds the row explicitly, add:
```typescript
tenant_id: SYSTEM_TENANT_ID,
used_tokens: 0,
```

If it uses `ModelFactory.modelProvider.create(data)` where `data` comes from the request body, the DB defaults will handle it — no change needed.

- [ ] **Step 2: Build and verify**

```bash
npm run build -w be
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add be/src/modules/llm-provider/ be/src/shared/models/factory.ts
git commit -m "refactor: remove tenant_llm sync logic, delete sync model"
```

---

## Chunk 3: Advance-RAG — Remap Peewee Model

### Task 6: Remap TenantLLM Peewee model to model_providers

**Files:**
- Modify: `advance-rag/db/db_models.py`

- [ ] **Step 1: Replace the TenantLLM class (lines ~824-844)**

Replace:
```python
class TenantLLM(DataBaseModel):
    id = PrimaryKeyField()
    tenant_id = CharField(max_length=32, null=False, index=True)
    llm_factory = CharField(max_length=128, null=False, help_text="LLM factory name", index=True)
    model_type = CharField(max_length=128, null=True, help_text="LLM, Text Embedding, Image2Text, ASR", index=True)
    llm_name = CharField(max_length=128, null=True, help_text="LLM name", default="", index=True)
    api_key = TextField(null=True, help_text="API KEY")
    api_base = CharField(max_length=255, null=True, help_text="API Base")
    max_tokens = IntegerField(default=8192, help_text="Max context token num", index=True)
    used_tokens = IntegerField(default=0, help_text="Used token num", index=True)
    vision = BooleanField(null=True, help_text="Whether this chat model supports vision", default=False)
    status = CharField(max_length=1, null=False, help_text="is it validate(0: wasted, 1: validate)", default="1", index=True)

    def __str__(self):
        return self.llm_name

    class Meta:
        db_table = "tenant_llm"
        indexes = (
            (("tenant_id", "llm_factory", "llm_name"), True),
        )
```

with:
```python
class TenantLLM(DataBaseModel):
    """LLM model provider configuration shared with the Node.js backend.

    Maps to the ``model_providers`` table (Knex-managed). Column aliasing
    via ``column_name`` lets Python code keep using ``llm_factory`` /
    ``llm_name`` while the actual SQL columns are ``factory_name`` /
    ``model_name``.
    """
    id = CharField(max_length=36, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = CharField(max_length=32, null=False, index=True)
    llm_factory = CharField(max_length=128, null=False, column_name='factory_name', index=True)
    model_type = CharField(max_length=128, null=True, index=True)
    llm_name = CharField(max_length=128, null=True, column_name='model_name', default="", index=True)
    api_key = TextField(null=True)
    api_base = CharField(max_length=512, null=True)
    max_tokens = IntegerField(default=0, index=True)
    used_tokens = IntegerField(default=0, index=True)
    vision = BooleanField(null=True, default=False)
    is_default = BooleanField(null=True, default=False)
    status = CharField(max_length=16, null=False, default="active", index=True)
    # Backend-managed audit columns — declared to avoid NOT NULL violations on INSERT
    created_by = CharField(max_length=255, null=True, column_name='created_by')
    updated_by = CharField(max_length=255, null=True, column_name='updated_by')

    def __str__(self):
        return self.llm_name

    class Meta:
        db_table = "model_providers"
```

- [ ] **Step 2: Add `import uuid` at top of file if not already present**

Check imports at top of `db_models.py`. Add `import uuid` if missing.

- [ ] **Step 3: Update Tenant model tenant_*_id fields from IntegerField to CharField**

In the `Tenant` class (lines ~743-764), change all 6 `tenant_*_id` fields:

```python
    # Before
    tenant_llm_id = IntegerField(null=True, help_text="id in tenant_llm", index=True)
    tenant_embd_id = IntegerField(null=True, help_text="id in tenant_llm", index=True)
    tenant_asr_id = IntegerField(null=True, help_text="id in tenant_llm", index=True)
    tenant_img2txt_id = IntegerField(null=True, help_text="id in tenant_llm", index=True)
    tenant_rerank_id = IntegerField(null=True, help_text="id in tenant_llm", index=True)
    tenant_tts_id = IntegerField(null=True, help_text="id in tenant_llm", index=True)
```

```python
    # After
    tenant_llm_id = CharField(max_length=36, null=True, help_text="id in model_providers", index=True)
    tenant_embd_id = CharField(max_length=36, null=True, help_text="id in model_providers", index=True)
    tenant_asr_id = CharField(max_length=36, null=True, help_text="id in model_providers", index=True)
    tenant_img2txt_id = CharField(max_length=36, null=True, help_text="id in model_providers", index=True)
    tenant_rerank_id = CharField(max_length=36, null=True, help_text="id in model_providers", index=True)
    tenant_tts_id = CharField(max_length=36, null=True, help_text="id in model_providers", index=True)
```

- [ ] **Step 4: Update Knowledgebase model tenant_embd_id**

In the `Knowledgebase` class (line ~868), change:
```python
    tenant_embd_id = IntegerField(null=True, help_text="id in tenant_llm", index=True)
```
to:
```python
    tenant_embd_id = CharField(max_length=36, null=True, help_text="id in model_providers", index=True)
```

### Task 7: Update status encoding in tenant_llm_service.py

**Files:**
- Modify: `advance-rag/db/services/tenant_llm_service.py`

- [ ] **Step 1: Find and replace all TenantLLM-specific status values**

Search the file for all occurrences of status comparisons related to TenantLLM. Update:
- `status="1"` → `status="active"` (in TenantLLM queries/inserts)
- `status="0"` → `status="deleted"` (in TenantLLM queries)
- Any `StatusEnum.VALID.value` used in TenantLLM WHERE clauses → `"active"`

**Important:** Do NOT change status values in queries for other tables (Tenant, Knowledgebase, etc.) — those retain `'1'`/`'0'`.

- [ ] **Step 2: Update increase_usage_by_id type annotation**

Change the method signature (line ~350):
```python
    def increase_usage_by_id(cls, tenant_model_id: int, used_tokens: int):
```
to:
```python
    def increase_usage_by_id(cls, tenant_model_id, used_tokens: int):
```

Update the docstring to note that `tenant_model_id` is now a UUID string.

### Task 8: Update init_data.py status values

**Files:**
- Modify: `advance-rag/db/init_data.py`

- [ ] **Step 1: Find and replace TenantLLM status values in inserts**

Search for status assignments related to TenantLLM inserts. Change:
- `"status": "1"` → `"status": "active"` (only in TenantLLM insert dicts)

- [ ] **Step 2: Verify fix_empty_tenant_model_id works with UUID**

Check `fix_empty_tenant_model_id()` — it stores `tenant_model.id` into `tenant_*_id` columns. Since both are now string/text types, this should work. No code change needed, just verify.

### Task 9: Final verification and commit

- [ ] **Step 1: Build backend**

```bash
npm run build -w be
```

- [ ] **Step 2: Verify advance-rag Python imports**

```bash
cd advance-rag && python -c "from db.db_models import TenantLLM; print(TenantLLM._meta.table_name)"
```

Expected output: `model_providers`

- [ ] **Step 3: Commit advance-rag changes**

```bash
git add advance-rag/db/db_models.py advance-rag/db/services/tenant_llm_service.py advance-rag/db/init_data.py
git commit -m "refactor: remap TenantLLM Peewee model to model_providers table, update status encoding"
```

---

## Execution Notes

### Agent Team Assignment

| Agent | Role | Tasks | Scope |
|-------|------|-------|-------|
| **Architect** | Migration design | Task 1, Task 2 | `be/src/shared/db/migrations/` only |
| **BE Developer** | Backend cleanup | Task 3, Task 4, Task 5 | `be/src/modules/llm-provider/`, `be/src/shared/models/` |
| **Advance-RAG Developer** | Python model remap | Task 6, Task 7, Task 8, Task 9 | `advance-rag/db/` |

### Execution Order

Tasks 1-2 (migration) MUST complete first. Tasks 3-5 (BE) and Tasks 6-8 (advance-rag) can run in parallel after migration is done. Task 9 (verification) runs last.

### Testing

After all changes, create a fresh database and verify:
1. `npm run db:migrate` succeeds
2. Backend starts and can CRUD model providers
3. Advance-rag worker starts and can read model configs from `model_providers`
4. Document parsing works end-to-end (upload → parse → embed)
