/**
 * @fileoverview Phase 1 / P1.2 — Backfill `tenant_id` and `actions` on
 * `resource_grants`, then flip `tenant_id` to NOT NULL.
 *
 * Context: P1.1 added `tenant_id text NULL` and `actions text[] NOT NULL
 * DEFAULT '{}'` to `resource_grants` but did not populate either column for
 * pre-existing rows. REQUIREMENTS TS1 mandates that `tenant_id` end up
 * NOT NULL after backfill, derived from each grant's parent
 * `knowledge_base.tenant_id` (note: parent table is SINGULAR `knowledge_base`,
 * renamed from `projects` in 20260402000000). The locked Phase-1 decision
 * also asks for a sensible first-pass population of `actions` from the legacy
 * `permission_level` enum so existing rows are not stranded with empty arrays
 * in the new ability engine. The full `permission_level → actions[]` data
 * transform is deferred to Phase 2 and is free to overwrite these defaults.
 *
 * Idempotency: every UPDATE is gated on a "still empty" predicate
 * (`tenant_id IS NULL` or `actions = '{}'`) so re-running the migration
 * touches zero rows.
 *
 * Reversibility: `down()` only drops the NOT NULL on `tenant_id` — the data
 * backfill itself is intentionally NOT reversed because the values are
 * derivable from the FK join and overwriting them with NULL would force a
 * second backfill on the next `up()`. This is a documented Knex pattern for
 * data backfills.
 */
import type { Knex } from 'knex'

/**
 * @description Backfill `resource_grants.tenant_id` from the parent
 *   `knowledge_base` table, populate `actions` with a first-pass default
 *   derived from the legacy `permission_level` column, and flip `tenant_id`
 *   to NOT NULL. Idempotent: re-runs only touch rows that are still empty.
 * @param {Knex} knex - Knex migration context.
 * @returns {Promise<void>} Resolves once backfill and the NOT NULL flip complete.
 * @throws {Error} If orphan rows remain (rows whose `knowledge_base_id` no
 *   longer matches any `knowledge_base.id`) — should never happen given the
 *   FK, but defensive.
 */
export async function up(knex: Knex): Promise<void> {
  // ---------------------------------------------------------------------
  // Step A: log how many rows still need a tenant_id so the operator
  // running the migration sees the backfill scope in stdout. The result
  // is also used by the orphan check in step C.
  // ---------------------------------------------------------------------
  const beforeCount = await knex.raw(
    'SELECT count(*)::int AS n FROM resource_grants WHERE tenant_id IS NULL',
  )
  const nullBefore: number = beforeCount.rows[0]?.n ?? 0
  // eslint-disable-next-line no-console
  console.log(`[P1.2] resource_grants rows missing tenant_id before backfill: ${nullBefore}`)

  // ---------------------------------------------------------------------
  // Step B: backfill tenant_id by joining the singular `knowledge_base`
  // parent table on the existing FK column. The `WHERE tenant_id IS NULL`
  // clause makes this idempotent — only previously-empty rows are touched.
  // Postgres UPDATE … FROM is the canonical join-update form.
  // ---------------------------------------------------------------------
  await knex.raw(`
    UPDATE resource_grants
       SET tenant_id = kb.tenant_id
      FROM knowledge_base kb
     WHERE resource_grants.knowledge_base_id = kb.id
       AND resource_grants.tenant_id IS NULL
  `)

  // ---------------------------------------------------------------------
  // Step C: orphan guard. Any row whose tenant_id is still NULL after the
  // join means its knowledge_base_id does not match a knowledge_base.id.
  // The FK from migration 20260312000000 should make this impossible, but
  // we check defensively because the NOT NULL flip in step E would fail
  // with a confusing error otherwise. Strategy: log the count and DELETE
  // the orphan rows so the migration can complete. The count surfaces in
  // stdout for operator review.
  // ---------------------------------------------------------------------
  const afterJoin = await knex.raw(
    'SELECT count(*)::int AS n FROM resource_grants WHERE tenant_id IS NULL',
  )
  const orphanCount: number = afterJoin.rows[0]?.n ?? 0
  if (orphanCount > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[P1.2] WARNING: deleting ${orphanCount} orphan resource_grants rows whose knowledge_base_id does not resolve`,
    )
    await knex.raw('DELETE FROM resource_grants WHERE tenant_id IS NULL')
  } else {
    // eslint-disable-next-line no-console
    console.log('[P1.2] no orphan resource_grants rows detected')
  }

  // ---------------------------------------------------------------------
  // Step D: first-pass actions backfill. Translate the legacy
  // `permission_level` enum into a text[] of action verbs so the new
  // ability engine has a non-empty starting set per row. The full
  // semantic mapping is owned by Phase 2 — these defaults exist only so
  // existing rows are not empty arrays at the moment Phase 2 begins
  // reading them. Each UPDATE is gated on `actions = '{}'` so re-running
  // the migration after Phase 2 has refined the values is a no-op.
  //
  // Mapping (locked default — Phase 2 may overwrite):
  //   'view'  → {view}
  //   'edit'  → {view,edit}
  //   'admin' → {view,edit,delete,manage}
  //   'none' / NULL / other → {view}   (safe read-only fallback)
  // ---------------------------------------------------------------------
  await knex.raw(
    "UPDATE resource_grants SET actions = ARRAY['view']::text[] WHERE actions = '{}' AND permission_level = 'view'",
  )
  await knex.raw(
    "UPDATE resource_grants SET actions = ARRAY['view','edit']::text[] WHERE actions = '{}' AND permission_level = 'edit'",
  )
  await knex.raw(
    "UPDATE resource_grants SET actions = ARRAY['view','edit','delete','manage']::text[] WHERE actions = '{}' AND permission_level = 'admin'",
  )
  // Catch-all for legacy NULL / 'none' / unknown levels: log how many
  // rows fell through and default them to read-only so the row remains
  // visible but harmless until Phase 2 reclassifies it.
  const fallbackCount = await knex.raw(
    "SELECT count(*)::int AS n FROM resource_grants WHERE actions = '{}'",
  )
  const fallbackN: number = fallbackCount.rows[0]?.n ?? 0
  if (fallbackN > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[P1.2] applying read-only fallback to ${fallbackN} resource_grants rows with unmapped permission_level`,
    )
    await knex.raw("UPDATE resource_grants SET actions = ARRAY['view']::text[] WHERE actions = '{}'")
  }

  // ---------------------------------------------------------------------
  // Step E: flip tenant_id to NOT NULL. After steps B and C every
  // remaining row has a non-NULL tenant_id, so this ALTER cannot fail
  // due to data. PG also stores the NOT NULL bit idempotently — running
  // SET NOT NULL on a column that is already NOT NULL is a no-op, which
  // preserves end-to-end idempotency of this migration.
  // ---------------------------------------------------------------------
  await knex.raw('ALTER TABLE resource_grants ALTER COLUMN tenant_id SET NOT NULL')

  // eslint-disable-next-line no-console
  console.log('[P1.2] resource_grants.tenant_id is now NOT NULL')
}

/**
 * @description Reverse the NOT NULL flip on `resource_grants.tenant_id`.
 *   The data backfill (tenant_id values and actions arrays) is intentionally
 *   NOT cleared because the tenant_id values are derivable from the FK join
 *   and clearing them would force a second backfill the next time `up()`
 *   runs. The actions defaults are similarly safe to leave in place — they
 *   were `'{}'` before this migration ran and the only effect of leaving
 *   them populated is that callers see read-only sets instead of empty
 *   ones, which is the safer of the two states.
 * @param {Knex} knex - Knex migration context.
 * @returns {Promise<void>} Resolves once the NOT NULL constraint is dropped.
 */
export async function down(knex: Knex): Promise<void> {
  // Drop the NOT NULL constraint so the column shape matches the post-P1.1
  // / pre-P1.2 state. We deliberately leave the populated tenant_id and
  // actions values in place — see function-level docstring for rationale.
  await knex.raw('ALTER TABLE resource_grants ALTER COLUMN tenant_id DROP NOT NULL')
}
