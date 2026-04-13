/**
 * @fileoverview Phase 1 / P1.2 — Backfill migration assertions.
 *
 * Verifies that the backfill migration:
 *   1. Flips `resource_grants.tenant_id` to NOT NULL.
 *   2. Populates `tenant_id` from the parent `knowledge_base.tenant_id`
 *      for rows inserted under the legacy NULL-tenant shape.
 *   3. Populates `actions` from the legacy `permission_level` enum using
 *      the locked first-pass mapping (`view`/`edit`/`admin`/fallback).
 *   4. Is idempotent — re-running migrate.latest() after head is reached
 *      is a no-op and does not corrupt previously-populated rows.
 */
import { describe, expect, it } from 'vitest'
import { withScratchDb, withScratchDbStoppingBefore } from './_helpers.js'

// Filename of the P1.2 backfill migration. Centralized so the helper
// invocation and the assertions cannot drift.
const BACKFILL_MIGRATION = '20260407053000_phase1_backfill_resource_grants.ts'

describe('Phase 1.2 — resource_grants backfill', () => {
  it('marks tenant_id as NOT NULL after migrations run', () =>
    withScratchDb(async (knex) => {
      // information_schema is the source of truth for column nullability.
      // Scope to current_schema() so the scratch schema's row wins over
      // any leftover row from the public schema (if a developer has run
      // migrations against their working DB).
      const col = await knex.raw(
        "SELECT is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name='resource_grants' AND column_name='tenant_id'",
      )
      expect(col.rows.length).toBeGreaterThan(0)
      expect(col.rows[0].is_nullable).toBe('NO')
    }))

  it('rejects inserts with tenant_id = NULL after backfill', () =>
    withScratchDb(async (knex) => {
      // Seed a parent KB so the FK on knowledge_base_id is satisfied; then
      // attempt to insert a grant with NULL tenant_id and assert the NOT
      // NULL constraint rejects it.
      await knex.transaction(async (trx) => {
        const [kb] = await trx('knowledge_base')
          .insert({ name: 'rg-notnull-fixture-kb' })
          .returning(['id'])
        await expect(
          trx('resource_grants').insert({
            id: trx.raw("md5(random()::text)"),
            knowledge_base_id: kb.id,
            resource_type: 'KnowledgeBase',
            resource_id: kb.id,
            grantee_type: 'user',
            grantee_id: 'user-notnull-fixture',
            permission_level: 'view',
            tenant_id: null,
          }),
        ).rejects.toThrow()
        // Force fixture rollback so the scratch schema is clean.
        throw new Error('__rollback__')
      }).catch((err) => {
        if ((err as Error).message !== '__rollback__') throw err
      })
    }))

  it('backfills legacy rows: tenant_id from parent KB + actions from permission_level mapping', async () => {
    // Seed legacy rows BEFORE the backfill migration runs, then assert
    // AFTER it has run, all in the same scratch DB. The helper
    // `withScratchDbStoppingBefore` runs migrate.latest() AFTER the
    // callback returns, so to inspect the post-migrate rows while the
    // scratch handle is still alive we run migrate.latest() ourselves
    // inside the callback — the helper's trailing call then becomes a
    // no-op (which also doubles as an idempotency check at teardown).
    let assertionsRan = false
    await withScratchDbStoppingBefore(BACKFILL_MIGRATION, async (knex) => {
      // Seed a parent KB and a set of legacy grant rows whose tenant_id
      // and actions reflect the pre-P1.2 NULL/empty state.
      const [kb] = await knex('knowledge_base')
        .insert({ name: 'rg-postmigrate-fixture-kb', tenant_id: 'tenant-postmigrate-1' })
        .returning(['id', 'tenant_id'])

      await knex('resource_grants').insert([
        {
          id: knex.raw("md5(random()::text)"),
          knowledge_base_id: kb.id,
          resource_type: 'KnowledgeBase',
          resource_id: kb.id,
          grantee_type: 'user',
          grantee_id: 'user-pm-view',
          permission_level: 'view',
        },
        {
          id: knex.raw("md5(random()::text)"),
          knowledge_base_id: kb.id,
          resource_type: 'KnowledgeBase',
          resource_id: kb.id,
          grantee_type: 'user',
          grantee_id: 'user-pm-edit',
          permission_level: 'edit',
        },
        {
          id: knex.raw("md5(random()::text)"),
          knowledge_base_id: kb.id,
          resource_type: 'KnowledgeBase',
          resource_id: kb.id,
          grantee_type: 'user',
          grantee_id: 'user-pm-admin',
          permission_level: 'admin',
        },
        {
          id: knex.raw("md5(random()::text)"),
          knowledge_base_id: kb.id,
          resource_type: 'KnowledgeBase',
          resource_id: kb.id,
          grantee_type: 'user',
          grantee_id: 'user-pm-fallback',
          permission_level: 'none',
        },
      ])

      // Run the backfill migration (and any later ones) ourselves so we
      // can inspect rows while the scratch schema is still alive. The
      // helper's trailing migrate.latest() will then be a no-op.
      await knex.migrate.latest()

      // ---- Assertions: tenant_id is populated for every legacy row ----
      const rows = await knex('resource_grants')
        .whereIn('grantee_id', ['user-pm-view', 'user-pm-edit', 'user-pm-admin', 'user-pm-fallback'])
        .orderBy('grantee_id')
        .select('grantee_id', 'tenant_id', 'actions')

      expect(rows).toHaveLength(4)
      // Every row inherited the parent KB's tenant_id.
      expect(rows.every((r) => r.tenant_id === kb.tenant_id)).toBe(true)

      // ---- Assertions: actions arrays match the locked mapping ----
      const byGrantee = Object.fromEntries(rows.map((r) => [r.grantee_id, r.actions])) as Record<
        string,
        string[]
      >
      expect(byGrantee['user-pm-view']).toEqual(['view'])
      expect(byGrantee['user-pm-edit']).toEqual(['view', 'edit'])
      expect(byGrantee['user-pm-admin']).toEqual(['view', 'edit', 'delete', 'manage'])
      // Fallback row (`permission_level='none'`) defaults to read-only.
      expect(byGrantee['user-pm-fallback']).toEqual(['view'])

      // ---- Idempotency: re-run migrate.latest() — must be a no-op. ----
      // If the backfill UPDATEs were not gated, the second run would
      // either error or rewrite already-correct rows. Re-run and re-check.
      await knex.migrate.latest()
      const rowsAfter = await knex('resource_grants')
        .whereIn('grantee_id', ['user-pm-view', 'user-pm-edit', 'user-pm-admin', 'user-pm-fallback'])
        .orderBy('grantee_id')
        .select('grantee_id', 'tenant_id', 'actions')
      expect(rowsAfter).toEqual(rows)

      assertionsRan = true
    })
    // Make sure the inner block actually executed; otherwise a silent
    // helper short-circuit would let the test pass with zero coverage.
    expect(assertionsRan).toBe(true)
  })
})
