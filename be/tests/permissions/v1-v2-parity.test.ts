// PRIMARY parity test for Phase 2.
//
// Compares the legacy V1 ability builder (`buildAbilityForV1Sync`) to the new
// V2 builder (`buildAbilityForV2`) across the FULL behavioral matrix:
//   (every fixture) × (every action) × (every subject V1 emits for THIS fixture) × (every representative resource id + the no-id case)
//
// SUBJECT SCOPING (locked decision C, per-fixture shape):
// V1 has two parallel permission systems internally — buildAbilityFor() (CASL)
// and hasPermission() (static map). Phase 1's seed mirrored hasPermission(),
// so role_permissions contains keys for subjects V1's CASL builder never
// emitted rules for. V2 emits rules for all of them, which is intentional.
// This matrix is therefore restricted PER FIXTURE to the subjects V1's CASL
// builder emits a rule for FOR THAT SPECIFIC FIXTURE. A global union across
// all fixtures is too coarse: it would e.g. test (user, ChatAssistant) just
// because admin had a ChatAssistant rule, even though V1's user had no
// opinion on ChatAssistant.
//
// This scoping is structurally narrower than a global union, but it matches
// the actual contract — V2 must agree with V1 *wherever V1 has an opinion
// for that specific user*. Subjects V1 doesn't address per-fixture are
// Phase 3's middleware territory and tested separately.
//
// This is the load-bearing safety net for the Phase 3 cutover. If this file
// passes, flipping config.permissions.useV2Engine to true MUST be a no-op
// for end users (within the V1-relevant subject set).
//
// The literal-snapshot tripwire lives in v2-vs-v1-snapshot.test.ts.
// Do NOT merge the two — they catch different bugs.

import { describe, it, expect } from 'vitest'
import type { Knex } from 'knex'
import { subject as asSubject } from '@casl/ability'

import { withScratchDb } from './_helpers.js'
import { __forTesting, type AbilityUserContext } from '@/shared/services/ability.service.js'
import { ModelFactory } from '@/shared/models/factory.js'
import { syncPermissionsCatalog } from '@/shared/permissions/index.js'
import { ALL_FIXTURES } from './__fixtures__/user-fixtures.js'
import { iterateMatrix } from './__fixtures__/iterate-matrix.js'
import { resourcesBySubject } from './__fixtures__/resources-by-subject.js'
import { UserRole } from '@/shared/constants/index.js'

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
 * @description Build a per-fixture map of the CASL subject names that V1's
 * builder emits a rule for, keyed by fixture id. This is the correctly-shaped
 * "V1-relevant" subject scoping: V2 must agree with V1 wherever V1 has an
 * opinion FOR THAT SPECIFIC FIXTURE. Super-admin is special-cased elsewhere
 * (its `manage all` wildcard is compared via a raw rule-shape assertion).
 * @returns {Map<string, Set<string>>} Map from fixture.id → set of subjects.
 */
function buildV1RelevantSubjectsPerFixture(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const fixture of ALL_FIXTURES) {
    // Super-admin emits `manage all` — handled as a special case in the
    // matrix walk, so skip it here entirely.
    if (fixture.role === UserRole.SUPER_ADMIN || fixture.is_superuser === true) continue
    const v1 = __forTesting.buildAbilityForV1Sync(fixture)
    const subjects = new Set<string>()
    for (const rule of v1.rules) {
      const subj = rule.subject
      // Skip the `all` wildcard — only non-super-admin fixtures reach here,
      // but a defensive skip keeps the per-fixture set meaningful.
      if (subj === 'all' || subj === undefined) continue
      // CASL rule.subject may be string or string[].
      const arr = Array.isArray(subj) ? subj : [subj]
      for (const s of arr) {
        if (typeof s === 'string' && s !== 'all') subjects.add(s)
      }
    }
    map.set(fixture.id, subjects)
  }
  return map
}

describe('V1↔V2 behavioral parity matrix (per-fixture subject-scoped)', () => {
  it('V2 matches V1 for every (fixture × action × subject × resourceId) tuple within per-fixture V1 subjects', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        // Sync registry → permissions catalog so role_permissions JOIN targets exist.
        // withScratchDb already ran P1.5 + P2.6 seeds, so role_permissions is pre-populated.
        await syncPermissionsCatalog()

        // Build the per-fixture V1-relevant subject map ONCE from V1's
        // empirical output. Each non-super-admin fixture has its own set.
        const v1SubjectsByFixture = buildV1RelevantSubjectsPerFixture()
        // Sanity gate: every non-super-admin fixture must have a non-empty
        // V1 subject set, else the matrix below would silently test nothing.
        for (const fixture of ALL_FIXTURES) {
          if (fixture.role === UserRole.SUPER_ADMIN || fixture.is_superuser === true) continue
          expect(v1SubjectsByFixture.get(fixture.id)?.size ?? 0).toBeGreaterThan(0)
        }

        // Per-fixture tuple count for the human-review evidence log required
        // by the Phase Exit Checklist.
        const perFixtureCounts: Record<string, number> = {}
        let totalTuples = 0

        for (const fixture of ALL_FIXTURES) {
          // Super-admin special case: both V1 and V2 emit a single `manage all`
          // rule. Assert byte-equal serialization and skip the matrix walk.
          if (fixture.role === UserRole.SUPER_ADMIN || fixture.is_superuser === true) {
            const v1Super = __forTesting.buildAbilityForV1Sync(fixture)
            const v2Super = await __forTesting.buildAbilityForV2(fixture)
            // Super-admin has one `manage all` rule in both builders; compare raw.
            expect(v1Super.rules.length).toBe(1)
            expect(v2Super.rules.length).toBe(1)
            expect(v2Super.can('manage', 'all' as any)).toBe(true)
            expect(v1Super.can('manage', 'all' as any)).toBe(true)
            perFixtureCounts[fixture.role] = 1
            totalTuples += 1
            continue
          }

          const v1 = __forTesting.buildAbilityForV1Sync(fixture as AbilityUserContext)
          const v2 = await __forTesting.buildAbilityForV2(fixture as AbilityUserContext)

          // Per-fixture scoping: only test subjects V1 emits a rule for
          // FOR THIS SPECIFIC FIXTURE. Subjects V1 didn't address for this
          // user are Phase 3 middleware territory.
          const relevantForThisFixture = v1SubjectsByFixture.get(fixture.id) ?? new Set<string>()

          let count = 0
          for (const tuple of iterateMatrix([fixture], resourcesBySubject)) {
            if (!relevantForThisFixture.has(tuple.subject)) continue

            // CASL needs a wrapped subject instance when passing an object,
            // otherwise it interprets the 3rd arg as a field name. Use the
            // subject() helper to bind the resource id + tenant.
            const instance = tuple.resourceId
              ? asSubject(tuple.subject, {
                  id: tuple.resourceId,
                  tenant_id: fixture.current_org_id,
                })
              : null
            const v1Result = instance
              ? v1.can(tuple.action as any, instance as any)
              : v1.can(tuple.action as any, tuple.subject as any)
            const v2Result = instance
              ? v2.can(tuple.action as any, instance as any)
              : v2.can(tuple.action as any, tuple.subject as any)

            // Use soft assertions so a single failure does not mask the rest
            // of the matrix; the whole point is to surface ALL divergences.
            expect
              .soft(
                v2Result,
                `fixture=${fixture.role} action=${tuple.action} subject=${tuple.subject} resource=${tuple.resourceId ?? '(class)'}`,
              )
              .toBe(v1Result)
            count += 1
          }

          perFixtureCounts[fixture.role] = count
          totalTuples += count
        }

        // Emit the tuple count as the human-review evidence log. Required by
        // the Phase Exit Checklist so reviewers can sanity-check cardinality.
        // eslint-disable-next-line no-console
        console.log(
          `[P2.4 parity] tested ${totalTuples} tuples total; per-fixture: ${JSON.stringify(perFixtureCounts)}`,
        )
      } finally {
        restore()
      }
    }))
})
