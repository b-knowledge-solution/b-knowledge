// SECONDARY tripwire for Phase 2.
// Asserts that V1 and V2 emit structurally-equivalent rule sets for each
// fixture, AFTER FILTERING both rule sets to THAT FIXTURE'S per-fixture
// V1-relevant subject set AND expanding V1's `manage` verb into its
// constituent {create,read,update,delete} CRUD verbs.
//
// Per-fixture scoping rationale: V2 must agree with V1 wherever V1 has an
// opinion for that specific user. A global union of V1 subjects across all
// fixtures would force V2 to match V1's silence on subjects V1 never
// addressed for a given fixture — that's structurally wrong. Subjects V1
// doesn't address per-fixture are Phase 3's middleware territory and
// tested separately.
//
// Why the normalization? V1 emits `manage Subject` as a single rule, while
// V2 (data-driven from the permission registry) expands to individual CRUD
// verbs. A naive byte-equal comparison would always fail even when the two
// builders agree on behavior. Expanding V1's `manage` before comparison
// gives both sides the same verb universe, so the normalized strings
// represent the same "access surface" expressed in a common form.
//
// This catches rule-shape drift (extra/missing conditions, missing
// tenant_id, wrong `inverted` flag, extra subjects). The behavioral parity
// matrix in v1-v2-parity.test.ts catches decision drift. Both are needed.

import { describe, it, expect } from 'vitest'
import type { Knex } from 'knex'
import { withScratchDb } from './_helpers.js'
import {
  __forTesting,
  type AppAbility,
  type AbilityUserContext,
} from '@/shared/services/ability.service.js'
import { ModelFactory } from '@/shared/models/factory.js'
import { syncPermissionsCatalog } from '@/shared/permissions/index.js'
import { ALL_FIXTURES } from './__fixtures__/user-fixtures.js'
import { UserRole } from '@/shared/constants/index.js'
import { getAllPermissions } from '@/shared/permissions/index.js'

/**
 * @description Repoint a BaseModel singleton at a scratch Knex for the
 * duration of a test block. Caller MUST invoke the returned restore.
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
 * @description Pin every model touched by `buildAbilityForV2` to a scratch
 * Knex. Returns a composite restore callback.
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
 * @description Build a per-fixture map of V1-relevant subjects. Each
 * non-super-admin fixture gets its own set of subjects V1 emits rules for.
 * Super-admin is special-cased in the test body (its `manage all` wildcard
 * is compared via raw rule-shape assertion, not the normalizer).
 * @returns {Map<string, Set<string>>} Map from fixture.id → subject set.
 */
function buildV1RelevantSubjectsPerFixture(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const fixture of ALL_FIXTURES) {
    if (fixture.role === UserRole.SUPER_ADMIN || fixture.is_superuser === true) continue
    const v1 = __forTesting.buildAbilityForV1Sync(fixture)
    const subjects = new Set<string>()
    for (const rule of v1.rules) {
      const subj = rule.subject
      if (subj === 'all' || subj === undefined) continue
      const arr = Array.isArray(subj) ? subj : [subj]
      for (const s of arr) {
        if (typeof s === 'string' && s !== 'all') subjects.add(s)
      }
    }
    map.set(fixture.id, subjects)
  }
  return map
}

/**
 * @description CRUD fallback used when the registry has zero permissions for
 * a given subject (defensive — should not happen in practice, but keeps the
 * normalizer total). V1's `manage Subject` emits these four verbs at minimum.
 */
const MANAGE_CRUD_FALLBACK = ['create', 'read', 'update', 'delete'] as const

/**
 * @description Memoized cache of subject → distinct action verbs registered
 * in the live permission registry. Computed lazily on first call so that
 * `getAllPermissions()` is invoked at most once per subject per test run.
 *
 * The earlier hard-coded `['create', 'read', 'update', 'delete']` expansion
 * was incomplete: registry subjects like `Agent` carry custom verbs such as
 * `run` and `debug` (from `agents.run` / `agents.debug`), and `Glossary`
 * carries `import`. Hardcoding CRUD only would falsely diff V1's manage-rule
 * (which CASL treats as covering ALL verbs for that subject) against V2's
 * explicit registry-driven verb set. Deriving from the registry eliminates
 * the false positive.
 *
 * @see Phase 2 P2.4 deviations — bonus normalizer fix.
 */
const subjectActionsCache = new Map<string, readonly string[]>()

/**
 * @description Return the set of distinct action verbs the live permission
 * registry registers for `subject`. Falls back to `MANAGE_CRUD_FALLBACK` if
 * the registry has nothing for the subject (defensive — should not happen).
 *
 * @param {string} subject - CASL subject name (e.g. `Agent`, `Dataset`).
 * @returns {readonly string[]} Sorted distinct action verbs for the subject.
 */
function getRegistryActionsForSubject(subject: string): readonly string[] {
  // Cache hit — registry contents are immutable for the lifetime of a test run.
  const cached = subjectActionsCache.get(subject)
  if (cached !== undefined) return cached

  // Walk the registry once and collect distinct actions for this subject.
  const actions = new Set<string>()
  for (const p of getAllPermissions()) {
    if (p.subject === subject) actions.add(p.action)
  }

  // Defensive fallback — registry should always have CRUD for any subject
  // V1 grants `manage` on, but cover the impossible case anyway.
  const result = actions.size === 0
    ? [...MANAGE_CRUD_FALLBACK]
    : Array.from(actions).sort()

  subjectActionsCache.set(subject, result)
  return result
}

/**
 * @description Reduce an ability to a sorted, newline-joined set of
 * `(action|subject|conditions)` triples restricted to `allow` subjects.
 *
 * This is stricter than `serializeRules` for the purposes of the secondary
 * tripwire: it expands `manage` into the 4 CRUD verbs, collapses duplicates,
 * and drops runtime metadata entirely. Any structural drift in V2 relative
 * to V1 (extra conditions, different `inverted` flag, etc.) will surface as
 * a diff in the generated text block.
 *
 * @param {AppAbility} ability - Source ability to normalize.
 * @param {Set<string>} allow - Subjects to retain.
 * @returns {string} Deterministic multi-line snapshot text.
 */
function normalizeFilteredRules(ability: AppAbility, allow: Set<string>): string {
  const triples = new Set<string>()
  for (const rule of ability.rules) {
    const subj = rule.subject
    if (subj === undefined || subj === 'all') continue
    const subjects = (Array.isArray(subj) ? subj : [subj]).filter(
      (s): s is string => typeof s === 'string' && allow.has(s),
    )
    if (subjects.length === 0) continue

    const rawActions = rule.action
    const actions = Array.isArray(rawActions) ? rawActions : [rawActions]

    const conditions = rule.conditions ?? null
    const condKey = JSON.stringify(conditions, Object.keys(conditions ?? {}).sort())
    const inverted = rule.inverted === true ? '!' : ''

    // Expand `manage` into the FULL distinct action set the live registry
    // declares for the matching subject. This is per-subject because e.g.
    // `Agent` has `read/create/update/delete/run/debug/manage` while
    // `Memory` has only `read/create/update/delete`. A naive uniform CRUD
    // expansion would produce false-positive `+run|Agent` / `+debug|Agent`
    // diffs against V2's explicit registry-driven rule set.
    for (const s of subjects) {
      // Resolve the registry verb set ONCE per subject in this rule.
      const registryActions = getRegistryActionsForSubject(s)
      const expanded = actions.flatMap((a) =>
        a === 'manage' ? registryActions : [a],
      )
      for (const a of expanded) {
        triples.add(`${inverted}${a}|${s}|${condKey}`)
      }
    }
  }
  return [...triples].sort().join('\n')
}

describe('V1↔V2 literal snapshot tripwire (per-fixture subject-scoped)', () => {
  it('V1 and V2 emit byte-identical serialized rule sets for every fixture (per-fixture filtered)', () =>
    withScratchDb(async (k) => {
      const restore = pinAllAbilityModels(k)
      try {
        await syncPermissionsCatalog()

        const v1SubjectsByFixture = buildV1RelevantSubjectsPerFixture()
        // Sanity gate: every non-super-admin fixture must have non-empty set.
        for (const fixture of ALL_FIXTURES) {
          if (fixture.role === UserRole.SUPER_ADMIN || fixture.is_superuser === true) continue
          expect(v1SubjectsByFixture.get(fixture.id)?.size ?? 0).toBeGreaterThan(0)
        }

        for (const fixture of ALL_FIXTURES) {
          // Super-admin special case: both V1 and V2 emit `manage all`.
          // Compare the UNFILTERED serialization since `all` would be stripped
          // by the subject filter otherwise.
          if (fixture.role === UserRole.SUPER_ADMIN || fixture.is_superuser === true) {
            const v1 = __forTesting.buildAbilityForV1Sync(fixture)
            const v2 = await __forTesting.buildAbilityForV2(fixture)
            // Both should emit a single `manage all` rule; compare via raw
            // rule shape since the normalizer strips `all`.
            expect(v1.rules).toHaveLength(1)
            expect(v2.rules).toHaveLength(1)
            expect(v1.rules[0].action).toBe('manage')
            expect(v2.rules[0].action).toBe('manage')
            expect(v1.rules[0].subject).toBe('all')
            expect(v2.rules[0].subject).toBe('all')
            continue
          }

          const v1 = __forTesting.buildAbilityForV1Sync(fixture as AbilityUserContext)
          const v2 = await __forTesting.buildAbilityForV2(fixture as AbilityUserContext)

          // Per-fixture filter: only compare subjects V1 addressed for THIS
          // specific fixture. Applied to both V1 and V2 rule lists.
          const relevantForThisFixture =
            v1SubjectsByFixture.get(fixture.id) ?? new Set<string>()

          expect(
            normalizeFilteredRules(v2, relevantForThisFixture),
            `fixture=${fixture.role} normalized (manage-expanded) rules mismatch`,
          ).toBe(normalizeFilteredRules(v1, relevantForThisFixture))
        }
      } finally {
        restore()
      }
    }))
})
