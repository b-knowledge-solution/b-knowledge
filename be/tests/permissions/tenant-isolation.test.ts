/**
 * @fileoverview Q15 exhaustiveness gate — tenant isolation and
 * resource-grant edge cases for the V2 ability builder.
 *
 * Research §10 edge case coverage matrix (Q15 exhaustiveness gate):
 * (a) override on registry-missing key            → override-precedence.test.ts test 4
 * (b) deny-only on un-granted permission           → override-precedence.test.ts test 5
 * (c) idempotent allow on already-granted          → override-precedence.test.ts tests 1 + 6
 * (d) expired grant filtered                       → tenant-isolation.test.ts test 2
 * (e) grant for unknown resource_type              → tenant-isolation.test.ts test 3
 * (f) cross-tenant grant attempt                   → tenant-isolation.test.ts test 1
 * (g) empty role_permissions in current tenant     → tenant-isolation.test.ts test 4
 * All 7 cases covered.
 */

import { describe, it, expect } from 'vitest'
import type { Knex } from 'knex'
import { subject as asSubject } from '@casl/ability'

import { withScratchDb } from './_helpers.js'
import {
  __forTesting,
  type AbilityUserContext,
} from '@/shared/services/ability.service.js'
import { ModelFactory } from '@/shared/models/factory.js'
import { syncPermissionsCatalog } from '@/shared/permissions/index.js'
import { adminFixture, userFixture } from './__fixtures__/user-fixtures.js'

const TENANT_A = 'org-fixture-1'
const TENANT_B = 'org-other'

function pinModelTo(model: unknown, scratch: Knex): () => void {
  const m = model as { knex: Knex }
  const original = m.knex
  m.knex = scratch
  return () => {
    m.knex = original
  }
}

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

async function seedKb(k: Knex, name: string): Promise<string> {
  const [row] = await k('knowledge_base').insert({ name }).returning(['id'])
  return row.id as string
}

async function seedUser(k: Knex, id: string, email: string): Promise<void> {
  await k('users').insert({ id, email, display_name: id })
}

describe('V2 tenant isolation + grant edge cases (Q15 exhaustiveness)', () => {
  it('cross-tenant grant is filtered at the query layer (research §10 case f)', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()

        // Seed a KB + grant in tenant B for admin user (whose current_org_id = tenant A).
        const kbId = await seedKb(k, 'kb-tenant-b')
        await ModelFactory.resourceGrant.bulkCreate([
          {
            knowledge_base_id: kbId,
            resource_type: 'KnowledgeBase',
            resource_id: kbId,
            grantee_type: 'user',
            grantee_id: adminFixture.id,
            permission_level: 'view',
            actions: ['read'],
            tenant_id: TENANT_B,
            expires_at: null,
            created_by: null,
            updated_by: null,
          },
        ])

        const v2 = await __forTesting.buildAbilityForV2(adminFixture)
        // The grant must not load because it is in the wrong tenant.
        // We assert that no resource-grant rule carries the tenant_B id.
        const grantRule = v2.rules.find(
          (r) =>
            r.subject === 'KnowledgeBase' &&
            (r.conditions as any)?.id === kbId,
        )
        expect(grantRule).toBeUndefined()
      } finally {
        restore()
      }
    }))

  it('expired grant is filtered via SQL, fresh grant is honored (research §10 case d)', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()

        const kbExpired = await seedKb(k, 'kb-expired')
        const kbFresh = await seedKb(k, 'kb-fresh')

        // Expired grant (via raw so we can use NOW() - INTERVAL).
        await k('resource_grants').insert({
          knowledge_base_id: kbExpired,
          resource_type: 'KnowledgeBase',
          resource_id: kbExpired,
          grantee_type: 'user',
          grantee_id: adminFixture.id,
          permission_level: 'view',
          actions: k.raw("ARRAY['read']::text[]"),
          tenant_id: TENANT_A,
          expires_at: k.raw("NOW() - INTERVAL '1 hour'"),
        })
        // Fresh grant.
        await k('resource_grants').insert({
          knowledge_base_id: kbFresh,
          resource_type: 'KnowledgeBase',
          resource_id: kbFresh,
          grantee_type: 'user',
          grantee_id: adminFixture.id,
          permission_level: 'view',
          actions: k.raw("ARRAY['read']::text[]"),
          tenant_id: TENANT_A,
          expires_at: k.raw("NOW() + INTERVAL '1 hour'"),
        })

        const v2 = await __forTesting.buildAbilityForV2(adminFixture)
        // Expired: no grant-specific rule with its id.
        const expiredRule = v2.rules.find(
          (r) =>
            r.subject === 'KnowledgeBase' &&
            (r.conditions as any)?.id === kbExpired,
        )
        expect(expiredRule).toBeUndefined()
        // Fresh: a grant-specific rule with its id must exist.
        const freshRule = v2.rules.find(
          (r) =>
            r.subject === 'KnowledgeBase' &&
            (r.conditions as any)?.id === kbFresh,
        )
        expect(freshRule).toBeDefined()
      } finally {
        restore()
      }
    }))

  it('grant for unknown resource_type does not throw; rule is harmless (research §10 case e)', () =>
    withScratchDb(async (k) => {
      // We trust resource-grant rows; subject correctness is the registry's
      // job, not the builder's. The rule is emitted under the unknown
      // subject but no `.can()` query will ever target it at runtime.
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()

        const kbId = await seedKb(k, 'kb-unknown-type')
        // Insert raw so the model-side validation (if any) doesn't block us.
        await k('resource_grants').insert({
          knowledge_base_id: kbId,
          resource_type: 'NotARealSubject',
          resource_id: kbId,
          grantee_type: 'user',
          grantee_id: adminFixture.id,
          permission_level: 'view',
          actions: k.raw("ARRAY['read']::text[]"),
          tenant_id: TENANT_A,
        })

        // Must not throw.
        const v2 = await __forTesting.buildAbilityForV2(adminFixture)
        // No `.can()` on the unknown subject — and none of admin's real
        // subjects should be affected.
        expect(
          v2.can(
            'read',
            asSubject('KnowledgeBase', { tenant_id: TENANT_A }) as any,
          ),
        ).toBe(true)
      } finally {
        restore()
      }
    }))

  it('expired allow override is filtered via SQL while a future allow override is honored on the next rebuild', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()
        await seedUser(k, userFixture.id, 'tenant-isolation-user@example.com')

        await k('user_permission_overrides').insert({
          tenant_id: userFixture.current_org_id,
          user_id: userFixture.id,
          permission_key: 'users.create',
          effect: 'allow',
          expires_at: k.raw("NOW() - INTERVAL '1 hour'"),
        })
        await k('user_permission_overrides').insert({
          tenant_id: userFixture.current_org_id,
          user_id: userFixture.id,
          permission_key: 'knowledge_base.view',
          effect: 'allow',
          expires_at: k.raw("NOW() + INTERVAL '1 hour'"),
        })

        const v2 = await __forTesting.buildAbilityForV2(userFixture)
        expect(
          v2.can(
            'create',
            asSubject('User', { tenant_id: userFixture.current_org_id }) as any,
          ),
        ).toBe(false)
        expect(
          v2.can(
            'read',
            asSubject('KnowledgeBase', {
              tenant_id: userFixture.current_org_id,
            }) as any,
          ),
        ).toBe(true)
      } finally {
        restore()
      }
    }))

  it('expired deny override is filtered via SQL while a future deny override still masks the role grant', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()
        await seedUser(k, adminFixture.id, 'tenant-isolation-admin@example.com')

        await k('user_permission_overrides').insert({
          tenant_id: adminFixture.current_org_id,
          user_id: adminFixture.id,
          permission_key: 'users.create',
          effect: 'deny',
          expires_at: k.raw("NOW() - INTERVAL '1 hour'"),
        })
        await k('user_permission_overrides').insert({
          tenant_id: adminFixture.current_org_id,
          user_id: adminFixture.id,
          permission_key: 'knowledge_base.delete',
          effect: 'deny',
          expires_at: k.raw("NOW() + INTERVAL '1 hour'"),
        })

        const v2 = await __forTesting.buildAbilityForV2(adminFixture)
        expect(
          v2.can(
            'create',
            asSubject('User', { tenant_id: adminFixture.current_org_id }) as any,
          ),
        ).toBe(true)
        expect(
          v2.can(
            'delete',
            asSubject('KnowledgeBase', {
              tenant_id: adminFixture.current_org_id,
              id: 'fixture-kb-live',
            }) as any,
          ),
        ).toBe(false)
      } finally {
        restore()
      }
    }))

  it('user with empty role_permissions in current tenant produces a valid, near-empty ability (research §10 case g)', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()

        // A role string that has zero rows in role_permissions for any tenant.
        const novelUser: AbilityUserContext = {
          id: 'fixture-novel-user',
          role: 'novel-test-only-role',
          is_superuser: false,
          current_org_id: TENANT_A,
        }

        const v2 = await __forTesting.buildAbilityForV2(novelUser)
        // No crash, no cascade rule, no KB read.
        expect(
          v2.can(
            'read',
            asSubject('KnowledgeBase', { tenant_id: TENANT_A }) as any,
          ),
        ).toBe(false)
        const dcRules = v2.rules.filter((r) => r.subject === 'DocumentCategory')
        expect(dcRules).toHaveLength(0)
      } finally {
        restore()
      }
    }))
})
