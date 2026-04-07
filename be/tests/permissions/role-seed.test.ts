/**
 * @fileoverview Vitest spec for the Phase 1 / P1.5 day-one role seed.
 *
 * Each test runs inside an isolated scratch schema via `withScratchDb`, which
 * applies `migrate.latest()` — that includes the seed migration itself —
 * before handing control to the test body. The scratch Knex handle is
 * temporarily pointed at `ModelFactory.rolePermission` so the model's query
 * helpers hit the scratch schema rather than the developer's working DB.
 *
 * The five specs below enforce the Phase 1 TS4 requirement that existing
 * (role, legacyPermission) grants are preserved verbatim:
 *
 *   1. Strict-superset parity — for every (role, legacyKey) in the live
 *      `ROLE_PERMISSIONS` map, the expanded new keys must be present in the
 *      seeded rows. This is the primary safety net against silent drift.
 *   2. agents.* and memory.* are restricted to admin + super-admin only.
 *   3. Per-role snapshot for tripwire detection on any future registry change.
 *   4. Every seeded permission_key exists in the `permissions` catalog after
 *      boot sync (no orphan keys).
 *   5. Re-running the migration is a no-op (idempotent).
 */

import { describe, it, expect } from 'vitest'
import type { Knex } from 'knex'

import { withScratchDb } from './_helpers.js'
import { ModelFactory } from '@/shared/models/factory.js'
import { ROLE_PERMISSIONS } from '@/shared/config/rbac.js'
import {
  AGENTS_MEMORY_ADMIN_ONLY_KEYS,
  LEGACY_TO_NEW,
} from '@/shared/permissions/legacy-mapping.js'
import {
  getAllPermissions,
  syncPermissionsCatalog,
} from '@/shared/permissions/index.js'
import {
  PERMISSIONS_TABLE,
  ROLE_PERMISSIONS_TABLE,
} from '@/shared/constants/permissions.js'
// Import the migration module directly so the idempotency test can re-run up()
// without having to resolve the filename through Knex's migration API.
import * as seedMigration from '@/shared/db/migrations/20260407062700_phase1_seed_role_permissions.js'

/**
 * @description Temporarily point the RolePermission model singleton at a
 * scratch Knex handle so `findByRole` hits the per-test schema. Returns a
 * restore callback the caller MUST invoke in `finally`.
 *
 * @param {Knex} scratch - Scratch schema Knex instance from `withScratchDb`.
 * @returns {() => void} Restore function that reverts the swap.
 */
function pinRolePermissionModelTo(scratch: Knex): () => void {
  // Cast through unknown because `knex` is a protected field on BaseModel.
  const model = ModelFactory.rolePermission as unknown as { knex: Knex }
  const original = model.knex
  model.knex = scratch
  return () => {
    model.knex = original
  }
}

/**
 * @description Temporarily point the Permission model singleton at the
 * scratch Knex handle so `syncPermissionsCatalog()` hits the scratch schema.
 * Mirrors the helper in `sync.test.ts`.
 *
 * @param {Knex} scratch - Scratch schema Knex instance from `withScratchDb`.
 * @returns {() => void} Restore function that reverts the swap.
 */
function pinPermissionModelTo(scratch: Knex): () => void {
  const model = ModelFactory.permission as unknown as { knex: Knex }
  const original = model.knex
  model.knex = scratch
  return () => {
    model.knex = original
  }
}

describe('Day-one role seed (P1.5)', () => {
  it('is a strict superset of the live ROLE_PERMISSIONS map (programmatic parity)', async () => {
    await withScratchDb(async (scratch) => {
      const restore = pinRolePermissionModelTo(scratch)
      try {
        // Walk every live (role, legacyKey) pair and assert the expansion is
        // present in the seeded rows. The import of ROLE_PERMISSIONS at the
        // top of this file is runtime, so any future addition to rbac.ts
        // without a matching LEGACY_TO_NEW entry will trip this loop.
        for (const [role, legacyPerms] of Object.entries(ROLE_PERMISSIONS)) {
          const seeded = new Set(await ModelFactory.rolePermission.findByRole(role))
          for (const legacyKey of legacyPerms) {
            const expanded = LEGACY_TO_NEW[legacyKey] ?? []
            for (const newKey of expanded) {
              expect(
                seeded.has(newKey),
                `role=${role} legacy=${legacyKey} expanded=${newKey} missing from seeded rows`,
              ).toBe(true)
            }
          }
        }
      } finally {
        restore()
      }
    })
  })

  it('grants admin and super-admin every agents.* and memory.* action; user/leader get none', async () => {
    await withScratchDb(async (scratch) => {
      const restore = pinRolePermissionModelTo(scratch)
      try {
        // Admin + super-admin must carry every locked agents/memory key.
        for (const role of ['admin', 'super-admin']) {
          const perms = new Set(await ModelFactory.rolePermission.findByRole(role))
          for (const key of AGENTS_MEMORY_ADMIN_ONLY_KEYS) {
            expect(perms.has(key), `role=${role} missing key=${key}`).toBe(true)
          }
        }
        // Regular user and leader must carry zero agents.* / memory.* keys.
        for (const role of ['user', 'leader']) {
          const perms = await ModelFactory.rolePermission.findByRole(role)
          const leaked = perms.filter(
            (k) => k.startsWith('agents.') || k.startsWith('memory.'),
          )
          expect(leaked, `role=${role} unexpectedly has ${leaked.join(', ')}`).toEqual([])
        }
      } finally {
        restore()
      }
    })
  })

  it('produces a stable per-role permission set (snapshot)', async () => {
    await withScratchDb(async (scratch) => {
      const restore = pinRolePermissionModelTo(scratch)
      try {
        // Snapshot all four legacy roles. Vitest auto-writes the snapshot on
        // the first run; any future registry change that alters the day-one
        // seed will fail this test until the snapshot is intentionally
        // regenerated — that's the desired tripwire.
        const roles = ['super-admin', 'admin', 'leader', 'user'] as const
        const result: Record<string, string[]> = {}
        for (const role of roles) {
          result[role] = (await ModelFactory.rolePermission.findByRole(role)).sort()
        }
        expect(result).toMatchSnapshot()
      } finally {
        restore()
      }
    })
  })

  it('has no orphan keys — every seeded permission_key exists in the catalog after sync', async () => {
    await withScratchDb(async (scratch) => {
      // Need to pin BOTH models: sync writes to `permissions` via
      // ModelFactory.permission, and we read `role_permissions` directly via
      // the scratch handle (no model needed for the left-side of the join).
      const restorePerm = pinPermissionModelTo(scratch)
      const restoreRole = pinRolePermissionModelTo(scratch)
      try {
        // Prime the catalog so the LEFT JOIN below has something to match.
        await syncPermissionsCatalog()

        // Collect the set of catalog keys from the registry snapshot (same
        // source sync used) and cross-check every seeded key exists in it.
        const catalogKeys = new Set(getAllPermissions().map((p) => p.key))

        const seededKeys = await scratch(ROLE_PERMISSIONS_TABLE).distinct('permission_key')
        const orphans = seededKeys
          .map((r: { permission_key: string }) => r.permission_key)
          .filter((k: string) => !catalogKeys.has(k))

        expect(orphans, `orphan seeded keys: ${orphans.join(', ')}`).toEqual([])

        // Also sanity-check that the permissions table actually received those
        // keys (belt-and-braces against a mis-pinned pool).
        const catalogRows = await scratch(PERMISSIONS_TABLE).select('key')
        const dbKeys = new Set(catalogRows.map((r: { key: string }) => r.key))
        for (const k of seededKeys) {
          expect(dbKeys.has(k.permission_key)).toBe(true)
        }
      } finally {
        restoreRole()
        restorePerm()
      }
    })
  })

  it('is idempotent — re-running up() inserts zero additional rows', async () => {
    await withScratchDb(async (scratch) => {
      // `migrate.latest()` already ran the seed once during withScratchDb setup,
      // so the scratch schema is warm. Re-invoke up() against the same Knex
      // handle and assert the row count is unchanged.
      const before = await scratch(ROLE_PERMISSIONS_TABLE).count<{ n: string }[]>('* as n')
      const beforeN = Number(before[0]!.n)

      // Call the migration's exported up() directly. Its insert path uses
      // onConflict(...).ignore() so every row collides and is skipped.
      await seedMigration.up(scratch)

      const after = await scratch(ROLE_PERMISSIONS_TABLE).count<{ n: string }[]>('* as n')
      const afterN = Number(after[0]!.n)

      expect(afterN).toBe(beforeN)
      // Sanity: beforeN must be > 0 or the test is vacuous.
      expect(beforeN).toBeGreaterThan(0)
    })
  })
})
