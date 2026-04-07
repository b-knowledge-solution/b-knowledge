/**
 * @fileoverview Phase 1 / P1.1 — Schema migration assertions.
 *
 * Verifies that the foundation tables are created, the
 * `knowledge_base_entity_permissions → resource_grants` rename and column
 * reshape are applied, the new uniqueness constraint and indexes are in
 * place, the pre-existing FK to `knowledge_bases` survives the rename, and
 * the migration round-trips cleanly through `down()`.
 */
import { describe, expect, it } from 'vitest'
import { roundTripMigration, withScratchDb } from './_helpers.js'

describe('Phase 1 migrations — schema', () => {
  it('creates permissions, role_permissions, user_permission_overrides', () =>
    withScratchDb(async (knex) => {
      // All three foundation tables must exist after migrate.latest.
      expect(await knex.schema.hasTable('permissions')).toBe(true)
      expect(await knex.schema.hasTable('role_permissions')).toBe(true)
      expect(await knex.schema.hasTable('user_permission_overrides')).toBe(true)
    }))

  it('permissions table has subject NOT NULL column for CASL ability builder', () =>
    withScratchDb(async (knex) => {
      // The CASL ability builder reads (action, subject) tuples, so subject
      // must exist as a NOT NULL text column.
      expect(await knex.schema.hasColumn('permissions', 'subject')).toBe(true)
      const col = await knex.raw(
        "SELECT is_nullable, data_type FROM information_schema.columns WHERE table_name='permissions' AND column_name='subject'",
      )
      expect(col.rows[0].is_nullable).toBe('NO')
      expect(col.rows[0].data_type).toBe('text')
    }))

  it('role_permissions allows global default + tenant override on same (role, permission_key)', () =>
    withScratchDb(async (knex) => {
      // tenant_id IS NULL means "global role default"; non-NULL is a tenant override.
      // Both should coexist for the same (role, permission_key) pair.
      await knex('role_permissions').insert({
        id: knex.raw("md5(random()::text)"),
        role: 'admin',
        permission_key: 'kb.view',
        tenant_id: null,
      })
      await knex('role_permissions').insert({
        id: knex.raw("md5(random()::text)"),
        role: 'admin',
        permission_key: 'kb.view',
        tenant_id: 'tenant-fixture-1',
      })
      // A third row that duplicates either of the existing tuples must fail.
      await expect(
        knex('role_permissions').insert({
          id: knex.raw("md5(random()::text)"),
          role: 'admin',
          permission_key: 'kb.view',
          tenant_id: 'tenant-fixture-1',
        }),
      ).rejects.toThrow()
    }))

  it('user_permission_overrides allows allow + deny on same (tenant,user,key) but rejects duplicate effect', () =>
    withScratchDb(async (knex) => {
      // Seed a user row to satisfy the FK on user_id.
      await knex('users').insert({
        id: 'user-override-fixture',
        email: 'override-fixture@example.com',
        display_name: 'override',
      })
      const base = {
        tenant_id: 'tenant-override-fixture',
        user_id: 'user-override-fixture',
        permission_key: 'kb.edit',
      }
      // Both an allow and a deny on the same key are legitimate — deny wins via CASL.
      await knex('user_permission_overrides').insert({
        id: knex.raw("md5(random()::text)"),
        ...base,
        effect: 'allow',
      })
      await knex('user_permission_overrides').insert({
        id: knex.raw("md5(random()::text)"),
        ...base,
        effect: 'deny',
      })
      // A duplicate (tenant, user, key, effect) tuple must violate the unique.
      await expect(
        knex('user_permission_overrides').insert({
          id: knex.raw("md5(random()::text)"),
          ...base,
          effect: 'deny',
        }),
      ).rejects.toThrow()
    }))

  it('renames knowledge_base_entity_permissions to resource_grants', () =>
    withScratchDb(async (knex) => {
      // The renamed table exists and the legacy name does not.
      expect(await knex.schema.hasTable('resource_grants')).toBe(true)
      expect(await knex.schema.hasTable('knowledge_base_entity_permissions')).toBe(false)
    }))

  it('renames entity_type/entity_id to resource_type/resource_id', () =>
    withScratchDb(async (knex) => {
      // New column names exist; legacy ones are gone.
      expect(await knex.schema.hasColumn('resource_grants', 'resource_type')).toBe(true)
      expect(await knex.schema.hasColumn('resource_grants', 'resource_id')).toBe(true)
      expect(await knex.schema.hasColumn('resource_grants', 'entity_type')).toBe(false)
      expect(await knex.schema.hasColumn('resource_grants', 'entity_id')).toBe(false)
    }))

  it('adds actions text[] with default {}', () =>
    withScratchDb(async (knex) => {
      // Validate the array type and default literal via information_schema.
      const col = await knex.raw(
        "SELECT data_type, udt_name, column_default FROM information_schema.columns WHERE table_name='resource_grants' AND column_name='actions'",
      )
      // Postgres reports text arrays as `_text` in udt_name.
      expect(col.rows[0].udt_name).toBe('_text')
      expect(String(col.rows[0].column_default)).toContain("'{}'")
    }))

  it('adds tenant_id (nullable until P1.2) and expires_at', () =>
    withScratchDb(async (knex) => {
      expect(await knex.schema.hasColumn('resource_grants', 'tenant_id')).toBe(true)
      expect(await knex.schema.hasColumn('resource_grants', 'expires_at')).toBe(true)
    }))

  it('enforces UNIQUE(resource_type, resource_id, grantee_type, grantee_id)', () =>
    withScratchDb(async (knex) => {
      // Look up the unique constraint by name on the renamed table.
      const result = await knex.raw(`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'resource_grants'::regclass AND contype = 'u'
      `)
      const names = result.rows.map((r: { conname: string }) => r.conname).join(',')
      // Constraint name encodes the four columns in the order locked by REQUIREMENTS TS1.
      expect(names).toMatch(/resource_type.*resource_id.*grantee/)
    }))

  it('rejects duplicate (resource_type, resource_id, grantee_type, grantee_id) inserts', () =>
    withScratchDb(async (knex) => {
      // Insert one row, then attempt the same key tuple — second insert must fail.
      const baseRow = {
        id: knex.raw("md5(random()::text)"),
        knowledge_base_id: 'kb-fixture',
        resource_type: 'DocumentCategory',
        resource_id: 'cat-fixture',
        grantee_type: 'user',
        grantee_id: 'user-fixture',
        // Legacy NOT NULL column carried forward unchanged in P1.1.
        permission_level: 'view',
      }
      await knex('resource_grants').insert(baseRow)
      // Same key tuple — must violate the new unique constraint.
      await expect(
        knex('resource_grants').insert({ ...baseRow, id: knex.raw("md5(random()::text)") }),
      ).rejects.toThrow()
    }))

  it('accepts inserts with actions = {view,edit}', () =>
    withScratchDb(async (knex) => {
      // Validates that the text[] column round-trips a multi-element literal.
      const inserted = await knex('resource_grants')
        .insert({
          id: knex.raw("md5(random()::text)"),
          knowledge_base_id: 'kb-actions-fixture',
          resource_type: 'KnowledgeBase',
          resource_id: 'kb-actions-fixture',
          grantee_type: 'user',
          grantee_id: 'user-actions-fixture',
          permission_level: 'edit',
          actions: '{view,edit}',
        })
        .returning(['id', 'actions'])
      expect(inserted.length).toBe(1)
      // Postgres returns the array as a JS array via the pg driver.
      expect(inserted[0].actions).toEqual(['view', 'edit'])
    }))

  it('preserves the FK from resource_grants to knowledge_bases after rename', () =>
    withScratchDb(async (knex) => {
      // The pre-existing FK on knowledge_base_entity_permissions.knowledge_base_id
      // must survive the table rename (Postgres preserves FK metadata).
      const fks = await knex.raw(`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'resource_grants'::regclass AND contype = 'f'
      `)
      expect(fks.rows.some((r: { conname: string }) => r.conname.includes('knowledge_base'))).toBe(true)
    }))

  it('round-trips up → down → up cleanly and restores the legacy schema after down()', () =>
    roundTripMigration('20260407052129_phase1_rename_entity_permissions_to_resource_grants.ts', async ({ knex }) => {
      // After rollback, the legacy table must exist and the renamed one must NOT.
      expect(await knex.schema.hasTable('knowledge_base_entity_permissions')).toBe(true)
      expect(await knex.schema.hasTable('resource_grants')).toBe(false)
      // The new tables created by P1.1 migration 1 must also be gone (rollback unwinds the whole batch).
      expect(await knex.schema.hasTable('permissions')).toBe(false)
      expect(await knex.schema.hasTable('role_permissions')).toBe(false)
      expect(await knex.schema.hasTable('user_permission_overrides')).toBe(false)
      // Legacy column names are back.
      expect(await knex.schema.hasColumn('knowledge_base_entity_permissions', 'entity_type')).toBe(true)
      expect(await knex.schema.hasColumn('knowledge_base_entity_permissions', 'entity_id')).toBe(true)
    }))
})
