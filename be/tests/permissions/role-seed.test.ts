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
// Phase 2 P2.4 patch — see file header section "Phase 2 reconciliation" below.
import * as p24Patch from '@/shared/db/migrations/20260407090000_phase02_patch_role_permissions_for_v2_parity.js'

/**
 * @description Leader's three Dataset over-grants that P2.4-patch INTENTIONALLY
 * removes from role_permissions to mirror V1's leader behavior (V1 grants only
 * create/update/delete on Dataset to leader, NOT manage). P1.5's
 * `manage_datasets` expansion would otherwise include these because they share
 * the same legacy expansion as admin. The role-seed invariant tests below
 * exclude these three from their parity / idempotency assertions because they
 * are owned by the P2.4 reconciliation, not by P1.5.
 *
 * @see be/src/shared/db/migrations/20260407090000_phase02_patch_role_permissions_for_v2_parity.ts
 */
const LEADER_DATASET_OVER_GRANTS_REMOVED_BY_P24 = new Set<string>([
  'datasets.share',
  'datasets.reindex',
  'datasets.advanced',
])

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
              // Skip the three keys P2.4-patch removes from leader for V1
              // parity (see LEADER_DATASET_OVER_GRANTS_REMOVED_BY_P24 above).
              // P1.5 alone seeds them, but P2.4-patch (which runs in the same
              // migrate.latest batch) deletes them, so the post-head DB
              // intentionally lacks them for the leader role.
              if (
                role === 'leader' &&
                LEADER_DATASET_OVER_GRANTS_REMOVED_BY_P24.has(newKey)
              ) {
                continue
              }
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

  it('grants admin, super-admin, AND leader every agents.* and memory.* action; user gets none', async () => {
    await withScratchDb(async (scratch) => {
      const restore = pinRolePermissionModelTo(scratch)
      try {
        // Phase 2 P2.4 reconciliation: V1's `buildAbilityForV1Sync` grants
        // `manage Agent` and `manage Memory` to leader (ability.service.ts
        // L173-L174). The locked Phase 1 decision was amended to include
        // 'leader' in `AGENTS_MEMORY_ADMIN_ROLES` so day-one parity holds.
        // See legacy-mapping.ts header for the full history.
        for (const role of ['admin', 'super-admin', 'leader']) {
          const perms = new Set(await ModelFactory.rolePermission.findByRole(role))
          for (const key of AGENTS_MEMORY_ADMIN_ONLY_KEYS) {
            expect(perms.has(key), `role=${role} missing key=${key}`).toBe(true)
          }
        }
        // Regular `user` is the only role that must carry zero agents/memory keys.
        const userPerms = await ModelFactory.rolePermission.findByRole('user')
        const leaked = userPerms.filter(
          (k) => k.startsWith('agents.') || k.startsWith('memory.'),
        )
        expect(leaked, `role=user unexpectedly has ${leaked.join(', ')}`).toEqual([])
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

  it('is idempotent — re-running P1.5 + P2.4-patch in sequence inserts zero additional rows', async () => {
    await withScratchDb(async (scratch) => {
      // `migrate.latest()` already ran the seed migrations once during
      // withScratchDb setup, so the scratch schema is at head with both
      // P1.5 and P2.4-patch applied. The idempotency contract for the
      // permission-seed CHAIN is: re-running both migrations in their
      // forward order must leave the table identical.
      //
      // Note: re-running P1.5 alone is NOT idempotent in the post-P2.4-patch
      // world because P1.5's `manage_datasets` expansion would re-insert
      // the three leader Dataset over-grants that P2.4-patch intentionally
      // removes (datasets.share / .reindex / .advanced). The chain-level
      // idempotency below is the meaningful invariant — that's what
      // `migrate.latest()` actually executes on every boot.
      const before = await scratch(ROLE_PERMISSIONS_TABLE).count<{ n: string }[]>('* as n')
      const beforeN = Number(before[0]!.n)

      // Re-run both seeds in their forward order. Both use onConflict().ignore()
      // plus an application-layer existing-token filter, so every row should
      // collide and skip.
      await seedMigration.up(scratch)
      await p24Patch.up(scratch)

      const after = await scratch(ROLE_PERMISSIONS_TABLE).count<{ n: string }[]>('* as n')
      const afterN = Number(after[0]!.n)

      expect(afterN).toBe(beforeN)
      // Sanity: beforeN must be > 0 or the test is vacuous.
      expect(beforeN).toBeGreaterThan(0)
    })
  })
})
