import type { Knex } from 'knex'

/**
 * @description Phase 6 legacy role cleanup. Rewrites any lingering legacy
 * UserRole values (`'member'` -> `'user'`, `'superadmin'` -> `'super-admin'`)
 * and aborts if the table contains unknown role values.
 *
 * Scope notes (per Phase 6 CONTEXT.md amendment A-1):
 *   - The `users.role` column default is ALREADY `'user'` (see
 *     20260312000000_initial_schema.ts:33). No `ALTER COLUMN ... DEFAULT`
 *     statement is emitted here - it would be a no-op at best, a
 *     regression at worst.
 *   - The `'member'` default at 20260312000000_initial_schema.ts:93 is on
 *     `user_teams.role` (TeamRole.MEMBER) and is PRESERVED per D-04.
 *   - Seed file `00_sample_users.ts:295` also writes a TeamRole row and
 *     is NOT touched by this phase.
 *
 * @param {Knex} knex - Knex instance scoped to the migration transaction.
 * @returns {Promise<void>}
 * @throws {Error} When the users table contains non-canonical unknown role values.
 */
export async function up(knex: Knex): Promise<void> {
  // Include the two legacy spellings so the pre-check can distinguish
  // "known but needs rewrite" from "unknown and unsafe to mutate".
  const knownRoles = ['user', 'admin', 'super-admin', 'leader', 'member', 'superadmin']

  // Abort before mutating anything if the table contains role values that
  // this migration does not know how to normalize safely.
  const unknown = await knex('users')
    .whereNotIn('role', knownRoles)
    .distinct('role')
    .select<{ role: string }[]>('role')

  // Surface the exact offending values so the operator can repair data
  // manually before re-running the migration.
  if (unknown.length > 0) {
    const values = unknown.map((row) => row.role).join(', ')
    throw new Error(
      `phase06_legacy_role_cleanup: users table contains unknown role values: ${values}. ` +
        `Reconcile these rows manually before re-running this migration.`,
    )
  }

  // Rewrite the legacy member alias to the canonical user role.
  await knex('users').where({ role: 'member' }).update({ role: 'user' })

  // Rewrite the non-hyphenated superadmin alias to the canonical enum value.
  await knex('users').where({ role: 'superadmin' }).update({ role: 'super-admin' })
}

/**
 * @description Intentional no-op rollback. Per Phase 6 amendment A-1, this
 * migration does not restore legacy aliases because the rename is one-way
 * cleanup data and the feature-flag rollback lives in the Phase 3 engine
 * cutover path, not in `users.role`.
 * @param {Knex} _knex - Unused Knex instance retained for the migration API.
 * @returns {Promise<void>}
 */
export async function down(_knex: Knex): Promise<void> {
  // No-op by design. Restoring legacy aliases would reintroduce invalid data.
}
