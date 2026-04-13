/**
 * @fileoverview Phase 2 / P2.4 — Patch `role_permissions` so the V2 CASL
 * ability builder is byte-equivalent to V1's hand-coded `buildAbilityForV1Sync`
 * for every (fixture × action × subject) tuple in the parity matrix.
 *
 * The Phase 2 contract is "zero user-visible behavior change" when flipping
 * `config.permissions.useV2Engine` to true. P2.4's parity matrix identified
 * SIX divergences between V1 and V2 caused by the day-one P1.5 seed under-
 * granting some roles and over-granting `leader` on Dataset. This migration
 * patches all six.
 *
 * ## Divergences fixed
 *
 * Source of truth for V1 behavior is `buildAbilityForV1Sync()` in
 * `be/src/shared/services/ability.service.ts` (lines 136-191).
 *
 * 1. Row 1 — admin/super-admin missing `audit.view`
 *    V1 admin gets `can('read', 'AuditLog', tenantCondition)` at L157, but
 *    P1.5's legacy mapping has no `view_audit` legacy key — the audit module
 *    was added after rbac.ts was frozen — so `audit.view` was never seeded.
 *    Fix: insert `audit.view` for both admin and super-admin (super-admin
 *    already gets `manage all` so this is belt-and-suspenders, but the parity
 *    matrix asserts the role_permissions row set, not just CASL output).
 *
 * 2. Row 2 / 3 — leader missing manage_knowledge_base expansion
 *    V1 leader gets `can('manage', 'KnowledgeBase', tenantCondition)` at
 *    L170, but rbac.ts's `leader` role list at L149-157 does NOT contain
 *    `manage_knowledge_base`. So P1.5 expanded zero KB-related keys for
 *    leader. The V1 hand-coded builder is the source of truth — it grants
 *    manage on KB to leader, so V2 must too. Fix: insert the full
 *    `manage_knowledge_base` expansion (knowledge_base.* + document_categories.*
 *    + documents.view) for the leader role. These are exactly the keys
 *    `LEGACY_TO_NEW.manage_knowledge_base` produces.
 *
 * 3. Row 4 / 5 — leader missing agents.* and memory.*
 *    V1 leader gets `can('manage', 'Agent', ...)` at L173 and
 *    `can('manage', 'Memory', ...)` at L174. Phase 1's locked decision in
 *    `legacy-mapping.ts` had `AGENTS_MEMORY_ADMIN_ROLES = ['admin', 'super-admin']`
 *    based on the assumption that V1 only granted those subjects to admins.
 *    The Phase 2 parity matrix proved that assumption wrong. The locked
 *    constant has been amended to include `'leader'` so future fresh DBs
 *    seed correctly via P1.5; THIS migration patches existing dev / prod
 *    DBs that already ran P1.5 before the amendment landed. Fix: insert
 *    every `agents.*` and `memory.*` key for the leader role.
 *
 * 4. Row 6 — V2 over-grants `manage Dataset` for leader
 *    V1 leader at L166-168 gets only `create/update/delete Dataset` (no
 *    `manage`). But P1.5 expanded `manage_datasets` for leader, which
 *    includes `datasets.share`, `datasets.reindex`, `datasets.advanced` —
 *    each of which is registered in `rag.permissions.ts` with
 *    `action: 'manage'`. So V2 leader has three explicit
 *    `can('manage', 'Dataset', tenantCondition)` rules from those keys, and
 *    `v2.can('manage', 'Dataset')` returns true while V1 returns false.
 *
 *    Investigation finding: this is **Finding A** from the P2.4 plan —
 *    the registry has manage-action keys (`datasets.share`, `.reindex`,
 *    `.advanced`) that are seeded for leader via the `manage_datasets`
 *    legacy expansion. The V2 builder is NOT synthesizing `manage` from
 *    CRUD verbs; it is faithfully emitting one CASL rule per registry row
 *    in `role_permissions`, and three of those rows have action `manage`.
 *
 *    Fix: DELETE the three over-granted rows for the leader role
 *    (datasets.share, datasets.reindex, datasets.advanced) so V2 leader
 *    only has create/update/delete on Dataset, matching V1.
 *
 * ## Validation
 *
 * Mirrors P1.5's safety net: imports `getAllPermissions()` from the live
 * permissions registry and asserts that every `permission_key` about to be
 * INSERTed exists. If any key is missing the migration throws with the full
 * list of offenders. The DELETE side does NOT validate against the registry
 * because the keys we're removing intentionally exist (we're removing them
 * because they over-grant leader).
 *
 * ## Idempotency
 *
 * Mirrors P1.5: SELECTs existing (role, permission_key, tenant_id IS NULL)
 * triples first, filters the candidate row set, then INSERTs only the
 * not-yet-present rows. Postgres treats NULLs as DISTINCT in unique
 * constraints by default, so naive `.onConflict().ignore()` would let
 * duplicate `tenant_id IS NULL` rows through on re-runs. The DELETE side is
 * naturally idempotent (deleting already-absent rows is a no-op).
 *
 * ## Reversibility
 *
 * `down()` reverses both directions:
 *   - DELETEs every row this migration's `up()` would have INSERTed.
 *   - Re-INSERTs the three over-granted leader Dataset rows so the DB
 *     returns to its pre-patch state.
 */

import type { Knex } from 'knex'

import { ROLE_PERMISSIONS_TABLE } from '@/shared/constants/permissions.js'
import { getAllPermissions } from '@/shared/permissions/index.js'

/**
 * @description Row shape inserted into `role_permissions`. `tenant_id` is
 * always NULL — these are global day-one grants, not tenant overrides.
 */
interface SeedRow {
  role: string
  permission_key: string
  tenant_id: null
}

/**
 * @description Build the deterministic set of rows that this migration must
 * insert. Mirrors the structure of `LEGACY_TO_NEW.manage_knowledge_base` and
 * `AGENTS_MEMORY_ADMIN_ONLY_KEYS` but emitted directly here so the migration
 * is hermetic and does not depend on future edits to legacy-mapping.ts.
 *
 * @returns {SeedRow[]} Stable, sorted seed row set.
 */
function buildPatchInsertRows(): SeedRow[] {
  const rows: SeedRow[] = []

  // Row 1 — admin + super-admin get audit.view (V1 ability.service.ts:157)
  rows.push({ role: 'admin', permission_key: 'audit.view', tenant_id: null })
  rows.push({ role: 'super-admin', permission_key: 'audit.view', tenant_id: null })

  // Rows 2-3 — leader gets the full manage_knowledge_base expansion
  // (V1 ability.service.ts:170 — `can('manage', 'KnowledgeBase', tenantCondition)`)
  // These keys mirror LEGACY_TO_NEW.manage_knowledge_base verbatim.
  const leaderKbKeys = [
    // Knowledge base primary CRUD + sharing/bindings/sync (8 keys).
    'knowledge_base.view',
    'knowledge_base.create',
    'knowledge_base.edit',
    'knowledge_base.delete',
    'knowledge_base.share',
    'knowledge_base.chats',
    'knowledge_base.searches',
    'knowledge_base.sync',
    // Document categories — CRUD plus bulk import (5 keys).
    'document_categories.view',
    'document_categories.create',
    'document_categories.edit',
    'document_categories.delete',
    'document_categories.import',
    // Read-side documents (write actions live under manage_datasets).
    'documents.view',
  ] as const
  for (const key of leaderKbKeys) {
    rows.push({ role: 'leader', permission_key: key, tenant_id: null })
  }

  // Rows 4-5 — leader gets agents.* and memory.* (V1 ability.service.ts:173-174)
  // Mirrors AGENTS_MEMORY_ADMIN_ONLY_KEYS in legacy-mapping.ts. The constant
  // has been amended to include 'leader' so future fresh DBs seed correctly
  // via P1.5; this migration patches existing DBs that already ran P1.5.
  const leaderAgentsMemoryKeys = [
    // Agents — full lifecycle plus run/debug/credentials/embed (8 keys).
    'agents.view',
    'agents.create',
    'agents.edit',
    'agents.delete',
    'agents.run',
    'agents.debug',
    'agents.credentials',
    'agents.embed',
    // Memory — CRUD only (4 keys).
    'memory.view',
    'memory.create',
    'memory.edit',
    'memory.delete',
  ] as const
  for (const key of leaderAgentsMemoryKeys) {
    rows.push({ role: 'leader', permission_key: key, tenant_id: null })
  }

  // Sort for deterministic logging and stable down() output.
  rows.sort((a, b) =>
    a.role === b.role
      ? a.permission_key.localeCompare(b.permission_key)
      : a.role.localeCompare(b.role),
  )
  return rows
}

/**
 * @description The three (role, permission_key) pairs to DELETE from
 * `role_permissions` for row 6. Each corresponds to a `datasets.*` registry
 * key whose `action` is `'manage'` — V1 leader has only create/update/delete
 * on Dataset, so V2 must not emit any `manage` rule for leader on Dataset.
 *
 * @see Row 6 in the file header for the full investigation finding.
 */
const LEADER_DATASET_OVER_GRANTS = [
  'datasets.share',
  'datasets.reindex',
  'datasets.advanced',
] as const

/**
 * @description Validate that every permission_key about to be INSERTed
 * exists in the live registry. Throws a descriptive error listing every
 * offender if any are missing. Mirrors the P1.5 safety net.
 *
 * @param {SeedRow[]} rows - Candidate rows to validate.
 * @throws {Error} If any permission_key is not present in `getAllPermissions()`.
 */
function assertAllInsertKeysRegistered(rows: SeedRow[]): void {
  const allKeys = new Set(getAllPermissions().map((p) => p.key))
  const missing = Array.from(
    new Set(rows.map((r) => r.permission_key).filter((k) => !allKeys.has(k))),
  )
  if (missing.length > 0) {
    throw new Error(
      `[P2.4-patch] role_permissions patch references ${missing.length} permission_key value(s) ` +
        `that do not exist in the live registry: ${missing.join(', ')}. ` +
        `Update the relevant *.permissions.ts file or this migration so both sides agree.`,
    )
  }
}

/**
 * @description Apply the P2.4 parity patch:
 *   1. DELETE leader's three over-granted Dataset manage rows.
 *   2. INSERT (idempotently) every row required by V1 parity that P1.5 missed.
 *
 * @param {Knex} knex - Knex migration context.
 * @returns {Promise<void>} Resolves when the patch completes.
 * @throws {Error} If any candidate insert key is missing from the registry.
 */
export async function up(knex: Knex): Promise<void> {
  // ── Step 1 — DELETE the three over-granted leader Dataset rows (row 6) ──
  // whereNull('tenant_id') is required because Knex does not translate
  // `where({ tenant_id: null })` into `IS NULL` (it emits `= NULL`, which
  // never matches in SQL). The same pattern is used in P1.5's down().
  const deleted = await knex(ROLE_PERMISSIONS_TABLE)
    .where({ role: 'leader' })
    .whereNull('tenant_id')
    .whereIn('permission_key', LEADER_DATASET_OVER_GRANTS as unknown as string[])
    .del()
  // eslint-disable-next-line no-console
  console.log(
    `[P2.4-patch] removed ${deleted} leader Dataset over-grant row(s) ` +
      `(${LEADER_DATASET_OVER_GRANTS.join(', ')})`,
  )

  // ── Step 2 — INSERT the parity rows ────────────────────────────────────
  const rows = buildPatchInsertRows()

  // Validate first so a missing key cannot partially-seed a broken state.
  assertAllInsertKeysRegistered(rows)

  // Pre-query existing NULL-tenant rows so we can filter the candidate set.
  // This is the same Postgres NULL-distinct workaround used by P1.5 — see
  // its file header for the full rationale.
  const existing = await knex(ROLE_PERMISSIONS_TABLE)
    .select('role', 'permission_key')
    .whereNull('tenant_id')
  const existingTokens = new Set(
    existing.map(
      (r: { role: string; permission_key: string }) =>
        `${r.role}|${r.permission_key}`,
    ),
  )
  const toInsert = rows.filter(
    (r) => !existingTokens.has(`${r.role}|${r.permission_key}`),
  )

  if (toInsert.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[P2.4-patch] role_permissions patch: all ${rows.length} candidate rows already present — no-op`,
    )
    return
  }

  // Defensive .onConflict().ignore() in case a concurrent writer races us
  // between the SELECT above and the INSERT below.
  const result = await knex(ROLE_PERMISSIONS_TABLE)
    .insert(toInsert)
    .onConflict(['role', 'permission_key', 'tenant_id'])
    .ignore()
    .returning('id')

  const insertedCount = Array.isArray(result) ? result.length : toInsert.length
  // eslint-disable-next-line no-console
  console.log(
    `[P2.4-patch] role_permissions patch: candidate=${rows.length}, inserted=${insertedCount}`,
  )
}

/**
 * @description Reverse both halves of `up()`:
 *   1. DELETE every row `up()` would have INSERTed.
 *   2. Re-INSERT the three leader Dataset over-grant rows so the DB returns
 *      to its pre-patch state.
 *
 * @param {Knex} knex - Knex migration context.
 * @returns {Promise<void>} Resolves when the rollback completes.
 */
export async function down(knex: Knex): Promise<void> {
  // ── Step 1 — DELETE the rows we INSERTed ───────────────────────────────
  const rows = buildPatchInsertRows()
  if (rows.length > 0) {
    // Group keys per role for compact DELETE statements inside a transaction.
    const perRole = new Map<string, string[]>()
    for (const r of rows) {
      const arr = perRole.get(r.role) ?? []
      arr.push(r.permission_key)
      perRole.set(r.role, arr)
    }

    await knex.transaction(async (trx) => {
      for (const [role, keys] of perRole.entries()) {
        // whereNull required for IS NULL semantics — see up() comment.
        await trx(ROLE_PERMISSIONS_TABLE)
          .where({ role })
          .whereNull('tenant_id')
          .whereIn('permission_key', keys)
          .del()
      }
    })
  }

  // ── Step 2 — Re-INSERT the leader Dataset over-grants ─────────────────
  const restoreRows = LEADER_DATASET_OVER_GRANTS.map((key) => ({
    role: 'leader',
    permission_key: key,
    tenant_id: null,
  }))
  await knex(ROLE_PERMISSIONS_TABLE)
    .insert(restoreRows)
    .onConflict(['role', 'permission_key', 'tenant_id'])
    .ignore()
}
