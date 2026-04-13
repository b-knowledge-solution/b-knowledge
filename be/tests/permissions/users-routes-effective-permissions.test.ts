// Phase 3 P3.0d — BEFORE-image snapshot for the users.routes.ts normalization
// gate (locked decision D1).
//
// This file captures the current effective permissions ON THE 'User' SUBJECT
// for each fixture role under the V2 ability builder. P3.3a will normalize
// `users.routes.ts:93` from requireAbility('manage','User','id') to
// requireAbility('edit','User','id'), which is a SEMANTIC change. P3.3a's
// AFTER-image must produce a byte-identical snapshot to prove no fixture's
// effective permissions changed.
//
// IF THIS SNAPSHOT CHANGES UNDER P3.3a — STOP and escalate. The snapshot
// must be regenerated only when D1's normalization is provably correct
// AND the diff is reviewed.
//
// This is NOT a V1↔V2 parity test (that lives in v1-v2-parity.test.ts).
// This is a frozen reference for the surgical D1 change.

import { describe, it, expect } from 'vitest'
import type { Knex } from 'knex'
import { subject as asSubject } from '@casl/ability'

import { withScratchDb } from './_helpers.js'
import { __forTesting, type AbilityUserContext } from '@/shared/services/ability.service.js'
import { ModelFactory } from '@/shared/models/factory.js'
import { syncPermissionsCatalog } from '@/shared/permissions/index.js'
import { ALL_FIXTURES } from './__fixtures__/user-fixtures.js'
import { resourcesBySubject } from './__fixtures__/resources-by-subject.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/**
 * @description CASL subject name under test — only 'User' is in scope for the
 * D1 normalization gate (users.routes.ts:93).
 */
const TARGET_SUBJECT = PermissionSubjects.User

/**
 * @description Exhaustive action set tested against the User subject. Covers
 * the standard CRUD verbs plus the `manage` wildcard (the current pre-D1 verb
 * on users.routes.ts:93) and the `edit` alias (the post-D1 verb). Sourced
 * conservatively so the before-image freezes ALL actions that could possibly
 * be checked against User, not only the ones the registry currently uses.
 */
const USER_ACTIONS = ['create', 'read', 'update', 'delete', 'manage', 'edit'] as const

/**
 * @description Repoint a BaseModel singleton at a scratch Knex for the
 * duration of a test block. Caller MUST invoke the returned restore fn in a
 * `finally` block so sibling specs don't inherit scratch state.
 * @param {unknown} model - ModelFactory singleton to repoint.
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
 * @description Pin every model the V2 builder reads through onto a single
 * scratch Knex instance. Returns a composite restore callback.
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
 * @description One row of the before-image — a single V2 verdict for a
 * (fixture × action × resourceId) tuple on the User subject.
 */
interface EffectivePermissionRow {
  fixture: string
  action: string
  resourceId: string | null
  result: boolean
}

/**
 * @description Capture the V2 effective-permission verdicts for one fixture
 * against the User subject across all actions × (representative ids + class).
 * Results are sorted deterministically so the snapshot is stable.
 * @param {AbilityUserContext} fixture - The user context to evaluate.
 * @returns {Promise<string>} Serialized JSON of all verdicts (sorted).
 */
async function captureForFixture(fixture: AbilityUserContext): Promise<string> {
  // Build the V2 ability via the canonical test entry point — this bypasses
  // the feature-flag dispatcher so the result is stable regardless of
  // config.permissions.useV2Engine default.
  const v2 = await __forTesting.buildAbilityForV2(fixture)

  // Resource ids from the shared map, plus null for the class-level check.
  const ids = resourcesBySubject[TARGET_SUBJECT] ?? []
  const idSet: Array<string | null> = [...ids, null]

  const rows: EffectivePermissionRow[] = []

  // Walk every (action × resource) combination and record the V2 verdict.
  for (const action of USER_ACTIONS) {
    for (const resourceId of idSet) {
      // CASL needs a wrapped subject when an object is passed; use the
      // subject() helper to bind the resource id + tenant context so
      // instance-level rule conditions are exercised.
      const target =
        resourceId === null
          ? (TARGET_SUBJECT as string)
          : (asSubject(TARGET_SUBJECT, {
              id: resourceId,
              tenant_id: fixture.current_org_id,
            }) as unknown as string)
      const result = v2.can(action as string, target as unknown as never)
      rows.push({
        fixture: fixture.id,
        action,
        resourceId,
        result,
      })
    }
  }

  // Sort deterministically: fixture → action → resourceId (null first).
  rows.sort((a, b) => {
    if (a.fixture !== b.fixture) return a.fixture < b.fixture ? -1 : 1
    if (a.action !== b.action) return a.action < b.action ? -1 : 1
    const ar = a.resourceId ?? ''
    const br = b.resourceId ?? ''
    if (ar !== br) return ar < br ? -1 : 1
    return 0
  })

  return JSON.stringify(rows, null, 2)
}

describe('P3.0d — V2 effective permissions on User subject (D1 before-image)', () => {
  for (const fixture of ALL_FIXTURES) {
    // One named it() per fixture so the snapshot file has 4 clearly-labeled
    // entries that a reviewer can diff in isolation under P3.3a.
    it(`effective-permissions-for-${fixture.role}`, () =>
      withScratchDb(async (k) => {
        const restore = pinAllAbilityModels(k)
        try {
          // Sync registry → permissions catalog so role_permissions JOIN
          // targets exist. withScratchDb already ran the P1.5 + P2.6 seeds,
          // so role_permissions is pre-populated in the post-P3.0a state.
          await syncPermissionsCatalog()

          const serialized = await captureForFixture(fixture as AbilityUserContext)
          expect(serialized).toMatchSnapshot()
        } finally {
          restore()
        }
      }))
  }
})
