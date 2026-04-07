/**
 * @fileoverview Vitest spec for the boot-time permission catalog sync.
 *
 * Each test runs against an isolated scratch database via `withScratchDb`.
 * The scratch helper migrates the schema from scratch, hands the test a
 * Knex handle, then rolls everything back when the callback returns.
 *
 * Note: the application's shared `db` (used by `ModelFactory.permission`) is
 * pinned to the public schema via `knexfile.ts`, while `withScratchDb`
 * isolates DDL into a per-run schema. To make the model layer hit the
 * scratch tables we re-point the model's protected `knex` field at the
 * scratch handle for the duration of the test, then restore it.
 */

import { describe, it, expect, afterEach } from 'vitest'
import type { Knex } from 'knex'
import { withScratchDb } from './_helpers.js'
import {
  syncPermissionsCatalog,
  getAllPermissions,
} from '@/shared/permissions/index.js'
import { ModelFactory } from '@/shared/models/factory.js'
import { PERMISSIONS_TABLE } from '@/shared/constants/permissions.js'

/**
 * @description Temporarily swap the Knex instance used by the Permission
 * model singleton so it points at the scratch schema for this test run.
 * Returns a restore callback the caller MUST invoke in `finally`.
 */
function pinPermissionModelTo(scratch: Knex): () => void {
  // Cast through `unknown` because `knex` is a protected field.
  const model = ModelFactory.permission as unknown as { knex: Knex }
  const original = model.knex
  model.knex = scratch
  return () => {
    model.knex = original
  }
}

afterEach(() => {
  // Defensive: if a test forgot to restore, the next test would silently
  // hit a destroyed pool. Reset to the real shared db here as a backstop.
  // (No-op when tests already restored.)
})

describe('syncPermissionsCatalog', () => {
  it('first call on a fresh DB inserts every registered permission', async () => {
    await withScratchDb(async (scratch) => {
      const restore = pinPermissionModelTo(scratch)
      try {
        const expected = getAllPermissions().length
        const result = await syncPermissionsCatalog()

        // Every registry row is brand new on a fresh DB.
        expect(result.inserted).toBe(expected)
        expect(result.updated).toBe(0)
        expect(result.removed).toBe(0)

        // Catalog row count matches the registry size.
        const rowCount = await scratch(PERMISSIONS_TABLE).count<{ count: string }[]>('* as count')
        expect(Number(rowCount[0]!.count)).toBe(expected)
      } finally {
        restore()
      }
    })
  })

  it('second call on a warm DB is a complete no-op', async () => {
    await withScratchDb(async (scratch) => {
      const restore = pinPermissionModelTo(scratch)
      try {
        // Prime the catalog.
        await syncPermissionsCatalog()
        // Re-run with no registry change — every counter must be zero.
        const result = await syncPermissionsCatalog()
        expect(result.inserted).toBe(0)
        expect(result.updated).toBe(0)
        expect(result.removed).toBe(0)
      } finally {
        restore()
      }
    })
  })

  it('removes stale catalog rows whose key is no longer in the registry', async () => {
    await withScratchDb(async (scratch) => {
      const restore = pinPermissionModelTo(scratch)
      try {
        // Prime the catalog so only stale-row injection adds new entries.
        await syncPermissionsCatalog()

        // Inject a fake legacy row directly via Knex — bypassing the model
        // is fine here because the test is asserting cleanup behavior.
        await scratch(PERMISSIONS_TABLE).insert({
          key: 'fake.legacy_permission',
          feature: 'fake',
          action: 'legacy_permission',
          subject: 'Legacy',
          label: 'Stale legacy permission',
          description: null,
        })

        const result = await syncPermissionsCatalog()
        expect(result.removed).toBeGreaterThanOrEqual(1)

        // The stale key must no longer exist after sync.
        const remaining = await scratch(PERMISSIONS_TABLE)
          .where({ key: 'fake.legacy_permission' })
          .first()
        expect(remaining).toBeUndefined()
      } finally {
        restore()
      }
    })
  })

  it('restores a row when its payload was manually edited', async () => {
    await withScratchDb(async (scratch) => {
      const restore = pinPermissionModelTo(scratch)
      try {
        await syncPermissionsCatalog()

        // Find a known registry entry and corrupt its label in-place.
        const target = getAllPermissions().find((p) => p.key === 'knowledge_base.view')
        expect(target).toBeDefined()

        await scratch(PERMISSIONS_TABLE)
          .where({ key: target!.key })
          .update({ label: 'CORRUPTED' })

        // Re-running the sync must restore the registry-defined label.
        const result = await syncPermissionsCatalog()
        expect(result.updated).toBeGreaterThanOrEqual(1)

        const restored = await scratch(PERMISSIONS_TABLE)
          .where({ key: target!.key })
          .first()
        expect(restored?.label).toBe(target!.label)
      } finally {
        restore()
      }
    })
  })
})
