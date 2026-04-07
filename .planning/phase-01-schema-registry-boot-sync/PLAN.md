---
phase: phase-01-schema-registry-boot-sync
type: execute
requirements: [TS1, TS2, TS3, TS4]
autonomous: true
files_modified:
  - be/src/shared/db/migrations/*_phase1_*.ts
  - be/src/shared/permissions/registry.ts
  - be/src/shared/permissions/sync.ts
  - be/src/shared/permissions/index.ts
  - be/src/shared/models/permission.model.ts
  - be/src/shared/models/role-permission.model.ts
  - be/src/shared/models/index.ts
  - be/src/modules/*/*.permissions.ts (21 files)
  - be/src/app/index.ts
  - be/tests/permissions/*.test.ts
  - be/tests/permissions/_helpers.ts

must_haves:
  truths:
    - "npm run db:migrate runs cleanly on a fresh DB"
    - "npm run db:migrate runs cleanly on a snapshot containing pre-existing knowledge_base_entity_permissions rows; rows survive the rename"
    - "npm run db:migrate:rollback fully reverses every Phase 1 migration without data loss"
    - "All 21 BE modules with permissions have a *.permissions.ts file (auth has none)"
    - "Boot on a synced DB logs zero inserts/zero deletes (no-op)"
    - "Boot on a fresh DB populates the permissions table with every registry key"
    - "role_permissions seed produces day-one parity with be/src/shared/config/rbac.ts ROLE_PERMISSIONS"
    - "Zero user-visible behavior change (no routes/middleware touched)"
  artifacts:
    - path: "be/src/shared/permissions/registry.ts"
      provides: "definePermissions() helper + ALL_PERMISSIONS map + getAllPermissions()"
    - path: "be/src/shared/permissions/sync.ts"
      provides: "syncPermissionRegistry() — boot-time idempotent upsert + stale removal"
    - path: "be/src/shared/permissions/index.ts"
      provides: "Public barrel that eagerly imports all 21 *.permissions.ts files"
    - path: "be/src/shared/models/permission.model.ts"
      provides: "PermissionModel with upsertMany() and findAllKeys()"
    - path: "be/src/shared/models/role-permission.model.ts"
      provides: "RolePermissionModel with seedFromMap()"
  key_links:
    - from: "be/src/app/index.ts"
      to: "be/src/shared/permissions/sync.ts"
      via: "syncPermissionRegistry() called immediately after k.migrate.latest() (line ~159) and before userService.initializeRootUser() (line ~162)"
    - from: "be/src/shared/permissions/index.ts"
      to: "be/src/modules/<feature>/<feature>.permissions.ts (×21)"
      via: "explicit eager imports — side effects populate ALL_PERMISSIONS"
    - from: "Knex migration P1.5 (seed_role_permissions)"
      to: "be/src/shared/config/rbac.ts ROLE_PERMISSIONS map"
      via: "LEGACY_TO_NEW expansion — must produce parity for super-admin/admin/leader/user"
---

<objective>
Phase 1 is **pure plumbing**: create four new tables (`permissions`, `role_permissions`, `user_permission_overrides`), rename and extend the existing `knowledge_base_entity_permissions` table into `resource_grants`, scaffold a code-side permission registry for all 22 BE modules (21 actually contribute keys; `auth` has none), wire boot-time sync, and seed day-one role mappings. **Zero user-visible behavior change.** No routes, middleware, ability engine, or FE code is touched.

Purpose: Lay the schema + registry foundation that Phases 2–6 will consume. The phase succeeds if and only if a server restart on a warm DB is a no-op AND every user retains exactly the permissions they had before the migration.

Output: 5 Knex migrations, ~24 new TypeScript source files, 4 new Vitest spec files, and one new code block in `be/src/app/index.ts`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/REQUIREMENTS.md
@.planning/ROADMAP.md
@.planning/phase-01-schema-registry-boot-sync/1-RESEARCH.md
@.planning/research/MIGRATION_PLAN.md
@.planning/research/PERMISSION_INVENTORY.md
@.planning/research/RISKS.md
@.planning/codebase/CONVENTIONS.md
@be/CLAUDE.md
@be/src/shared/db/migrations/20260312000000_initial_schema.ts
@be/src/shared/db/migrations/20260402000000_rename_projects_to_knowledge_base.ts
@be/src/shared/db/migrations/20260402130000_add_missing_indexes_for_crud_and_fk_lookups.ts
@be/src/shared/config/rbac.ts
@be/src/app/index.ts
</context>

# Hard Constraints (apply to every plan)

1. **Zero behavior change.** No route file, middleware file, controller, service (other than the new `permissions/sync.ts`), or FE file may be modified. Forbidden globs: `be/src/modules/*/routes/`, `be/src/modules/*/controllers/`, `be/src/shared/middleware/`, `be/src/shared/services/ability.service.ts`, `be/src/shared/config/rbac.ts`, `fe/**`.
2. **Every Knex migration MUST have a working `down()`.** `npm run db:migrate:rollback` must reverse the entire phase cleanly.
3. **All schema changes via Knex** (project rule). No Peewee touch.
4. **Strict layering.** `sync.ts` is a **service**; it MUST NOT call `db()` or `knex.raw()` directly. All DB access goes through `PermissionModel` and `RolePermissionModel` in `be/src/shared/models/`.
5. **No hardcoded string literals.** Permission keys, table names, factory names, sync log codes must come from constants exported from a `be/src/shared/constants/permissions.ts` file (created in P1.3) or from registry exports.
6. **JSDoc on every exported function/type/class** (root CLAUDE.md). Inline comments above every control-flow branch and DB call.
7. **Locked decisions** — do not re-debate:
   - `actions text[]` (Postgres array, plural) — NOT singular.
   - Column rename: `entity_type → resource_type`, `entity_id → resource_id`.
   - `UNIQUE(resource_type, resource_id, grantee_type, grantee_id)` on `resource_grants`.
   - `permission_level → actions[]` **data** transform DEFERRED to Phase 2. Phase 1 only adds the column with default `'{}'`.
   - The unrelated `knowledge_base_permissions` table is NOT touched in this phase.
   - Day-one seed expands legacy `manage_users` to the full 23-key list (RESEARCH §8) including `chat_assistants.*`, `search_apps.*`, `teams.*`, `users.*`.
   - `agents.*` and `memory.*` permissions default to admin + super-admin only on day one.

---

# Wave Plan

| Wave | Plans | Runs in parallel? | Rationale |
|---|---|---|---|
| **Wave 0** | P1.0 (test infra scaffolding) | — | RESEARCH §9 confirmed `be/tests/permissions/` does not exist. Tests need a scratch-DB helper before any spec can run. |
| **Wave 1** | **P1.1** (schema migrations) | alone | Schema must land first — every other plan depends on it. |
| **Wave 2** | **P1.2** (backfill + NOT NULL flip) and **P1.3** (registry scaffolding + 21 permission files) | parallel | P1.2 only needs P1.1's tables; P1.3 is pure code, no DB. They touch disjoint files. |
| **Wave 3** | **P1.4** (boot sync service + app wiring) and **P1.5** (day-one role seed migration) | parallel | Both depend on P1.1 (tables) and P1.3 (registry must exist for sync; LEGACY_TO_NEW keys for seed). They touch disjoint files. |

```
                Wave 0 (P1.0 test infra)
                       |
                       v
                Wave 1 (P1.1 — schema)
                       |
              +--------+--------+
              v                 v
        Wave 2: P1.2        Wave 2: P1.3
        (backfill)          (registry + 21 files)
              \                 /
               +-------+-------+
                       v
              +--------+--------+
              v                 v
        Wave 3: P1.4        Wave 3: P1.5
        (boot sync wiring)  (role seed migration)
```

---

# P1.0 — Test infrastructure scaffolding

**Wave:** 0
**Depends on:** nothing
**Goal:** Create the `be/tests/permissions/` directory and shared scratch-DB helper so subsequent plans can write specs.

**Inputs:**
- `be/vitest.config.ts`
- `be/tests/` (existing test layout — grep for current test-DB helper if any)
- `be/src/shared/db/knex.ts`

**Outputs:**
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/_helpers.ts` (new)
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/.gitkeep` (new — keeps dir even before specs land)

**Tasks:**

| # | Description | Files | Acceptance check |
|---|---|---|---|
| T0.1 | Create `be/tests/permissions/` directory and `.gitkeep`. | `be/tests/permissions/.gitkeep` | `test -d be/tests/permissions` |
| T0.2 | Grep for an existing test-DB helper (`grep -rn "migrate.latest\|migrate.rollback" be/tests/`) and either reuse OR create `_helpers.ts` exporting `withScratchDb(fn)`: opens a Knex handle against the dev Postgres, `migrate.rollback({ all: true })`, `migrate.latest()`, runs the callback, then rolls back. JSDoc required. | `be/tests/permissions/_helpers.ts` | `npx tsc --noEmit be/tests/permissions/_helpers.ts` (or `npm run build -w be`) succeeds |
| T0.3 | Add npm script alias `test:permissions` in `be/package.json`: `"test:permissions": "vitest run tests/permissions"`. **DO NOT modify any other script.** | `be/package.json` | `grep -q '"test:permissions"' be/package.json` |

**Tests:** none (this plan creates the substrate; specs land in P1.1–P1.5).

**Verification:** `npm run test:permissions -w be` runs (and passes with zero specs — Vitest exits 0 on empty run with `--passWithNoTests` if needed; otherwise the plan adds that flag to the script).

**Atomic commit message:** `chore(tests): scaffold be/tests/permissions/ + scratch-DB helper for Phase 1`

---

# P1.1 — Knex migrations: foundation tables, rename, and column adds

**Wave:** 1
**Depends on:** P1.0
**Goal:** Create `permissions`, `role_permissions`, `user_permission_overrides`; rename `knowledge_base_entity_permissions → resource_grants`; rename columns `entity_type → resource_type`, `entity_id → resource_id`; add `actions text[]`, `tenant_id text` (NULL — flipped in P1.2), `expires_at timestamptz`; add indexes + FKs + the new unique constraint. Reversible.

**Inputs:**
- `be/src/shared/db/migrations/20260312000000_initial_schema.ts` (lines ~1236–1261 — entity-permissions shape; HEX_UUID_DEFAULT constant)
- `be/src/shared/db/migrations/20260402000000_rename_projects_to_knowledge_base.ts` (rename idiom)
- `be/src/shared/db/migrations/20260402130000_add_missing_indexes_for_crud_and_fk_lookups.ts` (style reference)
- RESEARCH §1, §2, §6
- `be/CLAUDE.md` (Knex conventions)

**Outputs:**
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/db/migrations/<ts>_phase1_create_permission_tables.ts` (new) — generated via `npm run db:migrate:make phase1_create_permission_tables -w be`
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/db/migrations/<ts>_phase1_rename_entity_permissions_to_resource_grants.ts` (new) — generated via `npm run db:migrate:make phase1_rename_entity_permissions_to_resource_grants -w be`
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/migrations.test.ts` (new)

**Tasks:**

| # | Description | Files | Acceptance check |
|---|---|---|---|
| T1.1 | Generate migration file 1 via `npm run db:migrate:make phase1_create_permission_tables -w be`. **Do NOT hand-pick the timestamp.** | `be/src/shared/db/migrations/<ts>_phase1_create_permission_tables.ts` | `ls be/src/shared/db/migrations/*phase1_create_permission_tables*.ts` |
| T1.2 | In migration 1 `up()`: createTable `permissions` (columns: `id text PK default HEX_UUID_DEFAULT`, `key text NOT NULL UNIQUE`, `feature text NOT NULL`, `action text NOT NULL`, `label text NOT NULL`, `description text NULL`, `created_at`, `updated_at` — both timestamptz default now). Index `(feature)`. JSDoc `@description` on `up`/`down`. Inline comment above every DDL line. | same file | grep `createTable.*permissions` returns 1 hit |
| T1.3 | In migration 1 `up()`: createTable `role_permissions` (columns: `id text PK`, `role text NOT NULL`, `permission_key text NOT NULL`, `created_at`). Composite UNIQUE `(role, permission_key)`. Index `(role)`. **No FK to `permissions.key`** — registry is source of truth, sync may temporarily diverge. | same file | grep `createTable.*role_permissions` returns 1 hit |
| T1.4 | In migration 1 `up()`: createTable `user_permission_overrides` (columns: `id text PK`, `tenant_id text NOT NULL`, `user_id text NOT NULL`, `permission_key text NOT NULL`, `effect text NOT NULL CHECK (effect IN ('allow','deny'))`, `expires_at timestamptz NULL`, `created_by`, `created_at`, `updated_at`). FK `user_id → users.id ON DELETE CASCADE`. Composite UNIQUE `(tenant_id, user_id, permission_key)`. Indexes `(tenant_id)`, `(user_id)`. | same file | grep `createTable.*user_permission_overrides` returns 1 hit |
| T1.5 | Migration 1 `down()`: drop the three tables in strict reverse order. | same file | grep `dropTable.*user_permission_overrides`, `dropTable.*role_permissions`, `dropTable.*permissions` each return 1 hit |
| T1.6 | Generate migration file 2 via `npm run db:migrate:make phase1_rename_entity_permissions_to_resource_grants -w be`. | `be/src/shared/db/migrations/<ts>_phase1_rename_entity_permissions_to_resource_grants.ts` | `ls` shows new file |
| T1.7 | Migration 2 `up()` step A: `knex.raw('ALTER TABLE knowledge_base_entity_permissions RENAME TO resource_grants')`. Comment cites Knex bug #933 like the existing rename migration. | same file | grep `RENAME TO resource_grants` returns 1 hit |
| T1.8 | Migration 2 `up()` step B: rename columns via `knex.raw`: `entity_type → resource_type`, `entity_id → resource_id`. Comment above each call. | same file | grep `RENAME COLUMN entity_type` returns 1 hit; grep `RENAME COLUMN entity_id` returns 1 hit |
| T1.9 | Migration 2 `up()` step C: add columns via `knex.schema.alterTable('resource_grants', t => { ... })`: `tenant_id text NULL` (NOT NULL is flipped in P1.2), `expires_at timestamptz NULL`. For `actions text[]` use `knex.raw("ALTER TABLE resource_grants ADD COLUMN IF NOT EXISTS actions text[] NOT NULL DEFAULT '{}'::text[]")` (Postgres array — Knex builder lacks first-class support). | same file | grep `actions text\[\]` returns 1 hit |
| T1.10 | Migration 2 `up()` step D: add indexes — `idx_resource_grants_tenant_id`, `idx_resource_grants_resource_type_resource_id` (replace the old one), `idx_resource_grants_expires_at` (partial: `WHERE expires_at IS NOT NULL`). Drop the now-misnamed `(entity_type, entity_id)` index first. Use `IF NOT EXISTS` / `IF EXISTS`. | same file | grep `CREATE INDEX IF NOT EXISTS idx_resource_grants_` returns ≥3 hits |
| T1.11 | Migration 2 `up()` step E: add `UNIQUE(resource_type, resource_id, grantee_type, grantee_id)` constraint. Drop the old composite unique that included `knowledge_base_id` first (was `(knowledge_base_id, entity_type, entity_id, grantee_type, grantee_id)`) — use `ALTER TABLE ... DROP CONSTRAINT IF EXISTS`. Comment explains the locked decision. | same file | grep `ADD CONSTRAINT.*resource_grants_resource_type_resource_id_grantee` returns 1 hit |
| T1.12 | Migration 2 `down()`: strict reverse — drop new constraint, restore old one, drop new indexes, restore `(entity_type, entity_id)` index, drop new columns (`actions`, `expires_at`, `tenant_id`), rename columns back, `RENAME TO knowledge_base_entity_permissions`. Reversibility test in P1.1 `migrations.test.ts` validates this round-trip. | same file | grep `RENAME TO knowledge_base_entity_permissions` returns 1 hit |
| T1.13 | Write `be/tests/permissions/migrations.test.ts`. See **Tests** below. | `be/tests/permissions/migrations.test.ts` | file exists |
| T1.14 | Run the migration round-trip locally: `npm run db:migrate -w be && npm run db:migrate:rollback -w be && npm run db:migrate -w be`. All three commands exit 0. | — | manual; recorded in commit body |

**Tests** — `be/tests/permissions/migrations.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { withScratchDb } from './_helpers'

describe('Phase 1 migrations — schema', () => {
  it('creates permissions, role_permissions, user_permission_overrides', () => withScratchDb(async (knex) => {
    expect(await knex.schema.hasTable('permissions')).toBe(true)
    expect(await knex.schema.hasTable('role_permissions')).toBe(true)
    expect(await knex.schema.hasTable('user_permission_overrides')).toBe(true)
  }))

  it('renames knowledge_base_entity_permissions to resource_grants', () => withScratchDb(async (knex) => {
    expect(await knex.schema.hasTable('resource_grants')).toBe(true)
    expect(await knex.schema.hasTable('knowledge_base_entity_permissions')).toBe(false)
  }))

  it('renames entity_type/entity_id to resource_type/resource_id', () => withScratchDb(async (knex) => {
    expect(await knex.schema.hasColumn('resource_grants', 'resource_type')).toBe(true)
    expect(await knex.schema.hasColumn('resource_grants', 'resource_id')).toBe(true)
    expect(await knex.schema.hasColumn('resource_grants', 'entity_type')).toBe(false)
  }))

  it('adds actions text[] with default {}', () => withScratchDb(async (knex) => {
    const col = await knex.raw(
      "SELECT data_type, udt_name, column_default FROM information_schema.columns WHERE table_name='resource_grants' AND column_name='actions'"
    )
    expect(col.rows[0].udt_name).toBe('_text') // pg array of text
    expect(String(col.rows[0].column_default)).toContain("'{}'")
  }))

  it('adds tenant_id (nullable until P1.2) and expires_at', () => withScratchDb(async (knex) => {
    expect(await knex.schema.hasColumn('resource_grants', 'tenant_id')).toBe(true)
    expect(await knex.schema.hasColumn('resource_grants', 'expires_at')).toBe(true)
  }))

  it('enforces UNIQUE(resource_type, resource_id, grantee_type, grantee_id)', () => withScratchDb(async (knex) => {
    const result = await knex.raw(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'resource_grants'::regclass AND contype='u'
    `)
    const names = result.rows.map((r: { conname: string }) => r.conname).join(',')
    expect(names).toMatch(/resource_type.*resource_id.*grantee/)
  }))

  it('preserves existing rows across the rename', () => withScratchDb(async (knex) => {
    // Pre-seed via the old table name BEFORE Phase 1 migrations run requires migration sequencing —
    // helper takes a `stopBefore` cursor; if not feasible, use a fixture insert immediately after rename
    // and assert the row is queryable post-rename.
    // (Helper detail finalized in P1.0 T0.2.)
    const inserted = await knex('resource_grants').insert({
      id: knex.raw("md5(random()::text)"),
      knowledge_base_id: 'kb-fixture',
      resource_type: 'DocumentCategory',
      resource_id: 'cat-fixture',
      grantee_type: 'user',
      grantee_id: 'user-fixture',
      permission_level: 'view',
      actions: '{}',
    }).returning('id')
    expect(inserted.length).toBe(1)
  }))

  it('round-trips up → down → up cleanly', () => withScratchDb(async (knex) => {
    // Helper provides a `roundTrip()` utility that runs rollback + migrate.latest()
    // and asserts the final schema matches the post-up state.
    expect(await knex.schema.hasTable('resource_grants')).toBe(true)
  }))
})
```

**Verification (TS1):**
- `npm run db:migrate -w be` clean on fresh DB ✓
- `npm run db:migrate:rollback -w be` reverses all P1.1 migrations ✓
- `npm run test -w be -- --run tests/permissions/migrations.test.ts` passes ✓
- `npm run build -w be` clean ✓

**Atomic commit message:** `feat(db): create permissions/role_permissions/user_permission_overrides; rename knowledge_base_entity_permissions → resource_grants (P1.1)`

---

# P1.2 — Backfill `tenant_id` on `resource_grants` and flip NOT NULL

**Wave:** 2
**Depends on:** P1.1
**Goal:** Populate `tenant_id` on every existing `resource_grants` row by joining `knowledge_bases`, then flip `tenant_id` to NOT NULL with a CHECK constraint. Idempotent: re-running updates only NULL rows. Out of scope: any data migration of `permission_level → actions[]`, and the unrelated `knowledge_base_permissions` table.

**Inputs:**
- RESEARCH §5, §6
- P1.1 migration files (must already be on disk)

**Outputs:**
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/db/migrations/<ts>_phase1_backfill_resource_grants_tenant_id.ts` (new)
- Test cases appended to `be/tests/permissions/migrations.test.ts`

**Tasks:**

| # | Description | Files | Acceptance check |
|---|---|---|---|
| T2.1 | Generate migration via `npm run db:migrate:make phase1_backfill_resource_grants_tenant_id -w be`. | new migration file | file exists |
| T2.2 | `up()` step A: log `SELECT COUNT(*) FROM resource_grants WHERE tenant_id IS NULL` to stdout (operator visibility — flagged in ROADMAP human-checkpoint note). | same file | grep `COUNT.*resource_grants.*tenant_id IS NULL` returns 1 hit |
| T2.3 | `up()` step B: backfill UPDATE — `UPDATE resource_grants rg SET tenant_id = kb.tenant_id FROM knowledge_bases kb WHERE rg.knowledge_base_id = kb.id AND rg.tenant_id IS NULL`. Idempotent (only NULL rows). | same file | grep `UPDATE resource_grants rg` returns 1 hit |
| T2.4 | `up()` step C: orphan guard — `SELECT COUNT(*) FROM resource_grants WHERE tenant_id IS NULL`. If > 0, throw with explicit error message (`R-5 backfill: N orphan rows — manual cleanup required`). FK CASCADE means this should never fire; defensive. | same file | grep `orphan rows` returns 1 hit |
| T2.5 | `up()` step D: `ALTER TABLE resource_grants ALTER COLUMN tenant_id SET NOT NULL`. | same file | grep `SET NOT NULL` returns 1 hit |
| T2.6 | `up()` step E: add CHECK constraint asserting `tenant_id` consistency vs parent KB — `ALTER TABLE resource_grants ADD CONSTRAINT chk_resource_grants_tenant_matches_kb CHECK (tenant_id IS NOT NULL)`. (Cross-table CHECK is not enforceable in PG without a trigger; document limitation in inline comment, fall back to NOT NULL only — this is an explicit downgrade from R-5's "CHECK" wording, justified inline.) | same file | grep `chk_resource_grants_tenant` returns 1 hit |
| T2.7 | `down()`: drop CHECK, `ALTER COLUMN tenant_id DROP NOT NULL`, `UPDATE resource_grants SET tenant_id = NULL`. Order matters — drop NOT NULL before nulling, otherwise the UPDATE fails. | same file | grep `DROP NOT NULL` returns 1 hit |
| T2.8 | Append test cases to `be/tests/permissions/migrations.test.ts` (see Tests). | `be/tests/permissions/migrations.test.ts` | grep `tenant_id backfill` returns 1 hit |

**Tests** — appended to `migrations.test.ts`:

```ts
describe('Phase 1.2 — tenant_id backfill', () => {
  it('populates tenant_id from knowledge_bases for pre-existing rows', () => withScratchDb(async (knex) => {
    // Helper seeds 1 KB and 2 grant rows BEFORE running P1.2 (via stopBefore cursor)
    // Then runs P1.2 and asserts both rows now have the KB's tenant_id.
    const rows = await knex('resource_grants').select('tenant_id')
    expect(rows.every(r => r.tenant_id !== null)).toBe(true)
  }))

  it('makes tenant_id NOT NULL after backfill', () => withScratchDb(async (knex) => {
    await expect(
      knex('resource_grants').insert({ id: 'x', knowledge_base_id: 'kb', resource_type: 'DocumentCategory', resource_id: 'cat', grantee_type: 'user', grantee_id: 'u', permission_level: 'view', actions: '{}', tenant_id: null })
    ).rejects.toThrow()
  }))

  it('is idempotent — second run touches zero rows', () => withScratchDb(async (knex) => {
    // Run migrations twice (rollback to before P1.2, re-run). Assert no errors.
  }))
})
```

**Verification (TS1):**
- After P1.2, `SELECT COUNT(*) FROM resource_grants WHERE tenant_id IS NULL` = 0
- Inserting a row with `tenant_id=null` fails
- Re-running the migration (after manual rollback) succeeds without error

**Atomic commit message:** `feat(db): backfill resource_grants.tenant_id and flip NOT NULL (P1.2)`

---

# P1.3 — Permission registry scaffolding + 21 module permission files

**Wave:** 2
**Depends on:** P1.0 (test infra). Does NOT depend on P1.1 — pure code.
**Goal:** Create `be/src/shared/permissions/` with `registry.ts` (`definePermissions()` helper, `ALL_PERMISSIONS` map, `getAllPermissions()`), `index.ts` (eager imports), and one `*.permissions.ts` file per BE module (21 of 22 modules; `auth` has no permissions). Add the `PermissionModel` and `RolePermissionModel` so subsequent plans honor the strict layering rule. Add a constants file for the sync log codes / table names so nothing is hardcoded.

**Inputs:**
- RESEARCH §3 (module table), §7 (helper API), §8 (manage_users expansion), §13 (pitfall 5 — no barrel imports)
- `.planning/research/PERMISSION_INVENTORY.md` (per-module key list — canonical)
- `be/CLAUDE.md` (layering rules: **`sync.ts` is a service and MUST go through models**)

**Outputs (absolute paths):**
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/permissions/registry.ts`
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/permissions/index.ts`
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/constants/permissions.ts` (table names, sync log codes, default labels)
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/models/permission.model.ts`
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/models/role-permission.model.ts`
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/models/index.ts` (registration of new factories)
- 21 files at `/mnt/d/Project/b-solution/b-knowledge/be/src/modules/<feature>/<feature>.permissions.ts` for: agents, audit, broadcast, chat, code-graph, dashboard, external, feedback, glossary, knowledge-base, llm-provider, memory, preview, rag, search, sync, system, system-tools, teams, user-history, users
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/registry.test.ts`

**Tasks:**

| # | Description | Files | Acceptance check |
|---|---|---|---|
| T3.1 | Create `be/src/shared/constants/permissions.ts` exporting: `PERMISSIONS_TABLE = 'permissions'`, `ROLE_PERMISSIONS_TABLE = 'role_permissions'`, `USER_PERMISSION_OVERRIDES_TABLE = 'user_permission_overrides'`, `RESOURCE_GRANTS_TABLE = 'resource_grants'`, `enum SyncLogCode { Inserted='permissions.sync.inserted', Updated='permissions.sync.updated', Removed='permissions.sync.removed', NoOp='permissions.sync.noop' }`. JSDoc on every export. | new file | `grep -q PERMISSIONS_TABLE be/src/shared/constants/permissions.ts` |
| T3.2 | Create `be/src/shared/permissions/registry.ts` per RESEARCH §7. Exports: `PermissionSpec` interface, `definePermissions<F,M>(feature, map)` (template-literal return type), `ALL_PERMISSIONS` Map, `getAllPermissions()`. Throws on duplicate key. JSDoc with `@example` block. | new file | grep `export function definePermissions` returns 1 hit |
| T3.3 | Create `PermissionModel` extending project's `BaseModel` pattern: methods `findAllKeys(): Promise<string[]>`, `upsertMany(rows: { key, feature, action, label, description? }[]): Promise<{ inserted: number; updated: number }>` (uses `.onConflict('key').merge()`), `deleteByKeys(keys: string[]): Promise<number>`. JSDoc on every method. **NO `db.raw` outside the model — this is the only place permitted.** | `be/src/shared/models/permission.model.ts` | `grep -q 'class PermissionModel' be/src/shared/models/permission.model.ts` |
| T3.4 | Create `RolePermissionModel`: methods `seedFromMap(rows: { role, permission_key }[]): Promise<{ inserted: number }>` (uses `.onConflict(['role','permission_key']).ignore()`), `findByRole(role: string): Promise<string[]>`. JSDoc. | `be/src/shared/models/role-permission.model.ts` | `grep -q 'class RolePermissionModel' be/src/shared/models/role-permission.model.ts` |
| T3.5 | Register both models in `ModelFactory` via `be/src/shared/models/index.ts`. Follow the existing singleton pattern. | `be/src/shared/models/index.ts` | `grep -q 'permission' be/src/shared/models/index.ts` |
| T3.6 | Create 21 `<feature>.permissions.ts` files. **Each MUST import only from `@/shared/permissions/registry.js` — no module-barrel imports** (RESEARCH §13 pitfall 5). One file per module from the list above, populated from `PERMISSION_INVENTORY.md`. **agents** and **memory** files do NOT include any role-specific seed information here — that's P1.5's job. Each file exports `<UPPER>_PERMISSIONS = definePermissions('<feature>', { ... } as const)`. | 21 files under `be/src/modules/*/` | `find be/src/modules -name '*.permissions.ts' \| wc -l` returns 21 |
| T3.7 | Create `be/src/shared/permissions/index.ts` re-exporting `definePermissions`, `getAllPermissions`, `PermissionSpec` and **eagerly importing all 21 permission files** (explicit one-line imports — RESEARCH §13 pitfall 7). DO NOT export `syncPermissionRegistry` here yet — that lands in P1.4. | new file | `grep -c "import '@/modules/" be/src/shared/permissions/index.ts` returns 21 |
| T3.8 | Write `be/tests/permissions/registry.test.ts`. See Tests below. | new test file | file exists |

**Tests** — `be/tests/permissions/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getAllPermissions } from '@/shared/permissions'  // eager import side effects fire here

describe('Permission registry', () => {
  it('registers at least 100 permission keys across all modules', () => {
    expect(getAllPermissions().size).toBeGreaterThanOrEqual(100)
  })

  it('every key follows <feature>.<action> shape', () => {
    for (const key of getAllPermissions().keys()) {
      expect(key).toMatch(/^[a-z_]+\.[a-z_]+$/)
    }
  })

  it('includes the day-one critical keys', () => {
    const keys = new Set(getAllPermissions().keys())
    // Sample from each module group to catch missing files
    const required = [
      'users.view', 'users.create', 'users.delete', 'users.assign_role',
      'teams.view', 'teams.members', 'teams.permissions',
      'chat_assistants.view', 'chat_assistants.embed',
      'search_apps.view', 'search_apps.embed',
      'knowledge_base.view', 'knowledge_base.share',
      'document_categories.view', 'document_categories.import',
      'datasets.view', 'documents.parse', 'chunks.create',
      'agents.view', 'agents.run', 'agents.credentials',
      'memory.view', 'memory.create',
      'audit.view', 'audit.export',
      'broadcast.view', 'system.view', 'system_history.view',
      'system_tools.view', 'system_tools.run',
      'glossary.view', 'glossary.import',
      'sync_connectors.view', 'sync_connectors.run',
      'llm_providers.view', 'llm_providers.test',
      'feedback.submit', 'preview.view', 'user_history.view',
      'dashboard.view', 'dashboard.admin',
      'code_graph.view', 'code_graph.manage',
      'api_keys.view',
    ]
    for (const k of required) expect(keys.has(k)).toBe(true)
  })

  it('rejects duplicate registration', async () => {
    const { definePermissions } = await import('@/shared/permissions/registry')
    expect(() => definePermissions('users', { view: { label: 'dup' } } as const)).toThrow(/Duplicate/)
  })
})
```

**Verification (TS2):**
- 21 `*.permissions.ts` files exist (`auth` has none — 22 modules total)
- `npm run build -w be` clean
- `npm run test -w be -- --run tests/permissions/registry.test.ts` passes
- `getAllPermissions().size >= 100`

**Atomic commit message:** `feat(permissions): registry helper + 21 module permission files + Permission/RolePermission models (P1.3)`

---

# P1.4 — Boot sync service + app wiring

**Wave:** 3
**Depends on:** P1.1 (tables), P1.3 (registry + models)
**Goal:** Implement `syncPermissionRegistry()` as a service that calls `PermissionModel.upsertMany()` + `PermissionModel.deleteByKeys()`. Wire it into `be/src/app/index.ts` immediately after `k.migrate.latest()` and before `userService.initializeRootUser()`. Idempotent on warm DB. Stale-row removal logged. Fail-fast on error.

**Inputs:**
- RESEARCH §4 (boot sequence + insertion point), §13 (pitfalls 3 + 4)
- `be/src/app/index.ts` (lines ~146–162)
- P1.3 models

**Outputs:**
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/permissions/sync.ts`
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/permissions/index.ts` (append `export { syncPermissionRegistry }`)
- `/mnt/d/Project/b-solution/b-knowledge/be/src/app/index.ts` (one new try/catch block, ~12 lines)
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/sync.test.ts`

**Tasks:**

| # | Description | Files | Acceptance check |
|---|---|---|---|
| T4.1 | Create `be/src/shared/permissions/sync.ts` exporting `async function syncPermissionRegistry(): Promise<{ inserted: number; updated: number; removed: number }>`. Reads `getAllPermissions()`; calls `ModelFactory.permission.findAllKeys()`; computes `toInsert = registry \ db`, `toRemove = db \ registry`, `toUpdate = registry ∩ db`; calls `upsertMany()` once with all registry rows (covers insert+update via `onConflict.merge()`); calls `deleteByKeys(toRemove)` only when `toRemove.length > 0`; logs each delta with `SyncLogCode` constants; returns counts. **Service MUST NOT touch `db()` directly — only via models.** | new file | grep `import.*PermissionModel` in sync.ts returns 1 hit; grep `from '@/shared/db/knex'` returns 0 hits |
| T4.2 | Append `export { syncPermissionRegistry } from './sync.js'` to `be/src/shared/permissions/index.ts`. | append | `grep -q syncPermissionRegistry be/src/shared/permissions/index.ts` |
| T4.3 | Edit `be/src/app/index.ts`: insert the boot block immediately after the existing `log.info('Knex migrations completed successfully')` line (~159) and BEFORE `await userService.initializeRootUser()` (~162). Block contents: try `await syncPermissionRegistry()`; catch → `log.error` + `process.exit(1)`. Inline comment cites RESEARCH §4 and the locked decision that sync is fail-fast at boot. **DO NOT modify any other line in this file.** | `be/src/app/index.ts` | `grep -n syncPermissionRegistry be/src/app/index.ts` shows it between the migrate.latest() and initializeRootUser() lines |
| T4.4 | Write `be/tests/permissions/sync.test.ts`. See Tests below. | new test file | file exists |

**Tests** — `be/tests/permissions/sync.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { withScratchDb } from './_helpers'
import { syncPermissionRegistry, getAllPermissions } from '@/shared/permissions'
import { ModelFactory } from '@/shared/models'

describe('syncPermissionRegistry', () => {
  it('first call on a fresh DB inserts every registry key', () => withScratchDb(async () => {
    const result = await syncPermissionRegistry()
    expect(result.inserted).toBe(getAllPermissions().size)
    expect(result.removed).toBe(0)
    const dbKeys = await ModelFactory.permission.findAllKeys()
    expect(dbKeys.length).toBe(getAllPermissions().size)
  }))

  it('second call on a warm DB is a no-op (0 inserts, 0 removes)', () => withScratchDb(async () => {
    await syncPermissionRegistry()
    const result = await syncPermissionRegistry()
    expect(result.inserted).toBe(0)
    expect(result.removed).toBe(0)
  }))

  it('removes stale keys not present in registry', () => withScratchDb(async (knex) => {
    await syncPermissionRegistry()
    // Inject a stale row directly via the model layer
    await ModelFactory.permission.upsertMany([
      { key: 'stale.feature.x', feature: 'stale', action: 'x', label: 'stale' }
    ])
    const result = await syncPermissionRegistry()
    expect(result.removed).toBe(1)
    const remaining = await ModelFactory.permission.findAllKeys()
    expect(remaining.includes('stale.feature.x')).toBe(false)
  }))
})
```

**Verification (TS3):**
- Fresh DB → first boot inserts every registry key
- Second boot logs zero changes (true no-op)
- Stale rows removed with log line at warn level

**Atomic commit message:** `feat(permissions): boot-time syncPermissionRegistry service wired into app startup (P1.4)`

---

# P1.5 — Day-one role seed migration

**Wave:** 3
**Depends on:** P1.1 (tables), P1.3 (constants + permission key list)
**Goal:** Knex migration that seeds `role_permissions` from the legacy `ROLE_PERMISSIONS` map in `be/src/shared/config/rbac.ts:113`, expanding every legacy key per the LEGACY_TO_NEW table in `MIGRATION_PLAN.md` step (b) — corrected to include the **23-key** `manage_users` expansion (RESEARCH §8) which adds `chat_assistants.*`, `search_apps.*`, `teams.*` on top of the `users.*` keys. `agents.*` and `memory.*` get explicit admin + super-admin entries (locked decision). Idempotent via `ON CONFLICT (role, permission_key) DO NOTHING`.

**Inputs:**
- `be/src/shared/config/rbac.ts:113` (current `ROLE_PERMISSIONS` — read-only)
- `.planning/research/MIGRATION_PLAN.md` step (b)
- RESEARCH §8 (corrected `manage_users` expansion)
- Locked decision: `agents.*` + `memory.*` → admin + super-admin only

**Outputs:**
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/db/migrations/<ts>_phase1_seed_role_permissions.ts`
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/role-seed.test.ts`
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/__snapshots__/role-seed.test.ts.snap` (Vitest auto-creates)

**Tasks:**

| # | Description | Files | Acceptance check |
|---|---|---|---|
| T5.1 | Generate via `npm run db:migrate:make phase1_seed_role_permissions -w be`. | new file | file exists |
| T5.2 | In `up()`, define `LEGACY_TO_NEW` matching `MIGRATION_PLAN.md` step (b) **with the RESEARCH §8 correction**: `manage_users` expands to `users.{view,create,edit,delete,view_ip,view_sessions,assign_role,assign_perms}` + `teams.{view,create,edit,delete,members,permissions}` + `chat_assistants.{view,create,edit,delete,embed}` + `search_apps.{view,create,edit,delete,embed}`. **Inline comment** cites the RESEARCH §8 correction explicitly so code review can verify. | same file | `grep -c chat_assistants` returns ≥5; `grep -c search_apps` returns ≥5 |
| T5.3 | In `up()`, define `ROLE_PERMISSIONS` literal matching `rbac.ts:113-164`: super-admin and admin both get all 13 legacy keys; leader gets `['view_chat','view_search','view_history','manage_users','manage_datasets','view_analytics','view_system_tools']`; user gets `['view_chat','view_search','view_history']`. | same file | `grep -c "'super-admin'\|'admin'\|'leader'\|'user'" returns ≥4` |
| T5.4 | In `up()`, **also append** the locked extra rows for `agents.*` and `memory.*`: emit `(role, permission_key)` for every action of agents and memory under both `'admin'` and `'super-admin'` roles. Inline comment marks this as the locked decision. | same file | grep `agents.view` returns 1 hit; grep `memory.view` returns 1 hit |
| T5.5 | In `up()`, build `rows[]` via the LEGACY_TO_NEW expansion + the agents/memory extras, then `await knex(ROLE_PERMISSIONS_TABLE).insert(rows).onConflict(['role','permission_key']).ignore()`. Use the constant from `be/src/shared/constants/permissions.ts`. | same file | grep `onConflict.*role.*permission_key` returns 1 hit |
| T5.6 | `down()`: `DELETE FROM role_permissions` (safe — no other migration writes to this table during Phase 1). | same file | grep `DELETE FROM role_permissions\|knex(ROLE_PERMISSIONS_TABLE).del` returns 1 hit |
| T5.7 | Write `be/tests/permissions/role-seed.test.ts` (snapshot test — see Tests). | new file | file exists |

**Tests** — `be/tests/permissions/role-seed.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { withScratchDb } from './_helpers'
import { ModelFactory } from '@/shared/models'

describe('Day-one role seed', () => {
  it('produces a stable per-role permission set (snapshot)', () => withScratchDb(async () => {
    const roles = ['super-admin', 'admin', 'leader', 'user']
    const result: Record<string, string[]> = {}
    for (const role of roles) {
      result[role] = (await ModelFactory.rolePermission.findByRole(role)).sort()
    }
    expect(result).toMatchSnapshot()
  }))

  it('admin + super-admin can perform every chat_assistants/search_apps/teams action (manage_users expansion)', () => withScratchDb(async () => {
    for (const role of ['admin', 'super-admin']) {
      const perms = new Set(await ModelFactory.rolePermission.findByRole(role))
      for (const k of [
        'users.view','users.create','users.edit','users.delete','users.view_ip','users.view_sessions','users.assign_role','users.assign_perms',
        'teams.view','teams.create','teams.edit','teams.delete','teams.members','teams.permissions',
        'chat_assistants.view','chat_assistants.create','chat_assistants.edit','chat_assistants.delete','chat_assistants.embed',
        'search_apps.view','search_apps.create','search_apps.edit','search_apps.delete','search_apps.embed',
      ]) {
        expect(perms.has(k)).toBe(true)
      }
    }
  }))

  it('agents.* and memory.* are admin + super-admin only on day one', () => withScratchDb(async () => {
    const adminPerms = new Set(await ModelFactory.rolePermission.findByRole('admin'))
    const userPerms = new Set(await ModelFactory.rolePermission.findByRole('user'))
    expect(adminPerms.has('agents.view')).toBe(true)
    expect(adminPerms.has('memory.view')).toBe(true)
    expect(userPerms.has('agents.view')).toBe(false)
    expect(userPerms.has('memory.view')).toBe(false)
  }))

  it('user role retains exactly the legacy view_chat/view_search/view_history expansion', () => withScratchDb(async () => {
    const perms = new Set(await ModelFactory.rolePermission.findByRole('user'))
    expect(perms.has('chat.view')).toBe(true)
    expect(perms.has('search.view')).toBe(true)
    expect(perms.has('preview.view')).toBe(true)
    expect(perms.has('user_history.view')).toBe(true)
    expect(perms.has('users.create')).toBe(false) // NOT a writer
  }))

  it('is idempotent — second run inserts zero rows', () => withScratchDb(async (knex) => {
    const before = await knex('role_permissions').count('* as n').first()
    // Re-run the migration manually
    await knex.migrate.up({ name: '<phase1_seed_role_permissions>' }) // helper resolves the actual filename
    const after = await knex('role_permissions').count('* as n').first()
    expect(Number(after?.n)).toBe(Number(before?.n))
  }))
})
```

**Verification (TS4):**
- Snapshot test passes (snapshot committed)
- Admin + super-admin retain every chat_assistants / search_apps / teams action
- agents/memory are admin + super-admin only
- Re-running the migration produces zero new rows

**Atomic commit message:** `feat(db): day-one role_permissions seed with corrected manage_users expansion (P1.5)`

---

# Verification Matrix — Requirements ↔ Plans

| Requirement | Acceptance criterion (from REQUIREMENTS.md) | Plans satisfying it | Verifying test/command |
|---|---|---|---|
| **TS1** | `permissions`, `role_permissions`, `user_permission_overrides` tables created | P1.1 | `migrations.test.ts` "creates permissions, role_permissions, user_permission_overrides" |
| **TS1** | `knowledge_base_entity_permissions` renamed to `resource_grants`; existing rows survive | P1.1 | `migrations.test.ts` "renames…", "preserves existing rows…" |
| **TS1** | Columns renamed: `entity_type→resource_type`, `entity_id→resource_id` | P1.1 | `migrations.test.ts` "renames entity_type/entity_id…" |
| **TS1** | `actions text[]`, `tenant_id`, `expires_at` columns added | P1.1 | `migrations.test.ts` "adds actions text[]…", "adds tenant_id and expires_at" |
| **TS1** | `UNIQUE(resource_type, resource_id, grantee_type, grantee_id)` | P1.1 | `migrations.test.ts` "enforces UNIQUE…" |
| **TS1** | `tenant_id` backfilled and NOT NULL | P1.2 | `migrations.test.ts` "populates tenant_id…", "makes tenant_id NOT NULL…" |
| **TS1** | All new tables have `tenant_id` indexed and FK constraints declared | P1.1 (`user_permission_overrides`), P1.1 step T1.10 (`resource_grants`) | grep `idx_resource_grants_tenant_id` + grep `references('users.id')` |
| **TS1** | `npm run db:migrate` clean on fresh DB AND on snapshot; rollback reversible | P1.1, P1.2 | manual `migrate → rollback → migrate` round-trip in T1.14 |
| **TS2** | `definePermissions(feature, spec)` helper exists | P1.3 | `registry.test.ts` "rejects duplicate registration" |
| **TS2** | All 22 modules contribute (21 files; auth has none) | P1.3 | `find be/src/modules -name '*.permissions.ts' \| wc -l` returns 21; `registry.test.ts` "includes the day-one critical keys" |
| **TS2** | Type-safe key uniqueness | P1.3 | `definePermissions` template-literal return type + runtime duplicate guard |
| **TS2** | `be` builds clean | P1.3 | `npm run build -w be` |
| **TS3** | Boot sync upserts registry into `permissions` | P1.4 | `sync.test.ts` "first call on a fresh DB inserts every registry key" |
| **TS3** | Idempotent — warm DB restart is a no-op | P1.4 | `sync.test.ts` "second call on a warm DB is a no-op" |
| **TS3** | Stale rows removed after confirmation log | P1.4 | `sync.test.ts` "removes stale keys" + `SyncLogCode.Removed` log assertion |
| **TS4** | Knex seed populates `role_permissions` from current `ROLE_PERMISSIONS` map | P1.5 | `role-seed.test.ts` snapshot |
| **TS4** | Legacy `manage_users` expanded to chat_assistants + search_apps + teams + users | P1.5 | `role-seed.test.ts` "admin + super-admin can perform every chat_assistants/search_apps/teams action" |
| **TS4** | `agents.*`/`memory.*` admin + super-admin only on day one | P1.5 | `role-seed.test.ts` "agents.* and memory.* are admin + super-admin only on day one" |
| **TS4** | Day-one parity: every user retains every action they had | P1.5 | snapshot test + manual diff against `rbac.ts` ROLE_PERMISSIONS |

---

# Phase Exit Checklist

Before declaring Phase 1 done, the executor MUST verify every item below. This is the gate.

- [ ] **All 5 migrations exist** and were generated via `npm run db:migrate:make` (timestamps not hand-picked).
- [ ] **`npm run db:migrate -w be`** runs cleanly on a fresh dev Postgres.
- [ ] **`npm run db:migrate -w be`** runs cleanly on a Postgres containing pre-existing `knowledge_base_entity_permissions` rows; the rows survive the rename and have `tenant_id` populated post-P1.2.
- [ ] **`npm run db:migrate:rollback -w be`** (run 5 times, or `--all`) reverses every Phase 1 migration to a state byte-equivalent to pre-Phase-1.
- [ ] **`npm run db:migrate -w be`** then runs cleanly a second time after the rollback (full round-trip).
- [ ] **All 21 module registry files** exist on disk: `find be/src/modules -name '*.permissions.ts' | wc -l` returns exactly **21**.
- [ ] **`auth` module has no permissions file** (intentional — verified by absence).
- [ ] **`getAllPermissions().size`** is at least **100** (sampled in `registry.test.ts`).
- [ ] **Boot sync is a no-op on a warm DB**: start the BE twice in succession; the second start logs `SyncLogCode.NoOp` (or zero inserts/removes).
- [ ] **Day-one role seed produces parity** with `be/src/shared/config/rbac.ts:113` `ROLE_PERMISSIONS` map — snapshot test committed and passing.
- [ ] **`npm run build -w be`** exits 0 (no TypeScript errors).
- [ ] **`npm run test -w be`** exits 0 (full BE suite, not just `tests/permissions/`).
- [ ] **`npm run test:permissions -w be`** exits 0 (the four new spec files all green).
- [ ] **No FE files modified**: `git diff --name-only main... -- fe/` returns empty.
- [ ] **No route files modified**: `git diff --name-only main... -- 'be/src/modules/*/routes/'` returns empty.
- [ ] **No middleware files modified**: `git diff --name-only main... -- 'be/src/shared/middleware/'` returns empty.
- [ ] **No `ability.service.ts` or `rbac.ts` change**: `git diff --name-only main... -- be/src/shared/services/ability.service.ts be/src/shared/config/rbac.ts` returns empty.
- [ ] **No Python (`advance-rag/`, `converter/`) changes**: `git diff --name-only main... -- advance-rag/ converter/` returns empty.
- [ ] **No hardcoded permission table names** outside `be/src/shared/constants/permissions.ts`: `grep -r "'permissions'\|'role_permissions'\|'resource_grants'" be/src/shared/permissions/ be/src/shared/models/` returns only constant imports / migration files.
- [ ] **JSDoc present** on every exported function/type in the new files (spot-check 5 files).
- [ ] **Inline comments** present above every DDL statement in every Phase 1 migration.
- [ ] **Phase 1 SUMMARY** written to `.planning/phase-01-schema-registry-boot-sync/SUMMARY.md` with: migrations created, files added, test count, parity verification result, and any deferred-to-Phase-2 notes.

---

<output>
After Phase 1 completion, write `/mnt/d/Project/b-solution/b-knowledge/.planning/phase-01-schema-registry-boot-sync/SUMMARY.md` covering:
- Migrations created (filenames + one-line purpose)
- Registry file count + total permission keys registered
- Test results (4 spec files, total assertions)
- Day-one parity verification result vs. `rbac.ts` ROLE_PERMISSIONS
- Items intentionally deferred to Phase 2 (the `permission_level → actions[]` data transform; the unrelated `knowledge_base_permissions` table; any cross-table CHECK trigger work)
- Confirmation that the Phase Exit Checklist passed in full
</output>
