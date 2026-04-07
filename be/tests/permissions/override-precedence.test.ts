/**
 * @fileoverview R-G override precedence tests for the V2 ability builder.
 *
 * Covers the "deny wins" invariant, idempotent allow, deny-only no-op,
 * registry-missing skip-and-log, and allow-adding-a-new-permission paths.
 *
 * Several of the Q15 research §10 edge cases are covered here — see the
 * coverage matrix comment at the top of `tenant-isolation.test.ts`.
 */

import { describe, it, expect, vi } from 'vitest'
import type { Knex } from 'knex'
import { subject as asSubject } from '@casl/ability'

import { withScratchDb } from './_helpers.js'
import { __forTesting } from '@/shared/services/ability.service.js'
import { ModelFactory } from '@/shared/models/factory.js'
import { syncPermissionsCatalog } from '@/shared/permissions/index.js'
import { adminFixture, userFixture } from './__fixtures__/user-fixtures.js'
import { log } from '@/shared/services/logger.service.js'

/** Seed a minimal users row so the FK on user_permission_overrides holds. */
async function seedUser(k: Knex, id: string, email: string): Promise<string> {
  await k('users').insert({ id, email, display_name: id })
  return id
}

/** Seed a minimal KB row so FKs on resource_grants hold. */
async function seedKb(k: Knex, name: string): Promise<string> {
  const [row] = await k('knowledge_base').insert({ name }).returning(['id'])
  return row.id as string
}

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

describe('V2 override precedence (R-G, deny-wins)', () => {
  it('allow override grants a permission the role does not have', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()
        await seedUser(k, userFixture.id, 'override-user-1@example.com')

        // Plain user has no `users.create`; add it via an allow override.
        await ModelFactory.userPermissionOverride.bulkCreate([
          {
            tenant_id: userFixture.current_org_id,
            user_id: userFixture.id,
            permission_key: 'users.create',
            effect: 'allow',
            expires_at: null,
            created_by: null,
          },
        ])

        const v2 = await __forTesting.buildAbilityForV2(userFixture)
        expect(
          v2.can(
            'create',
            asSubject('User', { tenant_id: userFixture.current_org_id }) as any,
          ),
        ).toBe(true)
      } finally {
        restore()
      }
    }))

  it('deny override removes a granted permission without blanket effect', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()
        await seedUser(k, adminFixture.id, 'override-admin-1@example.com')

        // Admin has `manage KnowledgeBase` via role seed. Deny ONLY delete.
        await ModelFactory.userPermissionOverride.bulkCreate([
          {
            tenant_id: adminFixture.current_org_id,
            user_id: adminFixture.id,
            permission_key: 'knowledge_base.delete',
            effect: 'deny',
            expires_at: null,
            created_by: null,
          },
        ])

        const v2 = await __forTesting.buildAbilityForV2(adminFixture)
        const kbInstance = asSubject('KnowledgeBase', {
          tenant_id: adminFixture.current_org_id,
          id: 'fixture-kb-1',
        })
        // Targeted deny: delete is gone …
        expect(v2.can('delete', kbInstance as any)).toBe(false)
        // … but read still works.
        expect(v2.can('read', kbInstance as any)).toBe(true)
      } finally {
        restore()
      }
    }))

  it('deny wins over allow on the same (action, subject) tuple', () =>
    withScratchDb(async (k) => {
      // This is the load-bearing R-G test. Deny is emitted LAST in V2 —
      // CASL "later rule wins" so the deny must mask the allow.
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()
        await seedUser(k, userFixture.id, 'override-user-deny@example.com')

        await ModelFactory.userPermissionOverride.bulkCreate([
          {
            tenant_id: userFixture.current_org_id,
            user_id: userFixture.id,
            permission_key: 'knowledge_base.view',
            effect: 'allow',
            expires_at: null,
            created_by: null,
          },
          {
            tenant_id: userFixture.current_org_id,
            user_id: userFixture.id,
            permission_key: 'knowledge_base.view',
            effect: 'deny',
            expires_at: null,
            created_by: null,
          },
        ])

        const v2 = await __forTesting.buildAbilityForV2(userFixture)
        expect(
          v2.can(
            'read',
            asSubject('KnowledgeBase', {
              tenant_id: userFixture.current_org_id,
            }) as any,
          ),
        ).toBe(false)
      } finally {
        restore()
      }
    }))

  it('override on a registry-missing key is silently skipped and logged (research §10 case a)', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => undefined)
      try {
        await syncPermissionsCatalog()
        await seedUser(k, userFixture.id, 'override-user-fakekey@example.com')

        await k('user_permission_overrides').insert({
          tenant_id: userFixture.current_org_id,
          user_id: userFixture.id,
          permission_key: 'fake.nonexistent_key',
          effect: 'allow',
        })

        // Must not throw.
        const v2 = await __forTesting.buildAbilityForV2(userFixture)

        // The builder warned about the unknown key.
        const warnedForKey = warnSpy.mock.calls.some((args) => {
          const meta = args[1] as Record<string, unknown> | undefined
          return meta?.key === 'fake.nonexistent_key'
        })
        expect(warnedForKey).toBe(true)

        // No rule for a fake subject ever shows up — no crash, no ghost rule.
        const ghost = v2.rules.find(
          (r) => (r.subject as string) === 'fake.nonexistent_key',
        )
        expect(ghost).toBeUndefined()
      } finally {
        warnSpy.mockRestore()
        restore()
      }
    }))

  it('deny-only on an ungranted permission is a no-op (research §10 case b)', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()
        await seedUser(k, userFixture.id, 'override-user-denyonly@example.com')

        // user role has no `users.delete` — deny it explicitly.
        await ModelFactory.userPermissionOverride.bulkCreate([
          {
            tenant_id: userFixture.current_org_id,
            user_id: userFixture.id,
            permission_key: 'users.delete',
            effect: 'deny',
            expires_at: null,
            created_by: null,
          },
        ])

        const v2 = await __forTesting.buildAbilityForV2(userFixture)
        // Already false before the deny; still false after. No error.
        expect(
          v2.can(
            'delete',
            asSubject('User', { tenant_id: userFixture.current_org_id }) as any,
          ),
        ).toBe(false)
      } finally {
        restore()
      }
    }))

  it('idempotent allow on an already-granted permission is a harmless no-op (research §10 case c)', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()
        await seedUser(k, adminFixture.id, 'override-admin-idempotent@example.com')

        // Admin already has chat.view via the role seed. Adding an allow
        // override MUST be a no-op (no duplicate rule state crash).
        await ModelFactory.userPermissionOverride.bulkCreate([
          {
            tenant_id: adminFixture.current_org_id,
            user_id: adminFixture.id,
            permission_key: 'chat.view',
            effect: 'allow',
            expires_at: null,
            created_by: null,
          },
        ])

        const v2 = await __forTesting.buildAbilityForV2(adminFixture)
        expect(
          v2.can(
            'read',
            asSubject('ChatAssistant', {
              tenant_id: adminFixture.current_org_id,
            }) as any,
          ),
        ).toBe(true)
      } finally {
        restore()
      }
    }))
})
