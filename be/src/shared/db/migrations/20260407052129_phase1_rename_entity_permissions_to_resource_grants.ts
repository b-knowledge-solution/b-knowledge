/**
 * @fileoverview Phase 1 / P1.1 — Rename `knowledge_base_entity_permissions`
 * to `resource_grants`, rename its `entity_*` columns to `resource_*`, and
 * add the new columns (`actions text[]`, `tenant_id`, `expires_at`) plus
 * indexes and the new uniqueness constraint required by the permission
 * overhaul.
 *
 * All `ALTER TABLE … RENAME` statements are issued via `knex.raw()` to avoid
 * the Knex `.renameColumn()` bug (#933) which silently drops DEFAULT
 * constraints — same approach used by 20260402000000_rename_projects_to_knowledge_base.ts.
 *
 * The legacy `permission_level → actions[]` data transform is intentionally
 * NOT performed here; that lands in P1.2 where the new ability engine begins
 * consuming the column. This migration is therefore trivially reversible.
 */
import type { Knex } from 'knex'

/**
 * @description Rename `knowledge_base_entity_permissions` to `resource_grants`,
 *   rename its `entity_type` / `entity_id` columns to `resource_type` /
 *   `resource_id`, and add `actions`, `tenant_id`, `expires_at` columns plus
 *   the new indexes and uniqueness constraint.
 * @param {Knex} knex - Knex migration context.
 * @returns {Promise<void>} Resolves once the schema reshape is complete.
 */
export async function up(knex: Knex): Promise<void> {
  // -----------------------------------------------------------------------
  // Step A: rename the table itself. Postgres preserves FK constraints,
  // indexes, sequences, and unique constraints automatically (their names
  // remain the originals from the initial schema, e.g.
  // `project_entity_permissions_*`). We rely on dynamic lookup below.
  // ALTER … RENAME is metadata-only — no data is rewritten.
  // -----------------------------------------------------------------------
  await knex.raw('ALTER TABLE knowledge_base_entity_permissions RENAME TO resource_grants')

  // -----------------------------------------------------------------------
  // Step B: rename the two domain columns. Raw SQL — see Knex bug #933.
  // -----------------------------------------------------------------------
  // entity_type → resource_type (the kind of resource being granted access to).
  await knex.raw('ALTER TABLE resource_grants RENAME COLUMN entity_type TO resource_type')
  // entity_id → resource_id (the specific row id of that resource).
  await knex.raw('ALTER TABLE resource_grants RENAME COLUMN entity_id TO resource_id')

  // -----------------------------------------------------------------------
  // Step C: add the new columns.
  // -----------------------------------------------------------------------
  // `actions text[]` — Postgres array of action verbs. Knex's column builder
  // has no first-class support for native arrays so we issue raw SQL.
  // Default `'{}'` matches the test spec; the data backfill in P1.2 will
  // populate it from the legacy `permission_level` column.
  await knex.raw(
    "ALTER TABLE resource_grants ADD COLUMN IF NOT EXISTS actions text[] NOT NULL DEFAULT '{}'::text[]",
  )

  // `tenant_id` is added NULL here; P1.2 backfills it via JOIN through
  // knowledge_bases and then flips the column to NOT NULL.
  // `expires_at` enables time-bounded grants honored by the ability builder.
  await knex.schema.alterTable('resource_grants', (table) => {
    table.text('tenant_id').nullable()
    table.timestamp('expires_at', { useTz: true }).nullable()
  })

  // -----------------------------------------------------------------------
  // Step D: indexes. Drop the now-misnamed legacy indexes — Postgres
  // preserved their original names from the `project_entity_permissions`
  // era — and replace them with ones keyed on the new column names.
  // Use IF EXISTS so reruns are safe.
  // -----------------------------------------------------------------------
  await knex.raw('DROP INDEX IF EXISTS project_entity_permissions_entity_type_entity_id_index')
  await knex.raw('DROP INDEX IF EXISTS project_entity_permissions_grantee_type_grantee_id_index')
  await knex.raw('DROP INDEX IF EXISTS project_entity_permissions_project_id_index')

  // New indexes named after the new table.
  // Tenant scoping: every authorization query filters by tenant_id first.
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_resource_grants_tenant_id ON resource_grants(tenant_id)')
  // Resource lookup: "who has access to this category?" type queries.
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS idx_resource_grants_resource_type_resource_id ON resource_grants(resource_type, resource_id)',
  )
  // Grantee lookup: "what does this user/team have access to?" type queries.
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS idx_resource_grants_grantee_type_grantee_id ON resource_grants(grantee_type, grantee_id)',
  )
  // Partial index on expires_at — most rows are NULL, so a partial index
  // keeps the structure tiny while still accelerating the cron sweep.
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS idx_resource_grants_expires_at ON resource_grants(expires_at) WHERE expires_at IS NOT NULL',
  )

  // -----------------------------------------------------------------------
  // Step E: replace the legacy 5-column unique constraint with the new
  // 4-column one. Locked decision (REQUIREMENTS TS1): one grant row per
  // principal × resource — the kb scope is encoded in resource_type now.
  // The legacy constraint name is the one Postgres preserved from the
  // `project_entity_permissions` era.
  // -----------------------------------------------------------------------
  await knex.raw(
    'ALTER TABLE resource_grants DROP CONSTRAINT IF EXISTS project_entity_permissions_project_id_entity_type_entity_id_grantee_type_grantee_id_unique',
  )
  await knex.raw(
    `ALTER TABLE resource_grants
       ADD CONSTRAINT resource_grants_resource_type_resource_id_grantee_type_grantee_id_unique
       UNIQUE (resource_type, resource_id, grantee_type, grantee_id)`,
  )
}

/**
 * @description Strict reverse of `up()`: drop the new constraint, restore
 *   the legacy 5-column one, drop the new indexes, restore the legacy
 *   indexes, drop the new columns, rename the columns back, and finally
 *   rename the table back to `knowledge_base_entity_permissions`.
 * @param {Knex} knex - Knex migration context.
 * @returns {Promise<void>} Resolves once the legacy schema is restored.
 */
export async function down(knex: Knex): Promise<void> {
  // Drop the new uniqueness constraint first so the column drops below do
  // not trip on a dependent constraint.
  await knex.raw(
    'ALTER TABLE resource_grants DROP CONSTRAINT IF EXISTS resource_grants_resource_type_resource_id_grantee_type_grantee_id_unique',
  )

  // Drop the new indexes by name; safe with IF EXISTS for partial reruns.
  await knex.raw('DROP INDEX IF EXISTS idx_resource_grants_expires_at')
  await knex.raw('DROP INDEX IF EXISTS idx_resource_grants_grantee_type_grantee_id')
  await knex.raw('DROP INDEX IF EXISTS idx_resource_grants_resource_type_resource_id')
  await knex.raw('DROP INDEX IF EXISTS idx_resource_grants_tenant_id')

  // Drop the new columns. `actions` is dropped via raw to mirror its add.
  await knex.schema.alterTable('resource_grants', (table) => {
    table.dropColumn('expires_at')
    table.dropColumn('tenant_id')
  })
  await knex.raw('ALTER TABLE resource_grants DROP COLUMN IF EXISTS actions')

  // Rename columns back to their legacy names BEFORE renaming the table —
  // inverse order of `up()`.
  await knex.raw('ALTER TABLE resource_grants RENAME COLUMN resource_id TO entity_id')
  await knex.raw('ALTER TABLE resource_grants RENAME COLUMN resource_type TO entity_type')

  // Rename the table back to its pre-Phase-1 name.
  await knex.raw('ALTER TABLE resource_grants RENAME TO knowledge_base_entity_permissions')

  // Restore the legacy indexes that we dropped in `up()`. Names match the
  // ones Knex generated against the original `project_entity_permissions`
  // table so a subsequent rollback past the project→kb rename still works.
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS project_entity_permissions_project_id_index ON knowledge_base_entity_permissions(knowledge_base_id)',
  )
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS project_entity_permissions_entity_type_entity_id_index ON knowledge_base_entity_permissions(entity_type, entity_id)',
  )
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS project_entity_permissions_grantee_type_grantee_id_index ON knowledge_base_entity_permissions(grantee_type, grantee_id)',
  )

  // Restore the legacy 5-column uniqueness constraint with its original name.
  await knex.raw(
    `ALTER TABLE knowledge_base_entity_permissions
       ADD CONSTRAINT project_entity_permissions_project_id_entity_type_entity_id_grantee_type_grantee_id_unique
       UNIQUE (knowledge_base_id, entity_type, entity_id, grantee_type, grantee_id)`,
  )
}
