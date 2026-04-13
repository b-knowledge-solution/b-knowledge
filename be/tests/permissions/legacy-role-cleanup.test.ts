import { describe, expect, it } from 'vitest'
import { withScratchDb, withScratchDbStoppingBefore } from './_helpers.js'
import { up as runLegacyRoleCleanup } from '../../src/shared/db/migrations/20260409093432_phase06_legacy_role_cleanup.js'

/**
 * @description Build the minimum users table fixture needed for legacy-role
 * migration tests while allowing callers to override the role under test.
 * @param {string} id - Stable user identifier for the seeded row.
 * @param {string} email - Unique email for the seeded row.
 * @param {string} role - Role value to seed before the cleanup migration runs.
 * @returns {{id: string, email: string, display_name: string, role: string}} Insert payload for `users`.
 */
function makeLegacyUserFixture(id: string, email: string, role: string): {
  id: string
  email: string
  display_name: string
  role: string
} {
  return {
    id,
    email,
    display_name: id,
    role,
  }
}

/**
 * @description Integration tests for the phase06 legacy-role cleanup
 * migration. Covers the pre-check abort path, the two conditional updates,
 * and idempotency against scratch Postgres schemas.
 */
describe('phase06_legacy_role_cleanup migration', () => {
  const MIGRATION_SLUG = '_phase06_legacy_role_cleanup.ts'

  it('is a no-op on a clean migrated DB', async () => {
    await withScratchDb(async (knex) => {
      const rows = await knex('users').whereIn('role', ['member', 'superadmin']).select('id')
      expect(rows).toHaveLength(0)
    })
  })

  it("rewrites users.role='member' -> 'user'", async () => {
    await withScratchDbStoppingBefore(MIGRATION_SLUG, async (knex) => {
      // Seed the legacy alias before the cleanup migration runs.
      await knex('users').insert(
        makeLegacyUserFixture(
          '00000000-0000-0000-0000-0000000000aa',
          'legacy-member@test.local',
          'member',
        ),
      )

      await knex.migrate.up()

      const row = await knex('users')
        .where({ id: '00000000-0000-0000-0000-0000000000aa' })
        .first('role')

      expect(row?.role).toBe('user')
    })
  })

  it("rewrites users.role='superadmin' -> 'super-admin'", async () => {
    await withScratchDbStoppingBefore(MIGRATION_SLUG, async (knex) => {
      // Seed the legacy alias before the cleanup migration runs.
      await knex('users').insert(
        makeLegacyUserFixture(
          '00000000-0000-0000-0000-0000000000bb',
          'legacy-sa@test.local',
          'superadmin',
        ),
      )

      await knex.migrate.up()

      const row = await knex('users')
        .where({ id: '00000000-0000-0000-0000-0000000000bb' })
        .first('role')

      expect(row?.role).toBe('super-admin')
    })
  })

  it('aborts with a descriptive error when users table contains an unknown role', async () => {
    await withScratchDbStoppingBefore(MIGRATION_SLUG, async (knex) => {
      // Seed an unsupported role to prove the pre-check aborts before updates.
      await knex('users').insert(
        makeLegacyUserFixture(
          '00000000-0000-0000-0000-0000000000cc',
          'ghost@test.local',
          'ghost',
        ),
      )

      await expect(knex.migrate.up()).rejects.toThrow(/ghost/)

      const row = await knex('users')
        .where({ id: '00000000-0000-0000-0000-0000000000cc' })
        .first('role')

      expect(row?.role).toBe('ghost')

      // Remove the intentionally-invalid row so the helper's trailing
      // migrate.latest() can finish cleanly during teardown.
      await knex('users').where({ id: '00000000-0000-0000-0000-0000000000cc' }).delete()
    })
  })

  it('is idempotent on re-run (second run is a no-op)', async () => {
    await withScratchDb(async (knex) => {
      // Seed legacy aliases into an already-migrated schema, then re-run the
      // migration's exported up() function directly to prove it remains safe.
      await knex('users').insert([
        makeLegacyUserFixture(
          '00000000-0000-0000-0000-0000000000dd',
          'legacy-member-rerun@test.local',
          'member',
        ),
        makeLegacyUserFixture(
          '00000000-0000-0000-0000-0000000000ee',
          'legacy-superadmin-rerun@test.local',
          'superadmin',
        ),
      ])

      await runLegacyRoleCleanup(knex)

      const rowsAfterFirstRun = await knex('users')
        .whereIn('id', [
          '00000000-0000-0000-0000-0000000000dd',
          '00000000-0000-0000-0000-0000000000ee',
        ])
        .orderBy('id')
        .select('id', 'role')

      await expect(runLegacyRoleCleanup(knex)).resolves.toBeUndefined()

      const rowsAfterSecondRun = await knex('users')
        .whereIn('id', [
          '00000000-0000-0000-0000-0000000000dd',
          '00000000-0000-0000-0000-0000000000ee',
        ])
        .orderBy('id')
        .select('id', 'role')

      expect(rowsAfterFirstRun).toEqual([
        { id: '00000000-0000-0000-0000-0000000000dd', role: 'user' },
        { id: '00000000-0000-0000-0000-0000000000ee', role: 'super-admin' },
      ])
      expect(rowsAfterSecondRun).toEqual(rowsAfterFirstRun)
    })
  })
})
