/**
 * @fileoverview Phase 3 / P3.5 follow-up — Seed `feedback.submit` for every
 * legacy role.
 *
 * ## Why this migration exists
 *
 * The Phase 1 day-one seed (`20260407062700_phase1_seed_role_permissions.ts`)
 * never granted `feedback.submit` to any role because the legacy
 * `Permission` union in `rbac.ts` had no `submit_feedback` equivalent — the
 * old feedback endpoint was implicitly open to every authenticated user via
 * a bare `requireAuth` chain. During the Phase 3 Wave 3 sweep the feedback
 * route was tagged with `markPublicRoute()` as a temporary bridge so the
 * route-sweep gate would not flag it (commit 7c83373). That tag was always
 * intended to be replaced with `requirePermission('feedback.submit')` once
 * the matching `role_permissions` rows were seeded.
 *
 * This migration closes that gap by inserting one row per existing role
 * (`super-admin`, `admin`, `leader`, `user`) with `permission_key =
 * 'feedback.submit'` and `tenant_id = NULL`. After it runs, every
 * authenticated user keeps the exact same V2 ability they had before, and
 * the feedback route can drop the public-route tag for the canonical
 * `requirePermission('feedback.submit')` gate (see the companion commit on
 * `feedback.routes.ts`).
 *
 * ## Idempotency
 *
 * Mirrors P1.5 / P2.6: SELECT existing matching `(role, permission_key)` tuples
 * with `tenant_id IS NULL`, filter the candidate set, then INSERT only what
 * remains. Postgres treats NULLs as DISTINCT in unique constraints, so
 * `.onConflict(...).ignore()` alone cannot collapse NULL-tenant rows.
 *
 * ## Reversibility
 *
 * `down()` deletes only the four exact `(role, permission_key)` tuples this
 * migration inserts, scoped to `tenant_id IS NULL`. Same best-effort caveat
 * as P1.5 / P2.6: operator-inserted matching rows after `up()` will also be
 * removed.
 *
 * @see ../../../modules/feedback/feedback.permissions.ts (registry definition)
 * @see ../../../modules/feedback/routes/feedback.routes.ts (route-side cleanup)
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
 * always NULL — these are global defaults, mirroring the P1.5 / P2.6 seed
 * convention.
 */
interface SeedRow {
  role: string
  permission_key: string
  tenant_id: null
}

/** Canonical registry key validated against the live registry below. */
const FEEDBACK_SUBMIT_KEY = 'feedback.submit'

/** Every legacy role that should retain the implicit "submit feedback" capability. */
const TARGET_ROLES = ['super-admin', 'admin', 'leader', 'user'] as const

/**
 * @description Build the deterministic set of seed rows this migration inserts.
 * One row per target role, all with the single feedback.submit key.
 *
 * @returns {SeedRow[]} Four rows ready for insert (or delete in `down()`).
 */
function buildSeedRows(): SeedRow[] {
  // Cross-product collapses to a list since there is exactly one target key.
  return TARGET_ROLES.map((role) => ({
    role,
    permission_key: FEEDBACK_SUBMIT_KEY,
    tenant_id: null,
  }))
}

/**
 * @description Hard gate: the target key MUST exist in the live permission
 * registry, otherwise the seed would write a row that no V2 ability builder
 * could ever match.
 *
 * @throws {Error} If `feedback.submit` is absent from `getAllPermissions()`.
 */
function assertTargetKeyRegistered(): void {
  // Snapshot the registry once and index by key for O(1) lookup.
  const allKeys = new Set(getAllPermissions().map((p) => p.key))
  if (!allKeys.has(FEEDBACK_SUBMIT_KEY)) {
    throw new Error(
      `[P3.5] role_permissions seed references permission_key '${FEEDBACK_SUBMIT_KEY}' ` +
        `which does not exist in the live registry. Update ` +
        `be/src/modules/feedback/feedback.permissions.ts so the registry agrees.`,
    )
  }
}

/**
 * @description Insert the four `(role, feedback.submit)` tuples into
 * `role_permissions`. Application-layer idempotency filter to handle the
 * Postgres NULL-distinct unique-constraint quirk.
 *
 * @param {Knex} knex - Knex migration context.
 * @returns {Promise<void>} Resolves once the idempotent insert completes.
 * @throws {Error} If the target key is missing from the registry.
 */
export async function up(knex: Knex): Promise<void> {
  // Validate before touching the database — never partially seed a broken state.
  assertTargetKeyRegistered()

  // Build the deterministic row set up-front so validation and insert share
  // the same payload.
  const rows = buildSeedRows()

  // Pre-query existing tuples for the NULL-tenant idempotency filter
  // (Postgres treats NULL as DISTINCT in unique constraints).
  const existing = await knex(ROLE_PERMISSIONS_TABLE)
    .select('role', 'permission_key')
    .whereNull('tenant_id')
    .whereIn('role', TARGET_ROLES as unknown as string[])
    .where({ permission_key: FEEDBACK_SUBMIT_KEY })

  const existingTokens = new Set(
    existing.map((r: { role: string; permission_key: string }) => `${r.role}|${r.permission_key}`),
  )
  const toInsert = rows.filter(
    (r) => !existingTokens.has(`${r.role}|${r.permission_key}`),
  )

  // No-op fast path if every row is already present (re-runs after rollback).
  if (toInsert.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[P3.5] role_permissions seed: all ${rows.length} candidate feedback.submit rows already present — no-op`,
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
    `[P3.5] role_permissions seed: candidate=${rows.length}, inserted=${insertedCount} ` +
      `(roles=${TARGET_ROLES.join(',')}, key=${FEEDBACK_SUBMIT_KEY})`,
  )
}

/**
 * @description Best-effort reversal: delete exactly the four
 * `(role, feedback.submit)` tuples this migration inserted, scoped to
 * `tenant_id IS NULL`.
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
    .where({ permission_key: FEEDBACK_SUBMIT_KEY })
    .del()
}
