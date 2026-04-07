/**
 * @fileoverview Phase 3 / P3.0a — Seed `permissions.view` + `permissions.manage`
 * for the `admin` and `super-admin` legacy roles.
 *
 * ## Why this migration exists
 *
 * Phase 3 introduces a new `be/src/modules/permissions/` admin module that
 * ships CRUD endpoints for managing roles, user overrides, and resource
 * grants. Those endpoints need their own permission keys to gate themselves.
 * This migration grants those keys to `admin` and `super-admin` only — no
 * other legacy role can view or mutate the permissions catalog.
 *
 * The actual module (controller/service/model/routes/schemas/index) is built
 * in Phase 3 Wave 4 (P3.4a). P3.0a only ships the registry file
 * (`be/src/modules/permissions/permissions.permissions.ts`) and this seed.
 *
 * ## Canonical registry keys
 *
 * - `permissions.view`   → `definePermissions('permissions', { view: ... })`
 *                          (action: 'read',   subject: PermissionCatalog)
 * - `permissions.manage` → `definePermissions('permissions', { manage: ... })`
 *                          (action: 'manage', subject: PermissionCatalog)
 *
 * Both keys are validated at migrate-time against the live registry via the
 * barrel import `@/shared/permissions/index.js` (the eager-import side
 * effects only fire through the barrel — Phase 1 UAT finding).
 *
 * ## Idempotency
 *
 * Same SELECT-then-filter pattern as the P1.5/P2.6 seeds: Postgres treats
 * NULLs as DISTINCT in unique constraints, so the unique index on
 * `(role, permission_key, tenant_id)` does NOT collapse NULL-tenant rows on
 * its own. Pre-query existing tuples and filter the candidate set.
 *
 * @see .planning/phase-03-middleware-cutover/PLAN.md (P3.0a)
 * @see .planning/phase-03-middleware-cutover/3-RESEARCH.md §6
 */

import type { Knex } from 'knex'

import { ROLE_PERMISSIONS_TABLE } from '@/shared/constants/permissions.js'
// Barrel import — required so the eager module side effects in
// `shared/permissions/index.ts` register every module's permissions before
// `getAllPermissions()` is called. Direct registry imports do NOT fire those
// side effects (Phase 1 UAT finding).
import { getAllPermissions } from '@/shared/permissions/index.js'

/**
 * @description Row shape inserted into `role_permissions`. `tenant_id` is
 * always NULL — these are global defaults, mirroring the P1.5/P2.6 convention.
 */
interface SeedRow {
  role: string
  permission_key: string
  tenant_id: null
}

/** Canonical registry key for "view permissions catalog". */
const PERMISSIONS_VIEW_KEY = 'permissions.view'

/** Canonical registry key for "manage permissions catalog". */
const PERMISSIONS_MANAGE_KEY = 'permissions.manage'

/** Roles that receive the new admin gate keys. */
const TARGET_ROLES = ['admin', 'super-admin'] as const

/** Keys this migration touches — used for query filters and validation. */
const TARGET_KEYS = [PERMISSIONS_VIEW_KEY, PERMISSIONS_MANAGE_KEY] as const

/**
 * @description Build the deterministic set of seed rows. Cross-product of
 * TARGET_ROLES × TARGET_KEYS = 4 rows.
 *
 * @returns {SeedRow[]} Four rows ready for insert (or delete in `down()`).
 */
function buildSeedRows(): SeedRow[] {
  const rows: SeedRow[] = []
  // Two roles × two keys = four global (tenant_id NULL) rows.
  for (const role of TARGET_ROLES) {
    for (const key of TARGET_KEYS) {
      rows.push({ role, permission_key: key, tenant_id: null })
    }
  }
  return rows
}

/**
 * @description Validate that the two target keys exist in the live permission
 * registry. Hard gate against silent drift between this migration and the
 * registry — if either key is missing, throw with a descriptive error.
 *
 * @throws {Error} If either `permissions.view` or `permissions.manage` is
 *   absent from `getAllPermissions()`.
 */
function assertTargetKeysRegistered(): void {
  // Snapshot the registry once and index by key for O(1) lookups.
  const allKeys = new Set(getAllPermissions().map((p) => p.key))

  // Collect every offender so the error message lists them all at once.
  const missing = TARGET_KEYS.filter((k) => !allKeys.has(k))
  if (missing.length > 0) {
    throw new Error(
      `[P3.0a] role_permissions seed references ${missing.length} permission_key value(s) ` +
        `that do not exist in the live registry: ${missing.join(', ')}. ` +
        `Update be/src/modules/permissions/permissions.permissions.ts so the registry agrees.`,
    )
  }
}

/**
 * @description Insert the four `(role, permission_key)` tuples into
 * `role_permissions` so the new permissions admin module's CRUD endpoints
 * can be gated against the `admin` and `super-admin` roles.
 *
 * @param {Knex} knex - Knex migration context.
 * @returns {Promise<void>} Resolves once the idempotent insert completes.
 * @throws {Error} If either target key is missing from the registry.
 *
 * @see .planning/phase-03-middleware-cutover/PLAN.md (P3.0a)
 */
export async function up(knex: Knex): Promise<void> {
  // Validate before touching the database — a missing key must not partially
  // seed a broken state.
  assertTargetKeysRegistered()

  // Build the deterministic row set up-front so validation and insert share
  // the same payload.
  const rows = buildSeedRows()

  // Application-layer idempotency filter — Postgres treats NULLs as DISTINCT
  // in unique constraints, so the unique index does NOT collapse NULL-tenant
  // rows on its own. Pre-query existing tuples and filter the candidate set.
  const existing = await knex(ROLE_PERMISSIONS_TABLE)
    .select('role', 'permission_key')
    .whereNull('tenant_id')
    .whereIn('role', TARGET_ROLES as unknown as string[])
    .whereIn('permission_key', TARGET_KEYS as unknown as string[])

  const existingTokens = new Set(
    existing.map(
      (r: { role: string; permission_key: string }) => `${r.role}|${r.permission_key}`,
    ),
  )
  const toInsert = rows.filter(
    (r) => !existingTokens.has(`${r.role}|${r.permission_key}`),
  )

  // No-op fast path if every row is already present (re-runs after rollback).
  if (toInsert.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[P3.0a] role_permissions seed: all ${rows.length} candidate rows already present — no-op`,
    )
    return
  }

  // Defensive onConflict() in case a concurrent writer inserts between the
  // SELECT above and the INSERT below — unlikely at migrate-time but cheap.
  const result = await knex(ROLE_PERMISSIONS_TABLE)
    .insert(toInsert)
    .onConflict(['role', 'permission_key', 'tenant_id'])
    .ignore()
    .returning('id')

  const insertedCount = Array.isArray(result) ? result.length : toInsert.length

  // eslint-disable-next-line no-console
  console.log(
    `[P3.0a] role_permissions seed: candidate=${rows.length}, inserted=${insertedCount} ` +
      `(roles=${TARGET_ROLES.join(',')}, keys=${TARGET_KEYS.join(',')})`,
  )
}

/**
 * @description Best-effort reversal: delete exactly the four
 * `(role, permission_key)` tuples this migration inserted, scoped to
 * `tenant_id IS NULL`. If an operator manually inserted a matching row after
 * `up()` ran, that row will also be removed — same caveat as P1.5/P2.6.
 *
 * @param {Knex} knex - Knex migration context.
 * @returns {Promise<void>} Resolves once the delete completes.
 */
export async function down(knex: Knex): Promise<void> {
  // `whereNull('tenant_id')` is required because `where({ tenant_id: null })`
  // emits `= NULL` in Knex, which never matches in Postgres.
  await knex(ROLE_PERMISSIONS_TABLE)
    .whereNull('tenant_id')
    .whereIn('role', TARGET_ROLES as unknown as string[])
    .whereIn('permission_key', TARGET_KEYS as unknown as string[])
    .del()
}
