/**
 * @fileoverview Phase 2 / P2.6 — Seed `datasets.view` + `documents.view` for
 * the `user` and `leader` legacy roles.
 *
 * ## Why this migration exists (R-A fix)
 *
 * The legacy ability builder at `be/src/shared/services/ability.service.ts:113-114`
 * unconditionally grants the following two CASL rules to *every authenticated
 * user*, regardless of role:
 *
 *   can('read', 'Dataset',  { tenant_id: user.current_org_id })
 *   can('read', 'Document', { tenant_id: user.current_org_id })
 *
 * These grants were never present in the legacy `ROLE_PERMISSIONS` map at
 * `be/src/shared/config/rbac.ts`, so the Phase 1 / P1.5 day-one seed
 * (`20260407062700_phase1_seed_role_permissions.ts`) did not produce
 * matching rows for the `user` and `leader` roles. The Phase 2 V2 ability
 * builder is purely data-driven from `role_permissions`, so without this
 * fix V2 would emit zero rules where V1 emits two — making byte-level
 * V1↔V2 parity impossible for the `user` and `leader` fixtures.
 *
 * The locked decision (Phase 2 D1) is the **seed-side fix**: add the missing
 * rows to `role_permissions` here so V2 stays purely data-driven and parity
 * is achievable from the data alone. NO carve-out is added in V2 builder code.
 *
 * ## Canonical registry keys
 *
 * - `datasets.view`  → registered in `be/src/modules/rag/rag.permissions.ts:22-28`
 *                      (action: 'read', subject: PermissionSubjects.Dataset)
 * - `documents.view` → registered in
 *                      `be/src/modules/knowledge-base/knowledge-base.permissions.ts:115-122`
 *                      (action: 'read', subject: PermissionSubjects.Document)
 *
 * Both keys are validated at migrate-time against the live registry via the
 * barrel import `@/shared/permissions/index.js` (the eager-import side
 * effects only fire through the barrel — see Phase 1 UAT findings).
 *
 * ## Idempotency
 *
 * Mirrors the P1.5 pattern: SELECT existing matching `(role, permission_key)`
 * tuples with `tenant_id IS NULL`, filter the candidate set, and only INSERT
 * what remains. Postgres treats NULLs as DISTINCT in unique constraints, so
 * `.onConflict(...).ignore()` alone is insufficient for NULL-tenant rows.
 *
 * ## Reversibility
 *
 * `down()` deletes only the four exact `(role, permission_key)` tuples this
 * migration inserts, scoped to `tenant_id IS NULL`. Best-effort: if an
 * operator manually inserted matching rows after `up()`, those rows will
 * also be removed — same caveat as P1.5.
 *
 * @see {@link file://./../../../../../.planning/phase-02-ability-engine-regression-snapshots/2-RESEARCH.md} R-A
 * @see {@link file://./../../services/ability.service.ts} line 113
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
 * always NULL — these are global defaults, mirroring the P1.5 seed convention.
 */
interface SeedRow {
  role: string
  permission_key: string
  tenant_id: null
}

/** Canonical registry key for "view dataset" — see file header for citation. */
const DATASET_VIEW_KEY = 'datasets.view'

/** Canonical registry key for "view document" — see file header for citation. */
const DOCUMENT_VIEW_KEY = 'documents.view'

/** Roles that need the missing view grants to mirror legacy ability.service.ts. */
const TARGET_ROLES = ['user', 'leader'] as const

/** All target keys this migration touches — used for query filters and validation. */
const TARGET_KEYS = [DATASET_VIEW_KEY, DOCUMENT_VIEW_KEY] as const

/**
 * @description Build the deterministic set of seed rows this migration inserts.
 * Cross-product of TARGET_ROLES × TARGET_KEYS.
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
 * registry. Throws a descriptive error listing any missing key — this is the
 * hard gate against silent drift between this migration and the registry.
 *
 * @throws {Error} If either `datasets.view` or `documents.view` is absent
 *   from `getAllPermissions()`.
 */
function assertTargetKeysRegistered(): void {
  // Snapshot the registry once and index by key for O(1) lookups.
  const allKeys = new Set(getAllPermissions().map((p) => p.key))

  // Collect every offender so the error message lists them all at once.
  const missing = TARGET_KEYS.filter((k) => !allKeys.has(k))
  if (missing.length > 0) {
    throw new Error(
      `[P2.6] role_permissions seed references ${missing.length} permission_key value(s) ` +
        `that do not exist in the live registry: ${missing.join(', ')}. ` +
        `Update the offending module's *.permissions.ts file so the registry agrees.`,
    )
  }
}

/**
 * @description Insert the four missing `(role, permission_key)` tuples into
 * `role_permissions` so the Phase 2 V2 ability builder can emit the same
 * `read Dataset` / `read Document` rules that V1's hardcoded grants produce.
 *
 * @param {Knex} knex - Knex migration context.
 * @returns {Promise<void>} Resolves once the idempotent insert completes.
 * @throws {Error} If either target key is missing from the registry.
 *
 * @see ../../services/ability.service.ts (line 113 — V1 hardcoded grants)
 * @see ../../../../.planning/phase-02-ability-engine-regression-snapshots/2-RESEARCH.md (R-A)
 */
export async function up(knex: Knex): Promise<void> {
  // Validate before touching the database — a missing key must not partially
  // seed a broken state.
  assertTargetKeysRegistered()

  // Build the deterministic row set up-front so validation and insert share
  // the same payload.
  const rows = buildSeedRows()

  // Application-layer idempotency filter — Postgres treats NULLs as DISTINCT
  // in unique constraints, so the unique index on
  // (role, permission_key, tenant_id) does NOT collapse NULL-tenant rows on
  // its own. Pre-query the existing tuples and filter the candidate set.
  // (Same gotcha and pattern as the P1.5 seed migration.)
  const existing = await knex(ROLE_PERMISSIONS_TABLE)
    .select('role', 'permission_key')
    .whereNull('tenant_id')
    .whereIn('role', TARGET_ROLES as unknown as string[])
    .whereIn('permission_key', TARGET_KEYS as unknown as string[])

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
      `[P2.6] role_permissions seed: all ${rows.length} candidate rows already present — no-op`,
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
    `[P2.6] role_permissions seed: candidate=${rows.length}, inserted=${insertedCount} ` +
      `(roles=${TARGET_ROLES.join(',')}, keys=${TARGET_KEYS.join(',')})`,
  )
}

/**
 * @description Best-effort reversal: delete exactly the four
 * `(role, permission_key)` tuples this migration inserted, scoped to
 * `tenant_id IS NULL`. If an operator manually inserted a matching row after
 * `up()` ran, that row will also be removed — same caveat as the P1.5 seed.
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
