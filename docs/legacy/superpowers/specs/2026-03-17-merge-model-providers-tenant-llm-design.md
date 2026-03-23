# Design: Merge model_providers and tenant_llm into a Single Table

**Date:** 2026-03-17
**Status:** Approved
**Scope:** Backend (Node.js), advance-rag (Python), Knex migration

## Problem

Two separate tables store LLM model configurations:

- **`model_providers`** (Knex) — source of truth for the backend; UUID IDs, audit trail, soft-delete, encryption
- **`tenant_llm`** (Peewee) — read by the advance-rag Python worker; integer IDs, token usage tracking, tenant scoping

The backend syncs `model_providers` → `tenant_llm` on every CRUD operation via `syncFromProvider()`, wrapped in silent try/catch blocks. This sync has silently failed multiple times (missing NOT NULL columns), leaving the advance-rag worker unable to find models.

## Decision

**Approach A: Keep `model_providers` as the single table.** Add missing columns (`tenant_id`, `used_tokens`), remap the Peewee model to point at `model_providers`, remove `tenant_llm` and all sync logic.

### Why this approach

- `model_providers` is already the source of truth — backend owns the schema via Knex
- UUID IDs, audit trail, soft-delete, readable status are all superior
- Eliminates the fragile sync pattern that caused production bugs
- Frontend requires zero changes
- Peewee's `column_name` aliasing handles name differences transparently

## Schema Changes

### `model_providers` — columns added

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `tenant_id` | VARCHAR(32) | SYSTEM_TENANT_ID | Single-tenant now, future multi-tenant ready |
| `used_tokens` | INTEGER | 0 | Cumulative token usage (advance-rag increments after LLM calls) |

### `model_providers` — columns modified

| Column | Change | Reason |
|--------|--------|--------|
| `model_type` | VARCHAR(32) → VARCHAR(128) | Peewee uses longer values like `image2text`, `speech2text` |

### `model_providers` — unique constraint updated

**Before:** `(factory_name, model_name) WHERE status = 'active'`
**After:** `(tenant_id, factory_name, model_name) WHERE status = 'active'`

Drop old index: `DROP INDEX model_providers_factory_model_active_unique`
Create new index:
```sql
CREATE UNIQUE INDEX model_providers_tenant_factory_model_active_unique
ON model_providers (tenant_id, factory_name, model_name)
WHERE status = 'active'
```

### `tenant_llm` — dropped

Table is removed entirely. All references redirect to `model_providers`.

### `tenant` table — `tenant_*_id` columns changed

These integer columns previously referenced `tenant_llm.id` (auto-increment). They now reference `model_providers.id` (UUID).

| Column | Type change |
|--------|-------------|
| `tenant_llm_id` | INTEGER → TEXT (UUID) |
| `tenant_embd_id` | INTEGER → TEXT (UUID) |
| `tenant_asr_id` | INTEGER → TEXT (UUID) |
| `tenant_img2txt_id` | INTEGER → TEXT (UUID) |
| `tenant_rerank_id` | INTEGER → TEXT (UUID) |
| `tenant_tts_id` | INTEGER → TEXT (UUID) |

### `knowledgebase` table — same pattern

| Column | Type change |
|--------|-------------|
| `tenant_embd_id` | INTEGER → TEXT (UUID) |

## Peewee Model Remapping

The `TenantLLM` Peewee model remaps to `model_providers` using `column_name` aliasing:

```python
import uuid

class TenantLLM(DataBaseModel):
    id = CharField(max_length=36, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = CharField(max_length=32, null=False, index=True)
    llm_factory = CharField(max_length=128, column_name='factory_name')
    model_type = CharField(max_length=128, null=True, index=True)
    llm_name = CharField(max_length=128, column_name='model_name')
    api_key = TextField(null=True)
    api_base = CharField(max_length=512)
    max_tokens = IntegerField(default=0)
    used_tokens = IntegerField(default=0)
    vision = BooleanField(null=True, default=False)
    is_default = BooleanField(null=True, default=False)
    status = CharField(max_length=16, default='active')
    # Backend-managed columns — declared so Peewee INSERTs don't violate NOT NULL constraints
    created_by = CharField(max_length=255, null=True, column_name='created_by')
    updated_by = CharField(max_length=255, null=True, column_name='updated_by')

    class Meta:
        db_table = "model_providers"
```

### UUID generation for Python INSERTs

The `id` field uses `default=lambda: str(uuid.uuid4())`. This ensures Python INSERT paths (`ensure_mineru_from_env`, `ensure_paddleocr_from_env`, `TenantLLMService.insert_many`) generate valid UUID primary keys automatically.

### Columns not declared in Peewee model

`created_at` and `updated_at` are managed by Knex defaults (`DEFAULT CURRENT_TIMESTAMP`). They are not declared in the Peewee model — PostgreSQL fills them automatically on INSERT.

### `column_name` aliasing behavior

Python code continues using `obj.llm_factory` and `obj.llm_name`. Peewee translates these to `factory_name` and `model_name` in generated SQL. Dict keys from `.dicts()` queries use the Python attribute name (`llm_factory`), not the SQL column name — this preserves backward compatibility with all existing Python callers.

## Status Encoding Migration

| Context | Old value | New value |
|---------|-----------|-----------|
| Valid/active | `'1'` | `'active'` |
| Invalid/deleted | `'0'` | `'deleted'` |

**Scope:** Only `TenantLLM` / `model_providers` status changes. Other Peewee tables (`Tenant`, `Knowledgebase`, `Document`, `File`, etc.) retain their `'1'`/`'0'` status encoding unchanged.

## Backend Changes

### Remove (delete)

- `be/src/modules/llm-provider/models/tenant-llm.model.ts` — sync model, no longer needed
- `ModelFactory.tenantLlm` getter in `be/src/shared/models/factory.ts`

### Modify

- **`llm-provider.service.ts`** — Remove `syncFromProvider()` and `deleteByProvider()` try/catch blocks from `create()`, `update()`, `delete()`
- **`model-provider.model.ts`** — Add `tenant_id: SYSTEM_TENANT_ID` and `used_tokens: 0` to insert operations

### No changes

- API endpoints, routes, response shapes
- Frontend types, components, queries
- Encryption logic

## Advance-RAG Changes

### `db/db_models.py`

- Replace `TenantLLM` model with new column-aliased version pointing to `model_providers` (see Peewee Model Remapping above)
- Remove 11 dead Peewee models: `InvitationCode`, `Dialog`, `APIToken`, `API4Conversation`, `UserCanvasVersion`, `MCPServer`, `EvaluationDataset`, `EvaluationCase`, `EvaluationRun`, `EvaluationResult`, `SystemSettings`
- Update `tenant_*_id` field types from `IntegerField` to `CharField` in `Tenant` and `Knowledgebase` models

### `db/services/tenant_llm_service.py`

- Update all `TenantLLM`-specific status comparisons: `'1'` → `'active'`, `'0'` → `'deleted'`
- Update `StatusEnum.VALID.value` references **only where they filter `TenantLLM` rows** to `'active'`
- Update `increase_usage_by_id` type annotation from `int` to `str` for the `tenant_model_id` parameter

### `db/services/llm_service.py`

- Update `increase_usage_by_id` call sites — no logic change needed, just type annotation awareness (ID is now a UUID string, but Python passes it through transparently)

### `db/init_data.py`

- Update hardcoded status values in `TenantLLM` insert operations from `'1'` to `'active'`
- `fix_empty_tenant_model_id()` — `tenant_model.id` will now be a UUID string; the updated `Tenant` model (`CharField` for `tenant_*_id`) handles this correctly

### Files requiring no changes

- `db/joint_services/tenant_model_service.py` — reads by name, passes through
- `rag/app/naive.py` — OCR provisioning via `TenantLLMService`, INSERT uses UUID default
- `rag/flow/parser/parser.py` — same pattern as naive.py

## Migration Consolidation

All schema changes consolidated into `20260312000000_initial_schema.ts` (fresh database):

1. All existing Knex tables — unchanged
2. `model_providers` — merged schema with `tenant_id`, `used_tokens`, wider `model_type`, updated unique constraint
3. Peewee tables: `tenant`, `knowledgebase`, `document`, `file`, `file2document`, `task`
4. System tenant seed row
5. **No `tenant_llm` table**

Delete: `20260317000000_add_ragflow_peewee_tables.ts`

Section 13 (conditional ALTER/UPDATE for Peewee tables) becomes unnecessary since tables are created fresh with correct columns.

Remove the `tenant_llm` encryption block from Section 14 — the table no longer exists. API key encryption is handled by `model_providers` encryption block only.

### `init_database_tables()` compatibility

The advance-rag `init_database_tables()` calls `CREATE TABLE IF NOT EXISTS` for all Peewee `DataBaseModel` subclasses. Since `model_providers` will already exist (created by Knex), Peewee skips creation. The `migrate_db()` function called at the end should be reviewed — if it attempts schema alterations on `model_providers`, those ALTER statements may conflict. On fresh installs this is safe since Knex creates the table first.

## Out of Scope

- `llm_factories` table — Python-managed provider metadata catalog, stays as-is
- `llm` table — Python-managed global model catalog, stays as-is
- Frontend changes — none needed
- Multi-tenant implementation — only `tenant_id` column added with default value
- Status encoding for non-`TenantLLM` tables (Tenant, Knowledgebase, Document, etc.) — retain `'1'`/`'0'`

## Risk Assessment

| Area | Risk | Mitigation |
|------|------|------------|
| Peewee column aliasing | Low | Well-documented Peewee feature; `.dicts()` returns Python attr names, preserving backward compat |
| Status encoding change | Medium | Scoped only to TenantLLM queries; grep `status.*'1'` in tenant_llm_service.py |
| UUID ID type change | Low | Peewee CharField handles UUIDs as strings; `default=lambda: str(uuid.uuid4())` for INSERTs |
| Python INSERT missing columns | Low | `is_default`, `created_by`, `updated_by` declared in Peewee model with nullable defaults; `created_at`/`updated_at` use DB defaults |
| `tenant_*_id` type change | Low | Fresh database, no data migration; Peewee model updated to `CharField` |
| Dead model removal | Low | Confirmed zero references via codebase search |
| `init_database_tables()` conflict | Low | Uses `CREATE TABLE IF NOT EXISTS`; skips existing tables |
