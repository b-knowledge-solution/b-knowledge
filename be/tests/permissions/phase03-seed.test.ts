/**
 * @fileoverview Vitest spec for the Phase 3 / P3.0a seed migration that adds
 * `permissions.view` + `permissions.manage` rows to `role_permissions` for
 * the `admin` and `super-admin` legacy roles.
 *
 * Background: Phase 3 introduces a new `be/src/modules/permissions/` admin
 * module whose CRUD endpoints need their own permission keys to gate against.
 * Only `admin` and `super-admin` should receive these keys; `user` and
 * `leader` must NOT.
 *
 * Each integration spec runs inside an isolated scratch schema via
 * `withScratchDb`, which applies `migrate.latest()` before handing control to
 * the test body.
 */

import { describe, it, expect } from 'vitest'
import type { Knex } from 'knex'

import { withScratchDb } from './_helpers.js'
import { getAllPermissions } from '@/shared/permissions/index.js'
import {
  ROLE_PERMISSIONS_TABLE,
  PermissionSubjects,
} from '@/shared/constants/permissions.js'
// Import the migration module directly so the idempotency test can re-run up()
// without resolving the filename through Knex's migration API.
import * as p30aMigration from '@/shared/db/migrations/20260407100000_phase03_seed_permissions_admin_keys.js'

/** Canonical registry keys this migration adds. */
const PERMISSIONS_VIEW_KEY = 'permissions.view'
const PERMISSIONS_MANAGE_KEY = 'permissions.manage'
const TARGET_KEYS = [PERMISSIONS_VIEW_KEY, PERMISSIONS_MANAGE_KEY] as const

/**
 * @description Fetch the set of permission keys granted to a role with
 * `tenant_id IS NULL`, scoped to the supplied scratch Knex handle.
 *
 * @param {Knex} k - Scratch schema Knex instance.
 * @param {string} role - Legacy role name to query.
 * @returns {Promise<Set<string>>} Set of permission_key values for that role.
 */
async function fetchGlobalKeysForRole(k: Knex, role: string): Promise<Set<string>> {
  const rows = await k(ROLE_PERMISSIONS_TABLE)
    .select('permission_key')
    .where({ role })
    .whereNull('tenant_id')
  return new Set(rows.map((r: { permission_key: string }) => r.permission_key))
}

describe('Phase 3 / P3.0a seed — permissions.view + permissions.manage for admin/super-admin', () => {
  it('both target keys are present in the live permission registry', () => {
    // Sanity gate: if either key is missing, the migration's runtime guard
    // would hard-halt — surface that as a unit failure first.
    const allKeys = new Set(getAllPermissions().map((p) => p.key))
    for (const key of TARGET_KEYS) {
      expect(allKeys.has(key), `registry missing key=${key}`).toBe(true)
    }
  })

  it('both target keys carry subject PermissionCatalog (used by Phase 3 middleware)', () => {
    // Phase 3's middleware will check (action, PermissionCatalog) — guard the
    // subject string here so a future rename has to update this spec too.
    const all = getAllPermissions()
    for (const key of TARGET_KEYS) {
      const entry = all.find((p) => p.key === key)
      expect(entry, `registry entry not found for key=${key}`).toBeDefined()
      expect(entry!.subject).toBe(PermissionSubjects.PermissionCatalog)
    }
  })

  it('grants permissions.view and permissions.manage to the admin role (tenant_id NULL)', async () => {
    await withScratchDb(async (scratch) => {
      const adminKeys = await fetchGlobalKeysForRole(scratch, 'admin')
      for (const key of TARGET_KEYS) {
        expect(adminKeys.has(key), `admin role missing key=${key}`).toBe(true)
      }
    })
  })

  it('grants permissions.view and permissions.manage to the super-admin role (tenant_id NULL)', async () => {
    await withScratchDb(async (scratch) => {
      const superAdminKeys = await fetchGlobalKeysForRole(scratch, 'super-admin')
      for (const key of TARGET_KEYS) {
        expect(superAdminKeys.has(key), `super-admin role missing key=${key}`).toBe(
          true,
        )
      }
    })
  })

  it('does NOT grant the new keys to the user or leader legacy roles', async () => {
    await withScratchDb(async (scratch) => {
      // The whole point of P3.0a is that only admin/super-admin can manage the
      // permissions catalog. user and leader must carry zero rows for either
      // target key at any tenant scope.
      for (const role of ['user', 'leader']) {
        const rows = await scratch(ROLE_PERMISSIONS_TABLE)
          .select('permission_key', 'tenant_id')
          .where({ role })
          .whereIn('permission_key', TARGET_KEYS as unknown as string[])
        expect(
          rows.length,
          `role=${role} unexpectedly carries P3.0a keys: ${JSON.stringify(rows)}`,
        ).toBe(0)
      }
    })
  })

  it('is idempotent — re-running up() inserts zero additional rows', async () => {
    await withScratchDb(async (scratch) => {
      // migrate.latest() already ran the migration once during setup. Snapshot
      // the row count, re-invoke up(), and assert nothing changed.
      const before = await scratch(ROLE_PERMISSIONS_TABLE).count<{ n: string }[]>(
        '* as n',
      )
      const beforeN = Number(before[0]!.n)

      await p30aMigration.up(scratch)

      const after = await scratch(ROLE_PERMISSIONS_TABLE).count<{ n: string }[]>(
        '* as n',
      )
      const afterN = Number(after[0]!.n)

      expect(afterN).toBe(beforeN)
      // Sanity floor — the seed should have produced > 0 rows total.
      expect(beforeN).toBeGreaterThan(0)
    })
  })
})
