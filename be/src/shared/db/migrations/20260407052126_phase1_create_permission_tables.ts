/**
 * @fileoverview Phase 1 / P1.1 — Create the three foundation tables for the
 * permission-system overhaul: `permissions`, `role_permissions`, and
 * `user_permission_overrides`.
 *
 * No FK from `role_permissions.permission_key` to `permissions.key` is declared:
 * the in-code registry is the source of truth and the boot-time sync may
 * temporarily diverge during deploys; a hard FK would deadlock that flow.
 */
import type { Knex } from 'knex'

// Reuse the same hex-uuid default expression used by the initial schema so
// every primary key in the codebase shares one canonical generator.
// Must stay in sync with `HEX_UUID_DEFAULT` in 20260312000000_initial_schema.ts.
const HEX_UUID_DEFAULT = "REPLACE(gen_random_uuid()::TEXT, '-', '')"

/**
 * @description Create `permissions`, `role_permissions`, and
 *   `user_permission_overrides` tables for the permission-system overhaul.
 * @param {Knex} knex - Knex migration context.
 * @returns {Promise<void>} Resolves once all three tables exist.
 */
export async function up(knex: Knex): Promise<void> {
  // -----------------------------------------------------------------------
  // 1. `permissions` — canonical catalog of every permission key the app
  //    knows about. Populated by the boot-time registry sync (P1.4).
  // -----------------------------------------------------------------------
  await knex.schema.createTable('permissions', (table) => {
    // Hex UUID primary key, generated DB-side via the shared default.
    table.text('id').primary().defaultTo(knex.raw(HEX_UUID_DEFAULT))
    // Globally-unique permission key, e.g. `kb.view`. Application code
    // references permissions by key, never by id.
    table.text('key').notNullable().unique()
    // Owning feature/module (`kb`, `chat`, `agents`, ...). Used for grouping
    // in the admin UI and for cheap feature-scoped lookups.
    table.text('feature').notNullable()
    // Action verb (`view`, `create`, `edit`, `delete`). Kept as a column to
    // avoid re-parsing the key on every authorization check.
    table.text('action').notNullable()
    // CASL subject (e.g. `KnowledgeBase`, `Chat`, `Agent`). Phase 2's CASL
    // ability builder reads `(action, subject)` to emit `can(action, subject)`
    // rules — without this column the engine cannot construct CASL calls.
    table.text('subject').notNullable()
    // Human-readable label, surfaced in the admin matrix UI.
    table.text('label').notNullable()
    // Optional long-form description for tooltips / docs.
    table.text('description')
    // Standard audit timestamps.
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

    // Index on `feature` powers the "list permissions for feature X" query
    // used by the admin matrix and by the registry sync diff step.
    table.index('feature', 'idx_permissions_feature')
  })

  // -----------------------------------------------------------------------
  // 2. `role_permissions` — which permission keys are granted to which role.
  //    Seeded in P1.5 from the legacy ROLE_PERMISSIONS map.
  // -----------------------------------------------------------------------
  await knex.schema.createTable('role_permissions', (table) => {
    // Hex UUID primary key for stable row identity in the admin UI.
    table.text('id').primary().defaultTo(knex.raw(HEX_UUID_DEFAULT))
    // Role name (`admin`, `leader`, `user`, ...). Plain text — the roles
    // enum lives in code and is enforced at the service layer.
    table.text('role').notNullable()
    // Permission key as referenced by the registry. NO FK to permissions.key
    // — registry is source of truth; sync may temporarily diverge.
    table.text('permission_key').notNullable()
    // Optional tenant scope. NULL means "applies to all tenants — global role
    // default" (the day-one seed shipped by P1.5). A non-NULL value layers a
    // tenant-specific role customization on top of the global default.
    table.text('tenant_id').nullable()
    // Standard audit timestamp; updated_at is intentionally omitted because
    // role_permissions rows are immutable (delete + recreate on change).
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())

    // One row per (role, permission_key, tenant_id). The tenant_id column is
    // part of the key so a global default (tenant_id IS NULL) can coexist
    // with tenant-specific overrides for the same role+key pair.
    table.unique(['role', 'permission_key', 'tenant_id'], {
      indexName: 'role_permissions_role_permission_key_tenant_id_unique',
    })
    // Index on (role, tenant_id) accelerates the hot-path "load all perms
    // for role within tenant" query run on every ability build.
    table.index(['role', 'tenant_id'], 'idx_role_permissions_role_tenant_id')
  })

  // -----------------------------------------------------------------------
  // 3. `user_permission_overrides` — per-user allow / deny overrides that
  //    layer on top of role_permissions. CASL precedence: deny > allow.
  // -----------------------------------------------------------------------
  await knex.schema.createTable('user_permission_overrides', (table) => {
    table.text('id').primary().defaultTo(knex.raw(HEX_UUID_DEFAULT))
    // Tenant scope — overrides never cross tenants. NOT NULL because every
    // user belongs to exactly one tenant at write time.
    table.text('tenant_id').notNullable()
    // Target user.
    table.text('user_id').notNullable()
    // Permission key being overridden.
    table.text('permission_key').notNullable()
    // `allow` adds the permission, `deny` masks it. CHECK constraint enforces
    // the closed enum at the DB layer in addition to the service layer.
    table.text('effect').notNullable()
    // Optional expiry; the ability builder skips expired overrides.
    table.timestamp('expires_at', { useTz: true })
    // Audit columns.
    table.text('created_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

    // FK to users with cascade — when a user is deleted their overrides go
    // with them. Tenant_id is denormalized so we never need to JOIN here.
    table.foreign('user_id').references('users.id').onDelete('CASCADE')

    // One override per (tenant, user, key, effect). A user MAY have both an
    // `allow` row and a `deny` row for the same permission key — CASL
    // semantics make deny win, so both can coexist meaningfully. The unique
    // key prevents duplicate rows of the same effect only.
    table.unique(['tenant_id', 'user_id', 'permission_key', 'effect'], {
      indexName: 'user_permission_overrides_tenant_user_key_effect_unique',
    })
    // Hot-path lookup indexes.
    table.index('tenant_id', 'idx_user_permission_overrides_tenant_id')
    table.index('user_id', 'idx_user_permission_overrides_user_id')
  })

  // CHECK constraint on `effect` is added via raw SQL because Knex's column
  // builder cannot express CHECK constraints in PostgreSQL.
  await knex.raw(
    `ALTER TABLE user_permission_overrides
       ADD CONSTRAINT user_permission_overrides_effect_check
       CHECK (effect IN ('allow', 'deny'))`,
  )
}

/**
 * @description Drop the three permission-system tables in strict reverse
 *   order so dependent constraints unwind cleanly.
 * @param {Knex} knex - Knex migration context.
 * @returns {Promise<void>} Resolves once all tables are gone.
 */
export async function down(knex: Knex): Promise<void> {
  // Reverse of `up()` — drop the table that depends on `users` first, then
  // the two free-standing tables. CHECK constraint is dropped implicitly.
  await knex.schema.dropTableIfExists('user_permission_overrides')
  await knex.schema.dropTableIfExists('role_permissions')
  await knex.schema.dropTableIfExists('permissions')
}
