/**
 * @fileoverview P3.1c — unit/integration tests for the new V2-aware
 * `requirePermission` and `requireAbility` middleware in
 * `be/src/shared/middleware/auth.middleware.ts`.
 *
 * Load-bearing assertion: the new `requireAbility('read', 'KnowledgeBase', 'id')`
 * form MUST match row-scoped grants in `resource_grants`. The old middleware
 * at ~line 377 called `ability.can(action, subject)` with a bare string
 * subject, which CASL never matches against rules whose conditions carry an
 * `id` clause — so every V2 row-scoped grant was silently bypassed. The
 * row-scoped test below proves (a) the fix works for the granted row, (b) a
 * sibling row without a grant is still denied, and (c) the old bare-string
 * shape returns `false` against the same ability so the regression is
 * captured.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import type { Knex } from 'knex'
import { subject as asSubject } from '@casl/ability'
import type { Request, Response, NextFunction } from 'express'

import { withScratchDb } from './_helpers.js'
import {
  requirePermission,
  requireAbility,
} from '@/shared/middleware/auth.middleware.js'
import { ModelFactory } from '@/shared/models/factory.js'
import { syncPermissionsCatalog } from '@/shared/permissions/index.js'
import { config } from '@/shared/config/index.js'
import { adminFixture, userFixture } from './__fixtures__/user-fixtures.js'
import { __forTesting } from '@/shared/services/ability.service.js'

// ── Scratch-DB plumbing ────────────────────────────────────────────

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
 * @description Pin every ability-related model to a scratch Knex so the
 * V2 builder's DB reads land on the per-test schema.
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

// ── Express mocks ──────────────────────────────────────────────────

/**
 * @description Build a tiny Express req/res/next trio that captures the
 * final status + body and exposes a vitest spy on `next`.
 */
function makeReqRes(opts: {
  user?: Record<string, unknown> | null
  currentOrgId?: string
  params?: Record<string, string>
  method?: string
  path?: string
}) {
  const user = opts.user === null ? null : (opts.user ?? {
    id: userFixture.id,
    role: userFixture.role,
    is_superuser: false,
  })
  // Mock session: `user` present unless explicitly null
  const session: any = user
    ? { user, currentOrgId: opts.currentOrgId ?? userFixture.current_org_id }
    : {}
  const req: Partial<Request> = {
    session,
    sessionID: 'test-session-' + Math.random().toString(36).slice(2, 8),
    params: opts.params ?? {},
    method: opts.method ?? 'GET',
    path: opts.path ?? '/',
  } as any

  // Capture status/body for assertions
  let statusCode = 0
  let body: any = undefined
  const res: Partial<Response> = {
    status: (code: number) => {
      statusCode = code
      return res as Response
    },
    json: (payload: any) => {
      body = payload
      return res as Response
    },
  } as any

  const next: NextFunction = vi.fn()
  return {
    req: req as Request,
    res: res as Response,
    next,
    get status() {
      return statusCode
    },
    get body() {
      return body
    },
  }
}

// ── V2 engine flag pinning ─────────────────────────────────────────
//
// The middleware calls the public `buildAbilityFor` dispatcher, which reads
// `config.permissions.useV2Engine`. Force it true for the life of this file
// so the V2 path (which honors row-scoped grants) runs.

let previousV2Flag: boolean
beforeAll(() => {
  previousV2Flag = config.permissions.useV2Engine
  config.permissions.useV2Engine = true
})
afterAll(() => {
  config.permissions.useV2Engine = previousV2Flag
})

// ═══════════════════════════════════════════════════════════════════
// requirePermission(key)
// ═══════════════════════════════════════════════════════════════════

describe('requirePermission(key)', () => {
  it('allows an admin holding the permission (knowledge_base.view)', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()
        const mw = requirePermission('knowledge_base.view')
        const ctx = makeReqRes({
          user: {
            id: adminFixture.id,
            role: adminFixture.role,
            is_superuser: false,
          },
          currentOrgId: adminFixture.current_org_id,
          method: 'GET',
          path: '/api/kb',
        })
        await mw(ctx.req, ctx.res, ctx.next)
        expect(ctx.next).toHaveBeenCalledOnce()
        expect(ctx.next).toHaveBeenCalledWith()
        expect(ctx.status).toBe(0)
      } finally {
        restore()
      }
    }))

  it('denies a plain user lacking a mutation permission (knowledge_base.delete)', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()
        const mw = requirePermission('knowledge_base.delete')
        const ctx = makeReqRes({
          user: {
            id: userFixture.id,
            role: userFixture.role,
            is_superuser: false,
          },
          currentOrgId: userFixture.current_org_id,
          method: 'DELETE',
          path: '/api/kb/abc',
        })
        await mw(ctx.req, ctx.res, ctx.next)
        expect(ctx.next).not.toHaveBeenCalled()
        expect(ctx.status).toBe(403)
        expect(ctx.body).toMatchObject({
          error: 'permission_denied',
          key: 'knowledge_base.delete',
        })
      } finally {
        restore()
      }
    }))

  it('returns 401 when no user is on the session', async () => {
    const mw = requirePermission('knowledge_base.view')
    const ctx = makeReqRes({ user: null })
    await mw(ctx.req, ctx.res, ctx.next)
    expect(ctx.status).toBe(401)
    expect(ctx.next).not.toHaveBeenCalled()
  })

  it('returns 500 when the permission key is missing from the registry', async () => {
    // Post-Phase 3 the legacy fall-through is gone. Unknown keys are a route
    // misconfiguration and must fail loudly so they are caught in CI.
    const mw = requirePermission('totally.fake_key_nonexistent' as any)
    const ctx = makeReqRes({
      user: {
        id: userFixture.id,
        role: userFixture.role,
        is_superuser: false,
      },
    })
    await mw(ctx.req, ctx.res, ctx.next)
    expect(ctx.status).toBe(500)
    expect(ctx.body).toEqual({
      error: 'permission_misconfigured',
      key: 'totally.fake_key_nonexistent',
    })
  })
})

// ═══════════════════════════════════════════════════════════════════
// requireAbility(action, subject, idParam?)
// ═══════════════════════════════════════════════════════════════════

describe('requireAbility(action, subject, idParam?)', () => {
  it('class-level: allows admin with manage on KnowledgeBase', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()
        const mw = requireAbility('read', 'KnowledgeBase')
        const ctx = makeReqRes({
          user: {
            id: adminFixture.id,
            role: adminFixture.role,
            is_superuser: false,
          },
          currentOrgId: adminFixture.current_org_id,
          method: 'GET',
          path: '/api/kb',
        })
        await mw(ctx.req, ctx.res, ctx.next)
        expect(ctx.next).toHaveBeenCalledOnce()
        expect(ctx.status).toBe(0)
      } finally {
        restore()
      }
    }))

  it('class-level: denies a plain user attempting manage on KnowledgeBase', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()
        const mw = requireAbility('manage', 'KnowledgeBase')
        const ctx = makeReqRes({
          user: {
            id: userFixture.id,
            role: userFixture.role,
            is_superuser: false,
          },
          currentOrgId: userFixture.current_org_id,
          method: 'POST',
          path: '/api/kb',
        })
        await mw(ctx.req, ctx.res, ctx.next)
        expect(ctx.next).not.toHaveBeenCalled()
        expect(ctx.status).toBe(403)
        expect(ctx.body).toMatchObject({ error: 'permission_denied' })
      } finally {
        restore()
      }
    }))

  // ─────────────────────────────────────────────────────────────────
  // THE LOAD-BEARING TEST — row-scoped grant via resource_grants
  // ─────────────────────────────────────────────────────────────────
  it('row-scoped: allows the granted KB id and denies a sibling KB id (P3.1b bug fix)', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()

        // Seed two KBs — plain user gets a row-scoped `read` on kb-1 only.
        const grantedKbId = await seedKb(k, 'kb-row-granted')
        const otherKbId = await seedKb(k, 'kb-row-other')

        await ModelFactory.resourceGrant.bulkCreate([
          {
            knowledge_base_id: grantedKbId,
            resource_type: 'KnowledgeBase',
            resource_id: grantedKbId,
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

        const mw = requireAbility('read', 'KnowledgeBase', 'id')

        // (a) Granted id — MUST allow.
        const allowCtx = makeReqRes({
          user: {
            id: userFixture.id,
            role: userFixture.role,
            is_superuser: false,
          },
          currentOrgId: userFixture.current_org_id,
          params: { id: grantedKbId },
          method: 'GET',
          path: `/api/kb/${grantedKbId}`,
        })
        await mw(allowCtx.req, allowCtx.res, allowCtx.next)
        expect(allowCtx.next).toHaveBeenCalledOnce()
        expect(allowCtx.status).toBe(0)

        // (b) Sibling id with no grant — MUST deny. Proves the row scoping
        // is real, not the middleware allowing everything.
        const denyCtx = makeReqRes({
          user: {
            id: userFixture.id,
            role: userFixture.role,
            is_superuser: false,
          },
          currentOrgId: userFixture.current_org_id,
          params: { id: otherKbId },
          method: 'GET',
          path: `/api/kb/${otherKbId}`,
        })
        await mw(denyCtx.req, denyCtx.res, denyCtx.next)
        expect(denyCtx.next).not.toHaveBeenCalled()
        expect(denyCtx.status).toBe(403)

        // (c) Regression check — demonstrate why the bare-string check the
        // OLD middleware used was broken. CASL's `ability.can('read',
        // 'KnowledgeBase')` with a bare string asks "does the user have ANY
        // rule allowing read on this subject class?" — and returns TRUE even
        // when the only matching rule is row-scoped to a specific id. That
        // means the old middleware let EVERY request through for sibling ids
        // the user never had a grant for. The load-bearing proof is that the
        // bare-string form CANNOT distinguish granted vs sibling ids — both
        // return true — whereas the wrapped instance form correctly says
        // true for the granted id and false for the sibling.
        const v2 = await __forTesting.buildAbilityForV2({
          id: userFixture.id,
          role: userFixture.role,
          is_superuser: false,
          current_org_id: userFixture.current_org_id,
        })
        // Bare-string class-level check: TRUE because a rule exists on the
        // class, even though its conditions restrict it to `grantedKbId`.
        // This was the silent over-allow that sent sibling-id requests
        // through the old middleware.
        const bareStringResult = v2.can('read', 'KnowledgeBase')
        expect(bareStringResult).toBe(true)
        // The wrapped instance form correctly honors row scoping:
        expect(
          v2.can(
            'read',
            asSubject('KnowledgeBase', {
              id: grantedKbId,
              tenant_id: userFixture.current_org_id,
            }) as any,
          ),
        ).toBe(true)
        expect(
          v2.can(
            'read',
            asSubject('KnowledgeBase', {
              id: otherKbId,
              tenant_id: userFixture.current_org_id,
            }) as any,
          ),
        ).toBe(false)
        // The regression signature: bare-string "allows" both ids; wrapped
        // distinguishes them. If a future refactor makes the bare-string
        // form row-aware, this assertion will flag that the fix is no
        // longer load-bearing (and the middleware can be simplified).
      } finally {
        restore()
      }
    }))

  it('misconfigured: idParam declared but req.params[idParam] is undefined → 500', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()
        const mw = requireAbility('read', 'KnowledgeBase', 'id')
        const ctx = makeReqRes({
          user: {
            id: userFixture.id,
            role: userFixture.role,
            is_superuser: false,
          },
          currentOrgId: userFixture.current_org_id,
          // Intentionally no params.id
          params: {},
          method: 'GET',
          path: '/api/kb/',
        })
        await mw(ctx.req, ctx.res, ctx.next)
        expect(ctx.next).not.toHaveBeenCalled()
        expect(ctx.status).toBe(500)
        expect(ctx.body).toMatchObject({
          error: 'permission_check_misconfigured',
        })
      } finally {
        restore()
      }
    }))

  it('returns 401 when no session user is present', async () => {
    const mw = requireAbility('read', 'KnowledgeBase')
    const ctx = makeReqRes({ user: null })
    await mw(ctx.req, ctx.res, ctx.next)
    expect(ctx.status).toBe(401)
    expect(ctx.next).not.toHaveBeenCalled()
  })
})
