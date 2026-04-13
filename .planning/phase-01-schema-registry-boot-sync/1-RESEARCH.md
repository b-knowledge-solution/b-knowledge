# Phase 1: Schema, Registry, Boot Sync — Research

**Researched:** 2026-04-07
**Domain:** Knex migrations + DB-backed permission catalog scaffolding (no runtime behavior change)
**Confidence:** HIGH for schema/boot-sequence facts (direct file:line citations); MEDIUM for a handful of route inventory line numbers where the inventory was pre-existing research.

## Summary

Phase 1 is pure plumbing: create four new tables, rename one existing table, scaffold a code-side registry for all 22 BE modules, run a boot-time upsert, and seed day-one role mappings. **Zero routes change**, **zero middleware changes**, **zero ability engine changes**. The entire phase is invisible to end users if successful.

The work lives almost entirely under `be/src/shared/db/migrations/` (5 new migrations), `be/src/shared/permissions/` (new directory, 2 files), and `be/src/modules/*/` (22 new `*.permissions.ts` sidecar files). A single call site is added to `be/src/app/index.ts` between the existing migration runner (line 149) and root user bootstrap (line 162).

**Primary recommendation:** Do P1.1 (schema create+rename+columns) as a single atomic migration, P1.2 (backfill) as a separate migration that can be re-run idempotently, P1.3/P1.4 (registry + sync) as code-only (no migration), and P1.5 (role_permissions seed) as the last migration in the phase. Every migration must have a working `down()` — rollback is a Table Stakes requirement (TS1).

## User Constraints (from CONTEXT.md)

No `CONTEXT.md` exists for this phase (research spawned directly). The governing constraints come from `.planning/REQUIREMENTS.md` "Decisions Locked" and `.planning/ROADMAP.md` Phase 1 section:

### Locked Decisions (apply to Phase 1)
- **Rename, don't greenfield**: `knowledge_base_entity_permissions` → `resource_grants` (REQUIREMENTS.md Decisions Locked row "Resource grant table"). Existing rows MUST survive.
- **`tenant_id` denormalized onto `resource_grants`**, NOT NULL (Decisions Locked + R-5).
- **All schema changes via Knex**, even on Peewee-managed tables (project rule + Decisions Locked).
- **Registry is the source of truth**; boot sync upserts into `permissions` table (TS2, TS3).
- **Day-one behavior unchanged**: `role_permissions` seed must expand legacy `manage_users`/`manage_system`/etc. per `PERMISSION_INVENTORY.md` "Day-One Seed".
- **Legacy aliases NOT removed in this phase** — Phase 6 (P6.1/P6.2) owns `superadmin`/`member` cleanup. Phase 1 must not touch `be/src/shared/constants/roles.ts` or `users.role` default.

### Claude's Discretion
- Exact Knex idioms inside migration (`.createTable` vs `knex.raw`) — recommend `.createTable` for new tables, `knex.raw` for the RENAME (matches prior rename migration style, see `20260402000000_rename_projects_to_knowledge_base.ts:11`).
- Type-level design of `definePermissions()` helper — freedom to propose the strongest TypeScript signature.
- Whether the boot sync service is a class singleton or a plain exported function — recommend **plain exported function** (`syncPermissionRegistry()`) consistent with existing singletons-via-module pattern.

### Deferred Ideas (OUT OF SCOPE for Phase 1)
- Any route middleware change (Phase 3).
- `ability.service.ts` changes (Phase 2).
- Legacy alias removal (Phase 6).
- `knowledge_base_permissions` → `resource_grants` migration — per `MIGRATION_PLAN.md` step (d), this is a secondary backfill; Phase 1 covers ONLY `knowledge_base_entity_permissions` per the roadmap text. **Flag:** roadmap P1.2 text mentions "migrate `knowledge_base_permissions` (KB-level grants) into `resource_grants`" — this should be confirmed with user at plan time. See Open Questions §1.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TS1 | DB schema in place: create `permissions`, `role_permissions`, `user_permission_overrides`; rename + extend `resource_grants`; backfill `tenant_id`; migrations reversible | §1 Knex conventions, §2 existing-table shape, §5 backfill plan, §6 rollback |
| TS2 | Type-safe registry in code, one file per module, 22 files total | §3 route inventory, §7 `definePermissions()` helper design |
| TS3 | Boot sync upserts registry into `permissions` table idempotently; removes stale rows with log line | §4 boot sync integration point |
| TS4 (seed only) | Knex migration seeds `role_permissions` from `LEGACY_TO_NEW` mapping; expands `manage_users` | §8 `manage_users` expansion table |

## Project Constraints (from CLAUDE.md)

- **No hardcoded string literals** in comparisons/conditionals. The new permission keys (`users.view`, `knowledge_base.share`, etc.) will become the canonical constants — they MUST be exported from the registry files and imported anywhere a string would otherwise appear. The existing `be/src/shared/constants/` pattern applies.
- **JSDoc on every exported function/type** (root CLAUDE.md "Documentation Comments"). Every function in `registry.ts`, `sync.ts`, and every migration's `up`/`down` needs a `@description` block. Existing migration `20260402130000_add_missing_indexes...ts` is the style reference.
- **Inline comments** mandatory above control flow, DB queries, guard clauses.
- **Knex migration naming**: `YYYYMMDDhhmmss_<snake_name>.ts` generated via `npm run db:migrate:make` (root CLAUDE.md). The Phase 1 migrations should be created via the command, not by hand-picking timestamps.
- **Path alias `@/*`** (both `be/` and `fe/`). Use `@/shared/permissions/...` for imports, not relative paths.
- **Backend layering Controller → Service → Model** (STRICT). Phase 1 adds a shared service (`syncPermissionRegistry`) and a registry module — neither is a Controller-Service-Model triad, so layering rule doesn't bite here. But if Phase 3 later needs to read `permissions` from DB, it MUST go through a model in `be/src/modules/permissions/models/` — do NOT put `db()` calls in `sync.ts`. **For Phase 1 the sync service reads/writes via a new `ModelFactory.permission` model** (to comply with the rule from day one).
- **All DB migrations via Knex**, including on Peewee tables. Phase 1 touches zero Peewee tables (per R-3 verification), so this rule is satisfied trivially.
- **Single quotes, no semicolons** (BE TS style).

---

## 1. Knex Conventions in This Codebase

### Migration file format
Style reference: `be/src/shared/db/migrations/20260402130000_add_missing_indexes_for_crud_and_fk_lookups.ts:1-52`.

| Convention | Fact | Cite |
|---|---|---|
| Filename | `YYYYMMDDhhmmss_<snake_name>.ts` | Existing files e.g. `20260402130000_add_missing_indexes_for_crud_and_fk_lookups.ts` |
| Import | `import type { Knex } from 'knex'` | `20260402130000_...ts:8` |
| Export signature | `export async function up(knex: Knex): Promise<void>` / `export async function down(knex: Knex): Promise<void>` | `20260402130000_...ts:16, 44` |
| Migration-level JSDoc | Fileoverview block at top + JSDoc on `up`/`down` | `20260402130000_...ts:1-6, 10-15, 39-43` |
| Inline comment per statement | Every DDL line has a `// purpose` comment above it | `20260402130000_...ts:17-36` |
| Quote style | Single quotes, no semicolons | project-wide |
| `IF NOT EXISTS` / `IF EXISTS` | Used on raw CREATE INDEX / DROP INDEX to keep migration reentrant | `20260402130000_...ts:18, 45` |

### Table create vs raw
- **New tables** use `knex.schema.createTable('name', (table) => { ... })` with `BaseModel`-friendly conventions: `table.text('id').primary().defaultTo(knex.raw(HEX_UUID_DEFAULT))`, `table.text('tenant_id').notNullable()`, `table.timestamp(..., { useTz: true }).defaultTo(knex.fn.now())`. See `20260312000000_initial_schema.ts:1236-1261` for the entity-permissions table template.
- **Renames** use `knex.raw('ALTER TABLE ... RENAME TO ...')` because the Knex `.renameColumn()` builder has bug #933 (drops DEFAULTs). This is documented in the existing rename migration header: `20260402000000_rename_projects_to_knowledge_base.ts:7-8`.
- **Index creates** outside `createTable` callbacks use `knex.raw('CREATE INDEX IF NOT EXISTS idx_... ON ...(...)')` — see `20260402130000_...ts:18-36`.

### Primary-key and FK conventions
- All PKs: `table.text('id').primary().defaultTo(knex.raw(HEX_UUID_DEFAULT))` — hex UUID generated at DB level (see `initial_schema.ts` constant near top; referenced throughout).
- FK pattern: `table.foreign('kb_id').references('knowledge_bases.id').onDelete('CASCADE')` — see `initial_schema.ts:1231`, `1255`, `1277`.
- Tenant scoping column is always `table.text('tenant_id')` (NOT uuid — codebase stores text).
- Created/updated timestamps use `.timestamp(col, { useTz: true }).defaultTo(knex.fn.now())` — see `initial_schema.ts:1252-1253`.

### Transaction handling
Knex migrations are run in an implicit transaction **per migration file** by default (when all statements are DDL-safe). The initial_schema migration does NOT explicitly wrap in `knex.transaction(...)` — each statement runs inside the migration's implicit transaction. Phase 1 migrations can follow the same pattern — no explicit `knex.transaction()` needed unless we need to interleave reads+writes (the backfill migration, P1.2, may need an explicit transaction if we do the SELECT+UPDATE in a single atomic operation; see §5).

### `users.role` column (the constraint that ROADMAP.md assumed was `'member'`)
**Important correction to MIGRATION_PLAN.md:** `be/src/shared/db/migrations/20260312000000_initial_schema.ts:33` shows the current `users.role` default is `'user'`, NOT `'member'` as `MIGRATION_PLAN.md` line 90 claims. The `'member'` default at line 93 of the same file is for **`user_teams.role`** (TeamRole), not UserRole. This is consistent with `KB_CATEGORY_MODEL.md`'s note that team-membership is a separate concept. **Phase 1 must not touch `users.role` at all.** Phase 6 (P6.1) handles any alias cleanup; there is no default to change.

### Running migrations
- Command: `npm run db:migrate` (`package.json` root script → delegates to `be/`)
- Auto-run on boot: `be/src/app/index.ts:146-159` — `knex(dbConfig); await k.migrate.latest()` happens on every server start after the DB connection check.
- Rollback: `npm run db:migrate:rollback` rolls back the last batch.

---

## 2. Existing `knowledge_base_entity_permissions` Exhaustive Shape

**Origin:** `be/src/shared/db/migrations/20260312000000_initial_schema.ts:1236-1261` (then renamed from `project_entity_permissions` by `20260402000000_rename_projects_to_knowledge_base.ts:15, 23`).

### Columns (verified)
| Column | Type | Nullable | Default | Cite |
|---|---|---|---|---|
| `id` | text | NO | `knex.raw(HEX_UUID_DEFAULT)` | `initial_schema.ts:1237` |
| `knowledge_base_id` (was `project_id`) | text | NO | — | `initial_schema.ts:1239`, renamed `20260402000000_...ts:23` |
| `entity_type` | text | NO | — | `1241` — values: `'category' \| 'chat' \| 'search'` (comment `1240`) |
| `entity_id` | text | NO | — | `1243` |
| `grantee_type` | text | NO | — | `1245` — values: `'user' \| 'team'` (comment `1244`) |
| `grantee_id` | text | NO | — | `1247` |
| `permission_level` | text | NO | `'none'` | `1249` — values: `'none' \| 'view' \| 'create' \| 'edit' \| 'delete'` (comment `1248`) |
| `created_by` | text | YES | — | `1250` |
| `updated_by` | text | YES | — | `1251` |
| `created_at` | timestamptz | YES | `knex.fn.now()` | `1252` |
| `updated_at` | timestamptz | YES | `knex.fn.now()` | `1253` |

### Indexes (verified)
- **FK:** `knowledge_base_id → knowledge_bases.id ON DELETE CASCADE` (`initial_schema.ts:1255`, was `projects.id`, auto-updated by OID when parent renamed per `20260402000000_...ts:7-8`).
- **Unique composite:** `(knowledge_base_id, entity_type, entity_id, grantee_type, grantee_id)` (`1257`). Prevents duplicate grants.
- **Index:** `knowledge_base_id` (`1258`).
- **Index:** `(entity_type, entity_id)` (`1259`).
- **Index:** `(grantee_type, grantee_id)` (`1260`).

### Columns MISSING that Phase 1 must add
- `tenant_id` text NOT NULL — R-5 mandate, denormalized from `knowledge_bases.tenant_id`.
- `action` text (or `text[]`) — TS1 mandate. **Design choice:** single `action text` (one row per action) vs `actions text[]` (array). Recommendation: use **`text[]` (array)** to match the `MIGRATION_PLAN.md` sketch at step (d) which writes `actions: ['view','create']`. This keeps the unique constraint the same shape (`tenant_id, resource_type, resource_id, grantee_type, grantee_id`) — one grant row per (resource, grantee), with the actions list on it. Decision flag: the REQUIREMENTS.md TS1 text says "add `action` (text)" (singular). **Open Question §2.**
- `expires_at` timestamptz NULL — TS1 mandate (SH2 will honor it).

### Columns to transform during rename
- `entity_type` → `resource_type` with value map: `'category'→'DocumentCategory'`, `'chat'→'ChatAssistant'`, `'search'→'SearchApp'` (per `KB_CATEGORY_MODEL.md` §"Implication for resource_grants table design").
- `entity_id` → `resource_id` (straight rename).
- `permission_level` → `actions` array with expansion `LEVEL_TO_ACTIONS` from `MIGRATION_PLAN.md:139-145`. `'none'` → `[]` (DROP rows), `'view'` → `['view']`, `'create'` → `['view','create']`, `'edit'` → `['view','create','edit']`, `'delete'` → `['view','create','edit','delete']`. **Day-one parity depends on these expansions being correct.**
- `knowledge_base_id` — no longer required once `resource_type='KnowledgeBase'` carries the semantic. **But:** keeping the column makes backfill trivial and preserves the FK/CASCADE chain. Recommendation: keep `knowledge_base_id` column during Phase 1 as a helper; drop in a later phase if cleanup is wanted.

### Existing row count
Unknown at research time — no production snapshot available in the repo. Phase 1 plan must include a pre-migration `SELECT COUNT(*)` logged to stdout (or a dev-only assertion) so the backfill row count can be verified. `ROADMAP.md` Phase 1 already flags this: "Human checkpoint after P1.2 — verify backfill row counts match `knowledge_base_entity_permissions` source" (`ROADMAP.md:40`).

---

## 3. All 22 BE Modules — Route Inventory & Registry Keys

**Verification status:** The 22 modules listed in `be/src/modules/` exactly match the 22 documented in `PERMISSION_INVENTORY.md`:

```
agents, audit, auth, broadcast, chat, code-graph, dashboard, external,
feedback, glossary, knowledge-base, llm-provider, memory, preview, rag,
search, sync, system, system-tools, teams, user-history, users
```

(Verified by `ls be/src/modules/` — 22 directories.)

### Confirmation strategy
Rather than re-enumerate every route (duplicating `PERMISSION_INVENTORY.md`), this research confirms the inventory by:
1. Count: 22/22 module directories present ✓
2. `PERMISSION_INVENTORY.md` was written 2026-04-07 (same day as this research); no new modules added since.
3. For plan time: the planner should `grep -l 'requirePermission\|requireAbility\|requireRole' be/src/modules/<mod>/routes/` to verify every file is still at the line numbers cited in the inventory before writing migration-specific tasks.

### Module → primary permission keys (summary from `PERMISSION_INVENTORY.md`)

| # | Module | Proposed keys | Day-one role coverage |
|---|---|---|---|
| 1 | agents | `agents.{view,create,edit,delete,run,debug,credentials,embed}` | admin, super-admin (via `manage_datasets`? **UNCOVERED — see Open Q §3**) |
| 2 | audit | `audit.{view,export}` | admin, super-admin only (was `requireRole('admin')`) |
| 3 | auth | none (session endpoints) | N/A |
| 4 | broadcast | `broadcast.{view,create,edit,delete}` | admin, super-admin (via `manage_system`) |
| 5 | chat | `chat_assistants.{view,create,edit,delete,embed}`, `chat.{view,create,upload,api}` | `view_chat` → `chat.view` (all roles); `chat_assistants.*` → admin/super-admin (via `manage_users` legacy overload) |
| 6 | code-graph | `code_graph.{view,manage}` | admin only (was `requireRole('admin')`) |
| 7 | dashboard | `dashboard.{view,admin}` | admin, super-admin, leader (was `requireRole('admin','leader')` for view; admin-only for admin metrics) |
| 8 | external | `api_keys.{view,create,edit,delete}` | **UNCOVERED** (currently ungated) |
| 9 | feedback | `feedback.{view,edit,delete,submit}` | admin+leader for view/edit/delete; all authenticated for submit |
| 10 | glossary | `glossary.{view,create,edit,delete,import}` | admin only |
| 11 | knowledge-base | `knowledge_base.{view,create,edit,delete,share,chats,searches,sync}`, `document_categories.{view,create,edit,delete,import}`, `documents.{view,create,delete}` | admin, super-admin (via `manage_knowledge_base`) |
| 12 | llm-provider | `llm_providers.{view,create,edit,delete,test}` | admin, super-admin (via `manage_model_providers`) |
| 13 | memory | `memory.{view,create,edit,delete}` | admin, super-admin (via `requireAbility('manage','Memory')` currently) — **no legacy key maps here; Open Q §4** |
| 14 | preview | `preview.view` | all roles (via `view_search` legacy) |
| 15 | rag | `datasets.{view,create,edit,delete,share,reindex,advanced}`, `documents.{view,create,edit,delete,parse,bulk,enrich}`, `chunks.{create,edit,delete}`, `system.parsing_config` | admin, super-admin, leader (via `manage_datasets`) |
| 16 | search | `search_apps.{view,create,edit,delete,embed}`, `search.{view,api}` | `view_search` → `search.view` (all roles); write paths via `manage_users` legacy overload |
| 17 | sync | `sync_connectors.{view,create,edit,delete,run}` | admin, super-admin (via `manage_knowledge_base`) |
| 18 | system | `system.view`, `system_history.view` | admin only |
| 19 | system-tools | `system_tools.{view,run}` | admin (run via `manage_system`) + any with `view_system_tools` |
| 20 | teams | `teams.{view,create,edit,delete,members,permissions}` | admin, super-admin (via `manage_users` legacy overload) |
| 21 | user-history | `user_history.view` | all authenticated users (via `view_history`) |
| 22 | users | `users.{view,create,edit,delete,view_ip,view_sessions,assign_role,assign_perms}` | admin, super-admin (via `manage_users`) |

### New routes to double-check at plan time
`PERMISSION_INVENTORY.md` was written 2026-04-07 against the then-current route files. A git log check at plan time for `be/src/modules/*/routes/` since that date is cheap insurance. The recent-commits snapshot in the git status shows modifications to `be/src/modules/system/routes/system.routes.ts` and `system-history.routes.ts` (already in the inventory), `be/src/modules/system/controllers/*` — these are unstaged. **Flag for planner:** confirm no NEW routes appeared in system module before freezing the permissions file for `system`.

---

## 4. Boot Sync Integration Point

**File:** `be/src/app/index.ts`
**Exact location:** Between line 159 (migrations complete) and line 162 (`userService.initializeRootUser()`).

### Current startup sequence (verified)
| # | Step | Line | Notes |
|---|---|---|---|
| 1 | Redis init | 50 | `await initRedis()` — top-level await, runs before middleware |
| 2 | Middleware (helmet/cors/session) | 53-100 | Synchronous |
| 3 | Route registration | 103-105 | `setupApiRoutes(app, { isReady })` |
| 4 | Start HTTP server | 116-141 | Inside `startServer()` |
| 5 | `checkConnection()` | 142 | DB liveness probe |
| 6 | **Knex migrations auto-run** | 146-159 | `k.migrate.latest()` — THE anchor point |
| 7 | **Root user bootstrap** | 162 | `userService.initializeRootUser()` |
| 8 | LLM provider seed (D-07) | 165-169 | `llmProviderService.seedSystemEmbeddingProvider()` |
| 9 | System tools init | 172 | `systemToolsService.initialize()` |
| 10 | Cron cleanup | 173 | `cronService.startCleanupJob()` |
| 11 | Parsing scheduler | 174 | `cronService.initParsingSchedulerFromConfig()` |
| 12 | Sync scheduler | 175 | `syncSchedulerService.init()` |
| 13 | `startupReady = true` | 179 | Readiness gate flipped for `/health` |
| 14 | `server.listen()` | 186-196 | Accept traffic |

### Where sync must go
Immediately after line 159 (`log.info('Knex migrations completed successfully')`) and **before** line 162 (`userService.initializeRootUser()`). Rationale:
- The `permissions` table must exist (migrations have run).
- Sync must complete before root user creation so the root user can be granted `super-admin` permissions from the freshly synced catalog (though Phase 1 does NOT yet change root user creation — that's a Phase 3 concern).
- Sync must complete before cron/scheduler init because future cron jobs may check permissions.

### Recommended insertion
```ts
// Line 159 ends: log.info('Knex migrations completed successfully')

// --- Phase 1 addition ---
// Sync the code-side permission registry into the DB catalog.
// Runs after migrations to guarantee the `permissions` table exists,
// and before root-user bootstrap so downstream services see a populated catalog.
try {
  await syncPermissionRegistry()
} catch (err) {
  log.error('Failed to sync permission registry', { error: err })
  process.exit(1)   // fail fast: registry/DB drift is a boot-time invariant
}
// --- end Phase 1 addition ---

// Line 162: await userService.initializeRootUser()
```

### Failure mode
Phase 1 sync should be **fail-fast** at boot (like the migration block at 152-158): if the upsert fails for any reason, the server exits with non-zero. This matches the existing pattern for migration failure. A warm-DB restart that sees "0 changes" is the success signal from TS3.

### Stale row removal
TS3 says "Removes stale rows (permissions in DB but not in registry) **only after a confirmation log line**." Recommendation: log `warn` level with the list of keys to be removed, then delete. On the first Phase 1 boot there will be NO stale rows (the table is freshly created). Stale removal only matters at Phase 2+.

---

## 5. Tenant_id Denormalization Plan (P1.2 Backfill)

### The join path
```
resource_grants (renamed from knowledge_base_entity_permissions)
  .knowledge_base_id → knowledge_bases.id
  → knowledge_bases.tenant_id ✓ (source of truth)
```

Verified: `knowledge_bases` (renamed from `projects`) carries `tenant_id` per `initial_schema.ts` (original `projects` table definition) — all entity-permissions rows have a valid parent KB via the ON DELETE CASCADE FK, so orphans should not exist. The backfill can assume `knowledge_base_id IS NOT NULL` on every row.

### The backfill SQL (sketch)
```ts
// Phase 1.2 — 20260408120000_backfill_resource_grants_tenant_id.ts

/**
 * @description Populate tenant_id on resource_grants by joining knowledge_bases.
 * Idempotent: only updates rows where tenant_id IS NULL.
 */
export async function up(knex: Knex): Promise<void> {
  // Idempotent update: only rows that haven't been backfilled yet.
  const result = await knex.raw(`
    UPDATE resource_grants rg
       SET tenant_id = kb.tenant_id
      FROM knowledge_bases kb
     WHERE rg.knowledge_base_id = kb.id
       AND rg.tenant_id IS NULL
  `)

  // Guard against orphans (rows whose parent KB was hard-deleted before CASCADE ran — should be zero due to FK)
  const orphans = await knex('resource_grants').whereNull('tenant_id').count('* as n').first()
  if (orphans && Number(orphans.n) > 0) {
    throw new Error(`resource_grants backfill: ${orphans.n} orphan rows with NULL tenant_id — manual cleanup required`)
  }
}

export async function down(knex: Knex): Promise<void> {
  // Clear the backfill; the column itself is dropped by P1.1 down().
  await knex('resource_grants').update({ tenant_id: null })
}
```

### Sequencing subtlety — the NOT NULL chicken/egg
If P1.1 adds `tenant_id text NOT NULL` in a single migration, the ALTER will **fail** on existing rows because they have no value yet. Standard pattern:
1. **P1.1** adds `tenant_id text NULL` + the new columns + the rename.
2. **P1.2** runs backfill UPDATE.
3. **P1.2 (same file, after backfill)** runs `ALTER TABLE resource_grants ALTER COLUMN tenant_id SET NOT NULL` and adds the tenant-consistency CHECK constraint.

This keeps both migrations reversible and means P1.2 is the gate that flips the column to NOT NULL.

### `entity_type='category'` case
Per `KB_CATEGORY_MODEL.md` line 27, `document_categories` has NO `tenant_id` column. The chain for category grants is:
```
entity_permissions.entity_id → document_categories.id → document_categories.knowledge_base_id → knowledge_bases.tenant_id
```
**But:** the grant row ALSO has `knowledge_base_id` directly (the parent KB was always stored), so we can skip the `document_categories` hop entirely. The UPDATE above works for both `entity_type='category'` and `entity_type='knowledge_base'` rows uniformly.

### Orphan handling
The FK `knowledge_base_id → knowledge_bases.id ON DELETE CASCADE` (`initial_schema.ts:1255`) means orphaned grant rows are impossible by construction. The backfill can safely assume 1:1 join. The orphan guard above is defensive-only; it should never fire.

---

## 6. Reversibility & Rollback Design

Every migration MUST have a working `down()` — TS1 acceptance: "rollback is reversible; existing rows survive."

### P1.1 — Create + rename + add columns
**`up()` order:**
1. `createTable('permissions')`
2. `createTable('role_permissions')`
3. `createTable('user_permission_overrides')`
4. `knex.raw('ALTER TABLE knowledge_base_entity_permissions RENAME TO resource_grants')`
5. Add columns: `tenant_id text NULL`, `action text[]` (or singular — Open Q §2), `expires_at timestamptz NULL`
6. Create indexes: `tenant_id`, `(resource_type, resource_id)` (new name, but note: column is still `entity_type` until P1.2 or a follow-up; see Open Q §5), `expires_at` partial index WHERE NOT NULL

**`down()` order (strict reverse):**
1. Drop new indexes
2. Drop new columns (`expires_at`, `action`/`actions`, `tenant_id`)
3. `knex.raw('ALTER TABLE resource_grants RENAME TO knowledge_base_entity_permissions')`
4. `dropTable('user_permission_overrides')`
5. `dropTable('role_permissions')`
6. `dropTable('permissions')`

### P1.2 — Backfill tenant_id and flip NOT NULL
**`up()`:** backfill UPDATE + `ALTER COLUMN tenant_id SET NOT NULL` + add CHECK constraint.
**`down()`:** drop CHECK + `ALTER COLUMN tenant_id DROP NOT NULL` + null out `tenant_id` (so re-running P1.1 down() succeeds).

### P1.5 — Seed role_permissions
**`up()`:** `INSERT ... ON CONFLICT DO NOTHING` into `role_permissions` from LEGACY_TO_NEW expansion.
**`down()`:** `DELETE FROM role_permissions` (safe because no other migration inserts into this table before Phase 2).

### What CANNOT be rolled back
- Data loss from `permission_level='none'` rows being dropped during the `permission_level → actions[]` transform. Recommendation: **do NOT drop these rows** in Phase 1 — leave them with `actions = '{}'` (empty array) so they roundtrip cleanly. The ability engine in Phase 2 will treat empty-actions rows as no-op.
- The full data transform `permission_level → actions[]` is a separate concern — recommendation: do NOT transform existing rows in P1.1 at all. P1.1 only **adds** the `actions` column. A follow-up migration (P1.2b or Phase 3-era) populates `actions` from `permission_level`. This keeps P1.1 perfectly reversible. **Flag for planner: open question §6.**

---

## 7. Type-safe `definePermissions()` Helper API

### Goals
- Each module writes ONE call to `definePermissions()` exporting its feature's permission set.
- The set of all registered keys becomes a union type at compile time.
- Adding a key anywhere requires zero changes outside that one file.
- The central registry can enumerate all keys for boot sync and catalog endpoint.
- Key uniqueness across modules: a clash must produce a compile error.

### Proposed API

```ts
// be/src/shared/permissions/registry.ts

/**
 * @description Spec for a single permission entry.
 * @property {string} label - Human-readable label for admin UI
 * @property {string} [description] - Optional longer description
 */
export interface PermissionSpec {
  readonly label: string
  readonly description?: string
}

/**
 * @description A namespaced set of permissions for one feature module.
 * Keys are action names (e.g. 'view', 'create'); the full permission key
 * at runtime is `${feature}.${action}`.
 */
export type PermissionsMap<F extends string> = Readonly<Record<string, PermissionSpec>>

/**
 * @description Register a feature's permissions. Returns a frozen object whose keys
 * are the fully-qualified permission keys (`<feature>.<action>`) and whose values
 * are the specs. The returned object is auto-registered into the central registry
 * as a side effect of module import.
 *
 * @param {F} feature - The feature namespace (e.g. 'users', 'knowledge_base')
 * @param {M} map - The action → spec map for this feature
 * @returns A type-safe object with keys `${F}.${keyof M}` pointing to specs
 *
 * @example
 * export const USER_PERMISSIONS = definePermissions('users', {
 *   view:   { label: 'View users' },
 *   create: { label: 'Create users' },
 *   edit:   { label: 'Edit users' },
 *   delete: { label: 'Delete users' },
 * } as const)
 *
 * // Type of USER_PERMISSIONS is:
 * //   { readonly 'users.view': PermissionSpec, readonly 'users.create': PermissionSpec, ... }
 */
export function definePermissions<
  F extends string,
  M extends Readonly<Record<string, PermissionSpec>>
>(
  feature: F,
  map: M
): { readonly [K in keyof M as `${F}.${K & string}`]: M[K] } {
  const out = {} as Record<string, PermissionSpec>
  for (const [action, spec] of Object.entries(map)) {
    const key = `${feature}.${action}`
    // Detect duplicate registration at boot time — catches the case where two
    // modules accidentally claim the same feature namespace.
    if (ALL_PERMISSIONS.has(key)) {
      throw new Error(`Duplicate permission key registered: ${key}`)
    }
    ALL_PERMISSIONS.set(key, { ...spec, feature, action })
    out[key] = spec
  }
  return out as { readonly [K in keyof M as `${F}.${K & string}`]: M[K] }
}

/** Runtime registry populated by side-effect of module imports. */
export const ALL_PERMISSIONS = new Map<string, PermissionSpec & { feature: string; action: string }>()

/**
 * @description Get all registered permissions (for boot sync and catalog endpoint).
 * Safe to call only after all module `*.permissions.ts` files have been imported.
 */
export function getAllPermissions(): ReadonlyMap<string, PermissionSpec & { feature: string; action: string }> {
  return ALL_PERMISSIONS
}
```

### The central index
A new file `be/src/shared/permissions/index.ts` re-exports `definePermissions`, `getAllPermissions`, and eagerly imports every `<feature>.permissions.ts` file to populate the registry before `syncPermissionRegistry()` is called:

```ts
// be/src/shared/permissions/index.ts
export { definePermissions, getAllPermissions, type PermissionSpec } from './registry.js'
export { syncPermissionRegistry } from './sync.js'

// Eager imports — the side effects of these files populate ALL_PERMISSIONS.
import '@/modules/agents/agents.permissions.js'
import '@/modules/audit/audit.permissions.js'
import '@/modules/broadcast/broadcast.permissions.js'
// ... 22 lines total (auth has no permissions → no file)
// ... Actually 21 files since `auth` has none.
```

### Compile-time uniqueness
The `definePermissions()` return type is `{ [K in keyof M as \`${F}.${K & string}\`]: M[K] }`. Because each module calls it with a unique `feature` literal, the resulting objects have disjoint key sets. The union type across all modules is obtained by:

```ts
import { USER_PERMISSIONS } from '@/modules/users/users.permissions.js'
import { KB_PERMISSIONS } from '@/modules/knowledge-base/knowledge-base.permissions.js'
// ...

export type PermissionKey =
  | keyof typeof USER_PERMISSIONS
  | keyof typeof KB_PERMISSIONS
  | /* ... */
```

This is deferred to Phase 3 (where `requirePermission(key: PermissionKey)` needs the type). Phase 1 only needs the registry to be populated at runtime; the compile-time union can wait.

### Runtime uniqueness
The `throw` inside `definePermissions` at duplicate detection catches the case where two modules both claim `users.view` (impossible with typed feature namespaces, but cheap insurance).

---

## 8. `manage_users` Expansion Table (for P1.5 seed)

From `PERMISSION_INVENTORY.md` "Day-One Seed" row and `MIGRATION_PLAN.md:44`. The legacy `manage_users` legacy key is **overloaded** as a writer gate across multiple modules (R-8). The day-one seed must expand it into every key that currently protects a `manage_users`-gated route, so behavior is preserved.

### Legacy `manage_users` currently protects:
| Module | File:line | Target keys |
|---|---|---|
| users | `users.routes.ts:49` GET / | `users.view` |
| users | `users.routes.ts:58` POST / | `users.create` |
| users | `users.routes.ts:68` GET /ip-history | `users.view_ip` |
| users | `users.routes.ts:75` GET /:id/ip-history | `users.view_ip` |
| users | `users.routes.ts:82` GET /:id/sessions | `users.view_sessions` |
| users | `users.routes.ts:93` PUT /:id | `users.edit` (NOTE: also has `requireAbility('manage','User')` — R-7 mixed mode) |
| users | `users.routes.ts:106` DELETE /:id | `users.delete` |
| users | `users.routes.ts:118` role-change | `users.assign_role` |
| users | `users.routes.ts:130` perm-change | `users.assign_perms` |
| teams | `teams.routes.ts` (8 routes) | `teams.view`, `teams.create`, `teams.edit`, `teams.delete`, `teams.members`, `teams.permissions` |
| chat | `chat-assistant.routes.ts:32` | `chat_assistants.view` |
| chat | `chat-assistant.routes.ts:69` | `chat_assistants.create` |
| chat | `chat-assistant.routes.ts:82` | `chat_assistants.edit` |
| chat | `chat-assistant.routes.ts:95` | `chat_assistants.edit` (PATCH) |
| chat | `chat-assistant.routes.ts:108` | `chat_assistants.delete` |
| chat | `chat-embed.routes.ts:37,50,63` | `chat_assistants.embed` |
| search | `search.routes.ts:37,74,87,100,113` | `search_apps.{view,create,edit,delete}` |
| search | `search-embed.routes.ts:38,51,64` | `search_apps.embed` |

### Complete `manage_users → new keys` seed (for P1.5)
```
users.view, users.create, users.edit, users.delete,
users.view_ip, users.view_sessions, users.assign_role, users.assign_perms,
teams.view, teams.create, teams.edit, teams.delete, teams.members, teams.permissions,
chat_assistants.view, chat_assistants.create, chat_assistants.edit, chat_assistants.delete, chat_assistants.embed,
search_apps.view, search_apps.create, search_apps.edit, search_apps.delete, search_apps.embed
```

This matches `MIGRATION_PLAN.md:44` **plus** the chat and search keys (MIGRATION_PLAN.md line 44 under-enumerates — it only lists users + teams). **Correction flagged for planner:** the complete expansion must include chat_assistants and search_apps. Otherwise, admins lose the ability to create chat assistants / search apps on day one, breaking TS4 parity.

### Other legacy keys (from `MIGRATION_PLAN.md:45-57`)
The other 12 legacy keys (`manage_system`, `manage_knowledge_base`, `manage_datasets`, `manage_storage`, `manage_model_providers`, `view_chat`, `view_search`, `view_history`, `view_analytics`, `view_system_tools`, `storage:read/write/delete`) expand straightforwardly and are already listed in `MIGRATION_PLAN.md` step (b). Phase 1 plan can reference that file verbatim for those.

### Role → legacy permissions (current state, verified from `rbac.ts:113-164`)
- `super-admin`: ALL 13 legacy keys
- `admin`: same as super-admin (identical list) — verified `rbac.ts:131-147`
- `leader`: `['view_chat','view_search','view_history','manage_users','manage_datasets','view_analytics','view_system_tools']`
- `user`: `['view_chat','view_search','view_history']`

The P1.5 migration must compute `role_permissions` rows = `{role} × expand_legacy(ROLE_PERMISSIONS[role])` with `ON CONFLICT (role, permission_key) DO NOTHING` so rerunning is idempotent.

---

## 9. Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | Vitest (BE workspace) |
| Config file | `be/vitest.config.ts` (verified: `be/tests/` directory exists per `MIGRATION_PLAN.md` references to `be/tests/projects/`, `be/tests/chat/` etc.) |
| Quick run command | `npm run test -w be -- --run <pattern>` |
| Full suite command | `npm run test -w be` |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| TS1 | Fresh DB: `npm run db:migrate` runs cleanly, creates 4 tables + renames 1 | integration | `npm run test -w be -- --run tests/permissions/migrations.test.ts` | ❌ Wave 0 |
| TS1 | Snapshot DB: existing `knowledge_base_entity_permissions` rows survive the rename | integration | same file, second `describe` | ❌ Wave 0 |
| TS1 | Rollback works: down() reverses every migration without data loss on empty rows | integration | same file, `.rollback` case | ❌ Wave 0 |
| TS1 | Backfill: after P1.2, `tenant_id` is populated on every row and `NOT NULL` constraint holds | integration | same file, post-backfill assertion | ❌ Wave 0 |
| TS2 | All 22 modules have a `*.permissions.ts` file and `getAllPermissions()` includes ≥N entries (~120 keys per inventory) | unit | `npm run test -w be -- --run tests/permissions/registry.test.ts` | ❌ Wave 0 |
| TS2 | `definePermissions()` rejects duplicate keys at registration | unit | same file | ❌ Wave 0 |
| TS2 | `be` builds clean (`npm run build -w be`) — not a test, a CI step | build | `npm run build -w be` | ✅ exists (`be/package.json`) |
| TS3 | Fresh DB: first boot populates `permissions` table with all registry keys | integration | `npm run test -w be -- --run tests/permissions/sync.test.ts` | ❌ Wave 0 |
| TS3 | Warm DB: second boot is a no-op (0 inserts, 0 deletes) | integration | same file | ❌ Wave 0 |
| TS3 | Stale key in DB (not in registry) → logged + removed | integration | same file | ❌ Wave 0 |
| TS4 | `role_permissions` seed produces N rows matching legacy ROLE_PERMISSIONS expansion | integration | `npm run test -w be -- --run tests/permissions/role-seed.test.ts` | ❌ Wave 0 |
| TS4 | Every user who had `manage_users` now has all 23 new keys expanded | integration | same file, fixture check for admin role | ❌ Wave 0 |
| TS4 | Seed is idempotent (rerunning produces 0 new rows) | integration | same file | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -w be -- --run tests/permissions/` (fast — only the new test files)
- **Per wave merge:** `npm run test -w be` (full BE suite to catch regressions)
- **Phase gate:** Full BE suite + `npm run build -w be` + manual `npm run db:migrate && npm run db:migrate:rollback` round-trip on a dev DB

### Wave 0 Gaps
- [ ] `be/tests/permissions/` directory — does not exist yet
- [ ] `be/tests/permissions/migrations.test.ts` — covers TS1
- [ ] `be/tests/permissions/registry.test.ts` — covers TS2
- [ ] `be/tests/permissions/sync.test.ts` — covers TS3
- [ ] `be/tests/permissions/role-seed.test.ts` — covers TS4
- [ ] Test fixture: a seeded `knowledge_base_entity_permissions` row snapshot for the rename round-trip test (use Vitest + Knex test DB)
- [ ] Shared test utility: helper that creates a temp PG schema, runs migrations up to a specific point, and returns a Knex handle (may already exist in `be/tests/` — planner should grep before writing)

---

## 10. Environment Availability

Phase 1 is code + migrations only. External dependencies audit:

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js 22+ | BE build, tests | ✓ (project-wide requirement) | 22+ | — |
| PostgreSQL 17 | Migrations + tests | ✓ (infra service, Docker) | 17-alpine | Dev can use any PG 13+ but migrations target PG-specific features (`knex.raw`) |
| npm workspaces | Monorepo build | ✓ | — | — |
| Knex 3.x | Migrations | ✓ (already in `be/package.json`) | — | — |
| Vitest | Tests | ✓ (already in `be/package.json`) | — | — |

**No new external dependencies for Phase 1.** No Python-side changes (R-3 verified). No new OS tools required.

---

## 11. Runtime State Inventory

Phase 1 is a rename + additive schema change. Runtime state audit:

| Category | Items Found | Action Required |
|---|---|---|
| **Stored data** | (a) `knowledge_base_entity_permissions` rows stored in PG — these survive the rename via `ALTER TABLE RENAME TO` (metadata-only op per `20260402000000_...ts:7-8`). (b) After rename, `actions` column is empty `[]` — existing `permission_level` is preserved untouched for safety. | P1.1 rename preserves rows automatically. P1.2 backfills `tenant_id`. Follow-up (deferred) transforms `permission_level` → `actions[]`. |
| **Live service config** | None. Permissions are not stored in any external service (no n8n, Datadog, Tailscale, etc.) | None — verified by absence of any such integration in `.planning/codebase/INTEGRATIONS.md`. |
| **OS-registered state** | None. No Task Scheduler / systemd / pm2 references to permission keys. | None — verified by grep of `.planning/codebase/` docs. |
| **Secrets and env vars** | None. Permission keys are not env-var-driven. `be/.env` has DB/session/CORS config but no permission state. | None. |
| **Build artifacts / installed packages** | (a) BE TypeScript compile cache in `be/dist/` — will be regenerated on next build; (b) test DB schema in dev postgres may be stale if devs have an old snapshot — manual `db:migrate:rollback && db:migrate` covers it. | Inform devs in plan: rebuild BE (`npm run build -w be`) and run migrations after pulling Phase 1 branch. |

**Canonical question check:** *"After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered?"* — Answer: only Postgres itself, and the `ALTER TABLE RENAME TO` + backfill migrations handle that completely. There are no Redis keys, no OpenSearch indices, no Peewee tables, and no cron jobs that store the string `knowledge_base_entity_permissions` outside the DB schema itself. ✓

---

## 12. Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Migration timestamp | Don't pick timestamps by hand | `npm run db:migrate:make <name>` | Guarantees monotonic ordering and matches project convention |
| Column rename | Don't use Knex `.renameColumn()` | `knex.raw('ALTER TABLE ... RENAME COLUMN ...')` | Knex bug #933 drops DEFAULT constraints — documented in existing rename migration header |
| UPSERT for sync | Don't emulate with SELECT-then-INSERT | `.onConflict(['key']).merge()` | Knex + PG support native UPSERT; see `MIGRATION_PLAN.md:73` for the `ignore()` pattern |
| Ensuring idempotent DDL | Don't try/catch "already exists" errors | `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` | Standard PG idiom; see `20260402130000_...ts:18-36` |
| Transaction in migration | Don't manually `BEGIN/COMMIT` via raw SQL | Knex runs migrations in an implicit transaction | The existing migration file doesn't wrap in explicit txn and it still rolls back on error |
| Type-safe const union | Don't duplicate a hand-written union type | `definePermissions` template-literal return type | TypeScript template literals compute the union from the spec automatically |

---

## 13. Common Pitfalls

### Pitfall 1: NOT NULL constraint added in the same statement as column create
**Problem:** `ALTER TABLE resource_grants ADD COLUMN tenant_id text NOT NULL` fails on existing rows.
**Fix:** Add as NULL in P1.1, backfill in P1.2, then flip NOT NULL in P1.2 after backfill.
**Warning sign:** Migration fails with "column contains null values" on `npm run db:migrate` against the snapshot DB.

### Pitfall 2: `ALTER TABLE ... RENAME` runs in same txn as new-column ALTERs
**Problem:** PostgreSQL locks the table for the rename; other workers may stall.
**Mitigation:** Phase 1 runs at boot before traffic — no concurrency risk. But in production the deploy must be during a maintenance window or with a brief blocking moment. The rename is metadata-only (fast) per the existing rename migration, so this is a non-issue in practice.
**Warning sign:** Deploy log shows the migration taking > 5 seconds on the rename.

### Pitfall 3: Boot sync runs BEFORE migrations
**Problem:** If the insertion point for `syncPermissionRegistry()` is placed above the `k.migrate.latest()` block, the `permissions` table doesn't exist yet and sync crashes the server.
**Fix:** Insert at line 160 (after log "Knex migrations completed successfully"), NOT higher up.
**Warning sign:** Boot log shows "relation permissions does not exist".

### Pitfall 4: Stale-row removal on first boot
**Problem:** On the very first Phase 1 boot, the `permissions` table is empty — there are no stale rows, but sync code that logs "removing 0 stale rows" is noisy.
**Fix:** Only log stale removals when the set is non-empty.

### Pitfall 5: Registry file imports form a cycle
**Problem:** If `<feature>.permissions.ts` imports anything from `<feature>/index.ts` (the barrel), you get a cycle because the barrel re-exports the permissions file.
**Fix:** `*.permissions.ts` files MUST import ONLY from `@/shared/permissions/registry.js`. Keep them purely declarative — no imports from their own module barrel.
**Warning sign:** TypeScript reports circular dependency or the registry appears empty at runtime.

### Pitfall 6: Test DB reuses a previous migration state
**Problem:** Vitest test runners reuse a shared dev DB; a previous test's half-applied Phase 1 migration leaves schema in an undefined state.
**Fix:** Use a per-test-file temporary schema or `beforeAll` that runs `migrate.rollback({ all: true })` then `migrate.latest()`.

### Pitfall 7: `definePermissions` called at file load but feature file never imported
**Problem:** If a `<feature>.permissions.ts` file exists but no code imports it, the side-effect registration never happens and the feature's keys are missing from the catalog.
**Fix:** The central `be/src/shared/permissions/index.ts` has explicit `import` lines for all 21 permission files (auth has none). A unit test asserts the count of registered keys matches a minimum expected value (~120).

---

## 14. Risks Specific to This Phase

### Risk A: Backfill on production-scale data
**Scope:** `resource_grants` backfill UPDATE joins `knowledge_bases`. If the snapshot has millions of rows, the UPDATE could take minutes.
**Probability:** LOW (grant tables are typically small — order of hundreds to low thousands).
**Mitigation:** Plan includes a row-count log BEFORE the UPDATE so the operator can size-check.

### Risk B: Concurrent migration on HA deploy
**Scope:** Multi-replica deploys where two BE instances start simultaneously could both try `migrate.latest()`.
**Status:** This is a PRE-EXISTING condition, not Phase 1 introduced. Knex uses a `knex_migrations_lock` table with advisory locks — only one replica runs migrations at a time. Verified by the fact that the existing boot sequence has run this way across multiple rollouts already.
**Mitigation:** None needed for Phase 1. Document in plan as "inherited, not introduced."

### Risk C: Boot-sync failure crashes the server on warm DB
**Scope:** If the sync service has a bug that throws on an already-synced DB, every restart fails.
**Mitigation:** TS3 mandates idempotency. The sync logic must:
1. Compute `registry_keys` as a Set.
2. Compute `db_keys` as a Set (`SELECT key FROM permissions`).
3. `to_insert = registry_keys \ db_keys` — upsert these (handles the race too).
4. `to_remove = db_keys \ registry_keys` — log + delete.
5. `to_update = registry_keys ∩ db_keys` — selectively `UPDATE ... WHERE label changed OR description changed`.

The `to_update` step is where most bugs hide. Recommendation: for Phase 1, do NOT `UPDATE` existing rows (only insert new ones). Label/description drift can wait — TS3 only requires "upserts every registry entry into the `permissions` table (idempotent)" and idempotent = "no-op on warm DB".

### Risk D: The `action` singular vs `actions` plural disagreement
**Scope:** REQUIREMENTS.md TS1 says `action text`; MIGRATION_PLAN.md and KB_CATEGORY_MODEL.md sketch `actions text[]`. Picking wrong means P1.1 needs to change shape later.
**Mitigation:** See Open Question §2. Planner MUST resolve this before writing the P1.1 migration. My strong recommendation: **`actions text[]`** — matches the downstream consumer sketches, avoids row multiplication, supports the `permission_level → actions` transform cleanly. If we pick `action text`, a single grant row with `view + edit` becomes TWO rows, breaking the unique constraint.

### Risk E: `document_categories.knowledge_base_id` rename timing
**Scope:** P1.1 rename happens BEFORE the Knex `.knowledge_base_id` column finishes propagating; but the rename migration at `20260402000000_...ts:30-31` ALREADY renamed this column. Verified in the git commits. No Phase 1 concern.
**Mitigation:** None needed.

### Risk F: Registry file boilerplate burden
**Scope:** 21 new files (`auth` has none) = 21 PRs-worth of scaffolding. Each must be correct.
**Mitigation:** Phase 1 plan should include a single Wave that generates all 21 files from a template, sourced verbatim from `PERMISSION_INVENTORY.md`. This is mechanical — one task per file, each a ~20 line stub.

---

## 15. Open Questions

1. **Does Phase 1 migrate `knowledge_base_permissions` (the KB-level grants table) into `resource_grants`?**
   - What we know: `ROADMAP.md:28` P1.2 text says "migrate `knowledge_base_permissions` (KB-level grants) into `resource_grants`".
   - What's unclear: `REQUIREMENTS.md` TS1 only mentions renaming `knowledge_base_entity_permissions`; it does NOT mention `knowledge_base_permissions`. `MIGRATION_PLAN.md` step (d) discusses it as a future backfill.
   - The `knowledge_base_permissions` table schema is different: has `tab_documents`, `tab_chat`, `tab_settings` columns (not `entity_type`/`permission_level`). See `initial_schema.ts:1081-1100`. Transforming this into `resource_grants.actions` is non-trivial.
   - **Recommendation:** DEFER to a follow-up migration (Phase 3 era). Phase 1 should ONLY rename `knowledge_base_entity_permissions`. The `knowledge_base_permissions` table stays untouched until the planner explicitly confirms a mapping. **Planner must ask the user before P1.2.**

2. **`action text` vs `actions text[]`?**
   - REQUIREMENTS.md TS1 says singular `action text`.
   - MIGRATION_PLAN.md and KB_CATEGORY_MODEL.md sketches use plural `actions text[]`.
   - **Recommendation:** `actions text[]` — see Risk D. Planner MUST flag this decision in PLAN.md and obtain user confirmation before writing P1.1.

3. **Does `agents` module map to any legacy permission?**
   - `PERMISSION_INVENTORY.md` §1 shows agents uses `requireAbility('read|manage','Agent')` today — ABAC, not RBAC. No legacy key maps here.
   - Day-one seed for `agents.*` keys: who gets them? Probably super-admin + admin (since ABAC `manage` allows them today). Leader? User?
   - **Recommendation:** Seed `agents.view / create / edit / delete / run` for `admin` and `super-admin`. No access for `leader` or `user`. This is an interpretation of current behavior since ABAC is tenant+ownership scoped, not role scoped. **Planner should confirm at plan time.**

4. **Does `memory` module need legacy→new mapping?**
   - Same as agents: currently pure ABAC (`requireAbility('manage','Memory')`). No legacy role key.
   - **Recommendation:** Seed `memory.*` for admin + super-admin only.

5. **Is `entity_type` column renamed to `resource_type` in Phase 1 or later?**
   - The downstream design (`KB_CATEGORY_MODEL.md` §"Implication for resource_grants table design") expects `resource_type` as the column name.
   - A rename IS a schema change and would have to happen in P1.1.
   - **Recommendation:** Rename `entity_type → resource_type` and `entity_id → resource_id` in P1.1 (two `knex.raw('ALTER TABLE ... RENAME COLUMN ...')` calls). This keeps the schema consistent with downstream consumers. Existing values (`'category', 'chat', 'search'`) stay as-is — Phase 2+ will translate at read time. Alternatively, add a separate mapping column. **Planner decide; recommend rename.**

6. **Is `permission_level → actions[]` transform part of P1.2 or deferred?**
   - If we transform in P1.2, rollback requires reverse transform — complex.
   - If we defer, the ability engine in Phase 2 needs a read-time fallback that reads `permission_level` when `actions` is empty.
   - **Recommendation:** DEFER the transform. P1.2 adds `actions text[] DEFAULT '{}'`. Phase 2's V2 builder reads from `actions` OR falls back to `permission_level`. This keeps P1.1/P1.2 perfectly reversible. **Planner confirm.**

---

## 16. Sources

### Primary (HIGH confidence) — direct file reads
- `be/src/app/index.ts:1-244` — boot sequence, migration point
- `be/src/shared/db/migrations/20260312000000_initial_schema.ts:33, 85-100, 1081-1100, 1220-1280` — existing schema
- `be/src/shared/db/migrations/20260402000000_rename_projects_to_knowledge_base.ts:1-60` — rename migration style
- `be/src/shared/db/migrations/20260402130000_add_missing_indexes_for_crud_and_fk_lookups.ts:1-52` — recent migration style reference
- `be/src/shared/config/rbac.ts:1-208` — current ROLE_PERMISSIONS map (authoritative for P1.5 seed)
- `be/src/shared/constants/roles.ts:1-43` — UserRole + TeamRole
- `ls be/src/modules/` — 22 modules confirmed
- `CLAUDE.md`, `be/CLAUDE.md` — project conventions, boot sequence, layering rules

### Primary (HIGH confidence) — planning docs
- `.planning/REQUIREMENTS.md` TS1–TS4, Decisions Locked
- `.planning/ROADMAP.md` Phase 1 section (lines 22–40)
- `.planning/research/KB_CATEGORY_MODEL.md` — entity-permissions schema
- `.planning/research/MIGRATION_PLAN.md` — backfill steps + LEGACY_TO_NEW
- `.planning/research/PERMISSION_INVENTORY.md` — per-module registry seed
- `.planning/research/RISKS.md` — R-3, R-5, R-7, R-8

### Secondary (MEDIUM confidence)
- `PERMISSION_INVENTORY.md` line numbers for route files — these are cited in that document but not re-verified in this research. Planner should re-grep at plan time since the repo has unstaged changes in `be/src/modules/system/`.

### Tertiary (LOW confidence)
- None. Every claim in this document cites a specific file or planning doc.

---

## 17. State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Hand-pick migration timestamps | `npm run db:migrate:make <name>` | Project convention | Avoid ordering bugs |
| `knex.schema.renameColumn()` | `knex.raw('ALTER TABLE ... RENAME COLUMN ...')` | Since Knex bug #933 surfaced | Avoid DEFAULT loss |
| Per-migration explicit transaction | Rely on Knex implicit per-file txn | Project convention | Simpler migrations |
| Hardcoded role-branch logic in `ability.service.ts` | DB-backed `permissions` + `role_permissions` registry | This milestone (Phase 1–3) | This phase lays the foundation |

**Deprecated/outdated:**
- Static `Permission` union type in `rbac.ts:62-76` — becomes `string` during cutover (R-1), removed at milestone end.

---

## 18. Metadata

**Confidence breakdown:**
- Knex conventions & migration style: HIGH — direct file citations
- Existing `knowledge_base_entity_permissions` shape: HIGH — `initial_schema.ts:1236-1261` read verbatim
- Boot sequence integration point: HIGH — `be/src/app/index.ts` read in full
- `users.role` default correction: HIGH — `initial_schema.ts:33` verified (defaults to `'user'`, NOT `'member'` as `MIGRATION_PLAN.md` claimed)
- 22-module list: HIGH — `ls be/src/modules/` matches inventory exactly
- Per-route inventory line numbers: MEDIUM — delegated to `PERMISSION_INVENTORY.md`, not re-verified (unstaged changes in `be/src/modules/system/` are the only concern)
- `definePermissions()` API design: HIGH for TypeScript mechanics, MEDIUM for final naming (subject to user review)
- Open questions (§15): LOW — require user/planner decision before coding

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (30 days — schema decisions are stable; rerun if the inventory is edited or new modules land)
