/**
 * @fileoverview TS8 — KB → DocumentCategory read cascade tests for the V2
 * ability builder. Verifies the four locked behaviors:
 *   1. Admin (class-level KB read from role seed) gets a generic
 *      `(read, DocumentCategory)` rule with ONLY the tenant condition — no
 *      `knowledge_base_id` `$in` clause (because the cascade is class-wide).
 *   2. Plain user (no KB read, no KB grants) gets NO DocumentCategory rule.
 *   3. User with a row-scoped KB grant gets exactly ONE
 *      `(read, DocumentCategory)` rule whose conditions include
 *      `knowledge_base_id: { $in: [grantedKbId] }`.
 *   4. Cascade is read-only: it never synthesizes `create/update/delete`
 *      DocumentCategory rules.
 */

import { describe, it, expect } from 'vitest'
import type { Knex } from 'knex'
import { subject as asSubject } from '@casl/ability'

import { withScratchDb } from './_helpers.js'
import { __forTesting } from '@/shared/services/ability.service.js'
import { ModelFactory } from '@/shared/models/factory.js'
import { syncPermissionsCatalog } from '@/shared/permissions/index.js'
import { adminFixture, userFixture } from './__fixtures__/user-fixtures.js'

/**
 * @description Repoint a BaseModel singleton at a scratch Knex.
 * @param {unknown} model - ModelFactory singleton.
 * @param {Knex} scratch - Scratch Knex instance.
 * @returns {() => void} Restore callback.
 */
function pinModelTo(model: unknown, scratch: Knex): () => void {
  const m = model as { knex: Knex }
  const original = m.knex
  m.knex = scratch
  return () => {
    m.knex = original
  }
}

/**
 * @description Pin all ability-related models to the scratch Knex.
 * @param {Knex} k - Scratch Knex instance.
 * @returns {() => void} Composite restore callback.
 */
function pinAllAbilityModels(k: Knex): () => void {
  const restores = [
    pinModelTo(ModelFactory.permission, k),
    pinModelTo(ModelFactory.rolePermission, k),
    pinModelTo(ModelFactory.resourceGrant, k),
    pinModelTo(ModelFactory.userPermissionOverride, k),
  ]
  return () => {
    for (const r of restores.reverse()) r()
  }
}

/**
 * @description Seed a minimal knowledge_base row so FKs on resource_grants hold.
 * @param {Knex} k - Scratch Knex handle.
 * @param {string} name - Unique KB name.
 * @returns {Promise<string>} Generated KB id.
 */
async function seedKb(k: Knex, name: string): Promise<string> {
  const [row] = await k('knowledge_base').insert({ name }).returning(['id'])
  return row.id as string
}

describe('V2 cascade — KB read → DocumentCategory read', () => {
  it('admin with class-level KB read gets a generic DocumentCategory read rule (no $in)', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()
        const v2 = await __forTesting.buildAbilityForV2(adminFixture)

        // Find every DocumentCategory read rule.
        const docCatReadRules = v2.rules.filter(
          (r) => r.action === 'read' && r.subject === 'DocumentCategory',
        )
        // Admin seed grants document_categories.view (which ALSO emits a
        // plain tenant-only rule) AND the cascade emits a tenant-only rule.
        // Both have identical shape, so the exact count may be 1 or 2 — the
        // load-bearing assertion is that NONE of them carries a
        // `knowledge_base_id` restriction (the cascade path for class-level
        // access is the unrestricted branch).
        expect(docCatReadRules.length).toBeGreaterThanOrEqual(1)
        for (const rule of docCatReadRules) {
          const cond = (rule.conditions ?? {}) as Record<string, unknown>
          expect(cond.tenant_id).toBe(adminFixture.current_org_id)
          expect('knowledge_base_id' in cond).toBe(false)
        }
      } finally {
        restore()
      }
    }))

  it('plain user with no KB read and no KB grants gets NO DocumentCategory rule (from cascade)', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()
        const v2 = await __forTesting.buildAbilityForV2(userFixture)

        // The user role does NOT have knowledge_base.view in its seed, and we
        // haven't inserted any resource_grants, so the cascade MUST NOT fire.
        // Note: the user role ALSO doesn't have `document_categories.view` in
        // the seed — so there should be NO DocumentCategory rule at all.
        const docCatRules = v2.rules.filter((r) => r.subject === 'DocumentCategory')
        expect(docCatRules).toHaveLength(0)
      } finally {
        restore()
      }
    }))

  it('resource-grant on KB produces exactly ONE cascade rule with knowledge_base_id $in', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()

        // Seed a KB row and grant the plain user read on it directly.
        const kbId = await seedKb(k, 'kb-cascade-grant')
        await ModelFactory.resourceGrant.bulkCreate([
          {
            knowledge_base_id: kbId,
            resource_type: 'KnowledgeBase',
            resource_id: kbId,
            grantee_type: 'user',
            grantee_id: userFixture.id,
            permission_level: 'view',
            actions: ['read'],
            tenant_id: userFixture.current_org_id,
            expires_at: null,
            created_by: null,
            updated_by: null,
          },
        ])

        const v2 = await __forTesting.buildAbilityForV2(userFixture)

        // Exactly one DocumentCategory cascade rule with `$in: [kbId]`.
        const cascadeRules = v2.rules.filter(
          (r) =>
            r.subject === 'DocumentCategory' &&
            r.action === 'read' &&
            r.conditions &&
            'knowledge_base_id' in (r.conditions as Record<string, unknown>),
        )
        expect(cascadeRules).toHaveLength(1)
        const cond = cascadeRules[0].conditions as Record<string, any>
        expect(cond.tenant_id).toBe(userFixture.current_org_id)
        expect(cond.knowledge_base_id).toEqual({ $in: [kbId] })

        // Sanity: the user CAN read a document category belonging to that KB.
        expect(
          v2.can(
            'read',
            asSubject('DocumentCategory', {
              tenant_id: userFixture.current_org_id,
              knowledge_base_id: kbId,
            }) as any,
          ),
        ).toBe(true)
      } finally {
        restore()
      }
    }))

  it('cascade never synthesizes write rules on DocumentCategory', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()

        // Grant the user an `edit` action on a KB — cascade should NOT fire
        // (cascade only triggers on read/manage), so no DocumentCategory rule
        // of ANY kind should be synthesized.
        const kbId = await seedKb(k, 'kb-cascade-noedit')
        await ModelFactory.resourceGrant.bulkCreate([
          {
            knowledge_base_id: kbId,
            resource_type: 'KnowledgeBase',
            resource_id: kbId,
            grantee_type: 'user',
            grantee_id: userFixture.id,
            permission_level: 'edit',
            actions: ['update'],
            tenant_id: userFixture.current_org_id,
            expires_at: null,
            created_by: null,
            updated_by: null,
          },
        ])

        const v2 = await __forTesting.buildAbilityForV2(userFixture)

        // No DocumentCategory write rules should exist — the role seed
        // doesn't grant them for `user`, and the cascade is read-only.
        const writeRules = v2.rules.filter(
          (r) =>
            r.subject === 'DocumentCategory' &&
            (r.action === 'create' || r.action === 'update' || r.action === 'delete'),
        )
        expect(writeRules).toHaveLength(0)

        // And no cascade READ rule either, because the grant only carries `update`.
        const readRules = v2.rules.filter(
          (r) => r.subject === 'DocumentCategory' && r.action === 'read',
        )
        expect(readRules).toHaveLength(0)
      } finally {
        restore()
      }
    }))
})
