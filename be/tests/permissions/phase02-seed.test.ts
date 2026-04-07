/**
 * @fileoverview Vitest spec for the Phase 2 / P2.6 seed migration that adds
 * `datasets.view` + `documents.view` rows to `role_permissions` for the
 * `user` and `leader` legacy roles.
 *
 * Background: the legacy ability builder at
 * `be/src/shared/services/ability.service.ts:113-114` unconditionally grants
 * `read Dataset` + `read Document` to every authenticated user, but the
 * legacy `ROLE_PERMISSIONS` map at `rbac.ts` never carried those grants for
 * `user` / `leader`. This migration patches that gap so the V2 (data-driven)
 * ability builder can achieve byte-level V1↔V2 parity.
 *
 * Each spec runs inside an isolated scratch schema via `withScratchDb`, which
 * applies `migrate.latest()` (including the P2.6 migration) before handing
 * control to the test body.
 */

import { describe, it, expect } from 'vitest'
import type { Knex } from 'knex'

import { withScratchDb } from './_helpers.js'
import { getAllPermissions } from '@/shared/permissions/index.js'
import { ROLE_PERMISSIONS_TABLE } from '@/shared/constants/permissions.js'
// Import the migration module directly so the idempotency test can re-run up()
// without resolving the filename through Knex's migration API.
import * as p26Migration from '@/shared/db/migrations/20260407085310_phase02_seed_user_leader_dataset_document_view.js'

/** Canonical registry keys this migration adds to `user` and `leader`. */
const DATASET_VIEW_KEY = 'datasets.view'
const DOCUMENT_VIEW_KEY = 'documents.view'
const TARGET_KEYS = [DATASET_VIEW_KEY, DOCUMENT_VIEW_KEY] as const

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

describe('Phase 2 / P2.6 seed — datasets.view + documents.view for user/leader', () => {
  it('both target keys are present in the live permission registry', () => {
    // Sanity gate: if either key is missing from the registry, the migration
    // will hard-halt at runtime — surface that as a unit-level failure first.
    const allKeys = new Set(getAllPermissions().map((p) => p.key))
    for (const key of TARGET_KEYS) {
      expect(allKeys.has(key), `registry missing key=${key}`).toBe(true)
    }
  })

  it('grants datasets.view and documents.view to the user role (tenant_id NULL)', async () => {
    await withScratchDb(async (scratch) => {
      // After migrate.latest, the user role must carry both target keys at
      // the global (NULL tenant) scope.
      const userKeys = await fetchGlobalKeysForRole(scratch, 'user')
      for (const key of TARGET_KEYS) {
        expect(userKeys.has(key), `user role missing key=${key}`).toBe(true)
      }
    })
  })

  it('grants datasets.view and documents.view to the leader role (tenant_id NULL)', async () => {
    await withScratchDb(async (scratch) => {
      // Same assertion for the leader role — locked decision D1 covers both.
      const leaderKeys = await fetchGlobalKeysForRole(scratch, 'leader')
      for (const key of TARGET_KEYS) {
        expect(leaderKeys.has(key), `leader role missing key=${key}`).toBe(true)
      }
    })
  })

  it('is idempotent — re-running up() inserts zero additional rows', async () => {
    await withScratchDb(async (scratch) => {
      // migrate.latest() already ran the migration once during setup. Snapshot
      // the row count, re-invoke up() against the same scratch handle, and
      // assert nothing changed. The migration's pre-query filter is the
      // primary defense; .onConflict().ignore() is a secondary safety net.
      const before = await scratch(ROLE_PERMISSIONS_TABLE).count<{ n: string }[]>('* as n')
      const beforeN = Number(before[0]!.n)

      await p26Migration.up(scratch)

      const after = await scratch(ROLE_PERMISSIONS_TABLE).count<{ n: string }[]>('* as n')
      const afterN = Number(after[0]!.n)

      expect(afterN).toBe(beforeN)
      // Sanity floor — the seed should have produced > 0 rows total.
      expect(beforeN).toBeGreaterThan(0)
    })
  })

  it('does not regress admin and super-admin (they already had these keys via P1.5)', async () => {
    await withScratchDb(async (scratch) => {
      // The P1.5 seed expanded legacy KB/dataset grants for admin and
      // super-admin into the new keys, so both roles should already carry
      // datasets.view and documents.view at the global scope. This spec
      // guards against any future regression that might strip them.
      for (const role of ['admin', 'super-admin']) {
        const keys = await fetchGlobalKeysForRole(scratch, role)
        for (const key of TARGET_KEYS) {
          expect(keys.has(key), `role=${role} unexpectedly missing key=${key}`).toBe(true)
        }
      }
    })
  })
})
