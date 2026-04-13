/**
 * @fileoverview V1 ability rule snapshot capture — Phase 2 drift tripwire (secondary).
 *
 * This spec is the **secondary tripwire** in the Phase 2 V1↔V2 ability builder
 * safety net. It captures the *current* output of the legacy V1 `buildAbilityFor`
 * (in `be/src/shared/services/ability.service.ts`) as a committed Vitest snapshot,
 * one entry per canonical role fixture.
 *
 * Purpose:
 *   - Freeze V1's current rule emission as an immutable reference. Any future
 *     edit to `ability.service.ts` that changes rule shape/order/conditions will
 *     cause this test to fail, forcing a reviewer to either revert the change
 *     or *intentionally* regenerate the snapshot via `vitest -u`.
 *   - This is NOT used to compare V2 against V1. V1 emits ~11 rules per role
 *     using `manage` verbs; V2 (DB-backed) will emit ~80 rules per role using
 *     explicit CRUD verbs. They are *functionally* equivalent but *structurally*
 *     different. Functional parity (V1.can(x) === V2.can(x)) is asserted by the
 *     behavioral parity matrix in `v1-v2-parity.test.ts` (Plan P2.4) — the
 *     PRIMARY tripwire.
 *
 * DO NOT REGENERATE the snapshot file unless the V1 builder has been
 * intentionally modified. Accidental regeneration silently defeats the tripwire.
 *
 * @module tests/permissions/v1-snapshot-capture.test
 */

import { describe, it, expect } from 'vitest'
import { __forTesting } from '@/shared/services/ability.service.js'

// Pull the raw synchronous V1 builder directly. Post-P2.2, `buildAbilityFor`
// is an async dispatcher that picks V1 or V2 based on a feature flag — this
// spec intentionally freezes V1's output and must call V1 unconditionally.
const buildAbilityFor = __forTesting.buildAbilityForV1Sync
import { ALL_FIXTURES } from './__fixtures__/user-fixtures.js'
import { serializeRules } from './__fixtures__/serialize-rules.js'

// Fixed test-name map: each fixture maps to a stable `it()` name so the generated
// snapshot file has one clearly-named entry per role (super-admin/admin/leader/user).
// The order matches `ALL_FIXTURES` to keep snapshot diffs minimal if the iterator
// is ever re-ordered.
const FIXTURE_TEST_NAMES: Record<string, string> = {
  'fixture-super': 'super-admin',
  'fixture-admin': 'admin',
  'fixture-leader': 'leader',
  'fixture-user': 'user',
}

describe('V1 ability snapshot — DO NOT REGENERATE without intentional V1 change', () => {
  // Iterate canonical fixtures in declared order so the snapshot file's entry
  // order is stable across runs.
  for (const fixture of ALL_FIXTURES) {
    // Resolve the human-readable role name used as the snapshot entry key.
    const testName = FIXTURE_TEST_NAMES[fixture.id] ?? fixture.id

    it(testName, () => {
      // Call the V1 builder directly — no policies, pure role-based output.
      const ability = buildAbilityFor(fixture)

      // Run the deterministic serializer so insertion order in the V1 builder
      // never causes snapshot churn.
      const serialized = serializeRules(ability)

      // Vitest writes the snapshot to __snapshots__/v1-snapshot-capture.test.ts.snap
      // on first run. Subsequent runs compare byte-for-byte against the frozen file.
      expect(serialized).toMatchSnapshot()
    })
  }
})
