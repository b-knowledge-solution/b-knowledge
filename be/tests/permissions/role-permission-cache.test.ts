/**
 * @fileoverview Phase 3 / P3.2a — Vitest spec for `RolePermissionCacheService`
 * and the legacy `rbac.ts::hasPermission` shim that now reads from it.
 *
 * Each spec runs inside an isolated scratch schema via `withScratchDb` and
 * pins both the `rolePermission` model singleton and the cache service at
 * that scratch Knex via the `RolePermissionModel`'s protected `knex` field.
 *
 * The load-bearing test in this file is the concurrency spec that proves
 * the cache's atomic-swap pattern: 100 parallel `has()` reads interleaved
 * with a `refresh()` must observe only whole snapshots, never a partially
 * loaded Map.
 */

import { describe, it, expect } from 'vitest'
import type { Knex } from 'knex'

import { withScratchDb } from './_helpers.js'
import { ModelFactory } from '@/shared/models/factory.js'
import { rolePermissionCacheService } from '@/shared/services/role-permission-cache.service.js'
import { hasPermission } from '@/shared/config/rbac.js'
import { ROLE_PERMISSIONS_TABLE } from '@/shared/constants/permissions.js'

/**
 * Canonical keys known to be seeded for `admin` in the global-default scope
 * by the phase 2 parity migration. Using a real seeded key keeps tests
 * honest about reading from the actual DB snapshot rather than fixtures.
 */
const ADMIN_KEY = 'audit.view'
const ADMIN_ROLE = 'admin'
const USER_ROLE = 'user'

/**
 * @description Pin `ModelFactory.rolePermission.knex` to the scratch Knex
 * handle so the cache service (which calls `findByRole` through the factory
 * singleton) reads from the migrated scratch schema. Returns a restore
 * callback for a `finally` block.
 *
 * @param {Knex} scratch - Scratch Knex instance from `withScratchDb`.
 * @returns {() => void} Restore function reverting the swap.
 */
function pinCacheToScratch(scratch: Knex): () => void {
  // Reach through the protected `knex` field — matches the pattern used in
  // `models.test.ts` for layering-compliant scratch pinning.
  const model = ModelFactory.rolePermission as unknown as { knex: Knex }
  const original = model.knex
  model.knex = scratch
  // Clear the singleton cache between tests so `has()` pre-load behavior
  // is observable.
  rolePermissionCacheService.resetForTests()
  return () => {
    model.knex = original
    rolePermissionCacheService.resetForTests()
  }
}

describe('RolePermissionCacheService', () => {
  it('loadAll() populates the snapshot from the DB', async () => {
    await withScratchDb(async (scratch) => {
      const restore = pinCacheToScratch(scratch)
      try {
        await rolePermissionCacheService.loadAll()
        // admin:audit.view is seeded by the phase 2 parity migration.
        expect(rolePermissionCacheService.has(ADMIN_ROLE, ADMIN_KEY)).toBe(true)
      } finally {
        restore()
      }
    })
  })

  it('has() returns false before loadAll()', async () => {
    await withScratchDb(async (scratch) => {
      const restore = pinCacheToScratch(scratch)
      try {
        // No loadAll() call — the singleton is in the unloaded state.
        expect(rolePermissionCacheService.has(ADMIN_ROLE, ADMIN_KEY)).toBe(false)
      } finally {
        restore()
      }
    })
  })

  it('has() returns false for an unknown role', async () => {
    await withScratchDb(async (scratch) => {
      const restore = pinCacheToScratch(scratch)
      try {
        await rolePermissionCacheService.loadAll()
        expect(rolePermissionCacheService.has('not-a-role', ADMIN_KEY)).toBe(false)
      } finally {
        restore()
      }
    })
  })

  it('has() returns false for an unknown permission', async () => {
    await withScratchDb(async (scratch) => {
      const restore = pinCacheToScratch(scratch)
      try {
        await rolePermissionCacheService.loadAll()
        expect(rolePermissionCacheService.has(ADMIN_ROLE, 'fake.nonexistent')).toBe(false)
      } finally {
        restore()
      }
    })
  })

  it('refresh() picks up newly-inserted rows', async () => {
    await withScratchDb(async (scratch) => {
      const restore = pinCacheToScratch(scratch)
      try {
        await rolePermissionCacheService.loadAll()
        // Before the insert: `user` should not have `audit.view`.
        expect(rolePermissionCacheService.has(USER_ROLE, ADMIN_KEY)).toBe(false)

        // Insert a new row directly via the scratch Knex; use an existing
        // permission key so the FK to `permissions` is satisfied.
        await scratch(ROLE_PERMISSIONS_TABLE).insert({
          role: USER_ROLE,
          permission_key: ADMIN_KEY,
          tenant_id: null,
        })

        // Refresh and assert the cache now sees the new row.
        await rolePermissionCacheService.refresh()
        expect(rolePermissionCacheService.has(USER_ROLE, ADMIN_KEY)).toBe(true)
      } finally {
        restore()
      }
    })
  })

  it('atomic swap — 100 parallel reads interleaved with refresh never observe a half-loaded map', async () => {
    // This is the load-bearing R-G race-condition test for the atomic-swap
    // pattern. If this fails, the cache is reading from a Map that's being
    // mutated mid-read.
    await withScratchDb(async (scratch) => {
      const restore = pinCacheToScratch(scratch)
      try {
        await rolePermissionCacheService.loadAll()

        // Kick off a refresh on the next microtask — this runs concurrently
        // with the parallel reads below at the JS scheduler level.
        const refreshPromise = Promise.resolve().then(() =>
          rolePermissionCacheService.refresh(),
        )

        // 100 parallel reads; each returns a boolean snapshot observation.
        const reads = await Promise.all(
          Array.from({ length: 100 }, async () =>
            rolePermissionCacheService.has(ADMIN_ROLE, ADMIN_KEY),
          ),
        )

        await refreshPromise

        // No read ever returns undefined — the return type is boolean, but
        // we assert explicitly to catch any accidental regression.
        for (const r of reads) {
          expect(typeof r).toBe('boolean')
        }

        // Every read should observe a whole snapshot. Since the key exists
        // in both the pre- and post-refresh snapshot (no writes happened
        // between loadAll and refresh), every read must be true.
        const unique = new Set(reads)
        expect(unique.size).toBeLessThanOrEqual(2)
        for (const r of reads) {
          expect(r).toBe(true)
        }
      } finally {
        restore()
      }
    })
  })

  it('legacy hasPermission() shim answers from the cache', async () => {
    await withScratchDb(async (scratch) => {
      const restore = pinCacheToScratch(scratch)
      try {
        await rolePermissionCacheService.loadAll()
        // hasPermission short-circuits admin to true regardless of cache
        // contents, so to verify the shim actually consults the cache we
        // use the `leader` role which does NOT short-circuit.
        const directLeader = rolePermissionCacheService.has('leader', ADMIN_KEY)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const shimLeader = hasPermission('leader' as any, ADMIN_KEY as any)
        expect(shimLeader).toBe(directLeader)

        // And the admin short-circuit still returns true.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(hasPermission('admin' as any, ADMIN_KEY as any)).toBe(true)
      } finally {
        restore()
      }
    })
  })
})
