/**
 * @fileoverview Phase 1 / P1.5 — Day-one `role_permissions` seed.
 *
 * Reads the legacy `ROLE_PERMISSIONS` map from `be/src/shared/config/rbac.ts`
 * and expands every (role, legacyKey) pair via the `LEGACY_TO_NEW` table in
 * `@/shared/permissions/legacy-mapping.ts` to produce a global (tenant_id
 * NULL) row set in `role_permissions`. Also appends the locked agents/memory
 * grants (admin + super-admin only — see REQUIREMENTS.md TS4).
 *
 * ## Safety net
 *
 * Before inserting, the migration imports `getAllPermissions()` from the live
 * registry and asserts that every `permission_key` about to be inserted
 * exists. If any key is missing, the migration throws with a full list of
 * offenders — this guarantees that drift between `rbac.ts`, the legacy
 * mapping file, and the registry is caught at migrate-time rather than at
 * runtime.
 *
 * ## Idempotency
 *
 * The insert uses `.onConflict(['role', 'permission_key', 'tenant_id']).ignore()`
 * so re-running the migration touches zero rows. The underlying unique key
 * was declared on the `role_permissions` table by the P1.1 migration.
 *
 * ## Reversibility
 *
 * `down()` deletes exactly the rows this migration produced (computed by
 * re-running the same expansion against the same `ROLE_PERMISSIONS` literal
 * and `LEGACY_TO_NEW` table). This is a best-effort reversal: if a later
 * migration or a manual operator inserts a row that happens to match one of
 * the seeded (role, permission_key, tenant_id NULL) triples, `down()` will
 * remove that row too. Phase 1 ships no such later writer, so the reversal
 * is exact on a clean schema.
 */

import type { Knex } from 'knex'

import { ROLE_PERMISSIONS } from '@/shared/config/rbac.js'
import { ROLE_PERMISSIONS_TABLE } from '@/shared/constants/permissions.js'
import { getAllPermissions } from '@/shared/permissions/index.js'
import {
  AGENTS_MEMORY_ADMIN_ONLY_KEYS,
  AGENTS_MEMORY_ADMIN_ROLES,
  LEGACY_TO_NEW,
} from '@/shared/permissions/legacy-mapping.js'

/**
 * @description Row shape emitted into `role_permissions`. `tenant_id` is
 * always NULL at this stage — tenant-specific customizations are a Phase 2
 * concern.
 */
interface SeedRow {
  role: string
  permission_key: string
  tenant_id: null
}

/**
 * @description Build the full set of seed rows by expanding the legacy
 * ROLE_PERMISSIONS map and appending the locked agents/memory extras.
 * De-duplicated and sorted so downstream logging and `down()` produce
 * stable output.
 *
 * @returns {SeedRow[]} Unique, sorted seed rows ready for insert.
 */
function buildSeedRows(): SeedRow[] {
  // Use a Set keyed by `role|key` to collapse duplicates that naturally arise
  // when two legacy permissions expand into overlapping new-registry keys.
  const seen = new Set<string>()
  const rows: SeedRow[] = []

  // Helper — push a row only if this (role, key) pair has not been seen.
  const push = (role: string, permission_key: string): void => {
    const token = `${role}|${permission_key}`
    if (seen.has(token)) return
    seen.add(token)
    rows.push({ role, permission_key, tenant_id: null })
  }

  // Walk each legacy (role, legacyKey) grant and expand via LEGACY_TO_NEW.
  for (const [role, legacyPerms] of Object.entries(ROLE_PERMISSIONS)) {
    for (const legacyKey of legacyPerms) {
      // `?? []` covers the intentionally-dropped legacy keys documented in
      // legacy-mapping.ts (e.g. manage_storage, storage:read).
      const expanded = LEGACY_TO_NEW[legacyKey] ?? []
      for (const newKey of expanded) push(role, newKey)
    }
  }

  // Locked decision — agents.* and memory.* are admin + super-admin only on
  // day one (REQUIREMENTS.md TS4). These have no legacy counterpart.
  for (const role of AGENTS_MEMORY_ADMIN_ROLES) {
    for (const key of AGENTS_MEMORY_ADMIN_ONLY_KEYS) push(role, key)
  }

  // Sort for deterministic logging / down() output.
  rows.sort((a, b) =>
    a.role === b.role
      ? a.permission_key.localeCompare(b.permission_key)
      : a.role.localeCompare(b.role),
  )
  return rows
}

/**
 * @description Validate that every permission_key about to be inserted
 * actually exists in the live registry. Throws a descriptive error listing
 * every offending key if any are missing — this is the hard gate against
 * silent drift between rbac.ts / legacy-mapping.ts / the registry.
 *
 * @param {SeedRow[]} rows - Candidate seed rows to validate.
 * @throws {Error} If any `permission_key` is not present in `getAllPermissions()`.
 */
function assertAllKeysRegistered(rows: SeedRow[]): void {
  // Snapshot the registry once and index by key for O(1) lookups.
  const allKeys = new Set(getAllPermissions().map((p) => p.key))

  // Collect every offender so the error message lists them all at once
  // rather than failing on just the first mismatch.
  const missing = Array.from(
    new Set(rows.map((r) => r.permission_key).filter((k) => !allKeys.has(k))),
  )
  if (missing.length > 0) {
    throw new Error(
      `[P1.5] role_permissions seed references ${missing.length} permission_key value(s) ` +
        `that do not exist in the live registry: ${missing.join(', ')}. ` +
        `Update be/src/shared/permissions/legacy-mapping.ts or the offending module's ` +
        `*.permissions.ts file so both sides agree.`,
    )
  }
}

/**
 * @description Seed the `role_permissions` table with day-one role grants
 * derived from `rbac.ts` plus the locked agents/memory extras.
 *
 * @param {Knex} knex - Knex migration context.
 * @returns {Promise<void>} Resolves once the idempotent insert completes.
 * @throws {Error} If any expanded permission_key is missing from the registry.
 */
export async function up(knex: Knex): Promise<void> {
  // Build the deterministic row set up-front so validation and insert share
  // exactly the same payload.
  const rows = buildSeedRows()

  // Validate before touching the database — a missing key must not partially
  // seed a broken state.
  assertAllKeysRegistered(rows)

  // Nothing to insert is a legal no-op; bail early so Knex doesn't emit an
  // empty INSERT statement.
  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[P1.5] role_permissions seed produced zero rows — nothing to insert')
    return
  }

  // Idempotency — application-layer filter.
  //
  // The P1.1 migration declared UNIQUE(role, permission_key, tenant_id) on
  // role_permissions, but Postgres (pre-15 semantics, and the default on 15+)
  // treats NULLs as DISTINCT in unique constraints. Every row this migration
  // inserts has `tenant_id = NULL`, so `.onConflict(...).ignore()` would let
  // duplicate rows through on re-runs. We instead pre-query the existing
  // (role, permission_key) pairs that already have a NULL tenant_id and
  // filter the candidate rows accordingly. This keeps the seed idempotent
  // without requiring a schema-level NULLS NOT DISTINCT change (Postgres 15+)
  // or a partial unique index migration.
  const existing = await knex(ROLE_PERMISSIONS_TABLE)
    .select('role', 'permission_key')
    .whereNull('tenant_id')
  const existingTokens = new Set(
    existing.map((r: { role: string; permission_key: string }) => `${r.role}|${r.permission_key}`),
  )
  const toInsert = rows.filter(
    (r) => !existingTokens.has(`${r.role}|${r.permission_key}`),
  )

  if (toInsert.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[P1.5] role_permissions seed: all ${rows.length} candidate rows already present — no-op`,
    )
    return
  }

  // Safety-net: still use onConflict().ignore() in case a concurrent writer
  // squeezes in between the SELECT above and the INSERT below (unlikely at
  // migrate-time but defensive).
  const result = await knex(ROLE_PERMISSIONS_TABLE)
    .insert(toInsert)
    .onConflict(['role', 'permission_key', 'tenant_id'])
    .ignore()
    .returning('id')

  // On Postgres .returning('id') yields one row per actually-inserted record;
  // conflicting rows do not appear. Fall back to toInsert.length on drivers
  // that return a bare number.
  const insertedCount = Array.isArray(result) ? result.length : toInsert.length

  // Per-role breakdown so the migration log makes it trivial to audit the
  // parity outcome.
  const perRole = new Map<string, number>()
  for (const r of rows) perRole.set(r.role, (perRole.get(r.role) ?? 0) + 1)
  const summary = Array.from(perRole.entries())
    .map(([role, n]) => `${role}=${n}`)
    .join(', ')

  // eslint-disable-next-line no-console
  console.log(
    `[P1.5] role_permissions seed: candidate rows=${rows.length}, newly inserted=${insertedCount} (${summary})`,
  )
}

/**
 * @description Best-effort reversal: delete every row that `up()` would
 * have produced. Recomputes the same row set and issues a single bulk
 * DELETE using the same (role, permission_key, tenant_id IS NULL) triples.
 *
 * @param {Knex} knex - Knex migration context.
 * @returns {Promise<void>} Resolves once the delete completes.
 */
export async function down(knex: Knex): Promise<void> {
  // Recompute the exact same row set up() would have produced.
  const rows = buildSeedRows()
  if (rows.length === 0) return

  // Group keys per role for a compact DELETE ... WHERE (role=$1 AND permission_key IN (...))
  // executed inside a transaction so partial failures roll back atomically.
  const perRole = new Map<string, string[]>()
  for (const r of rows) {
    const arr = perRole.get(r.role) ?? []
    arr.push(r.permission_key)
    perRole.set(r.role, arr)
  }

  await knex.transaction(async (trx) => {
    for (const [role, keys] of perRole.entries()) {
      // whereNull('tenant_id') is required because `where({ tenant_id: null })`
      // does not emit `IS NULL` in Knex — it emits `= NULL`, which never matches.
      await trx(ROLE_PERMISSIONS_TABLE)
        .where({ role })
        .whereNull('tenant_id')
        .whereIn('permission_key', keys)
        .del()
    }
  })
}
