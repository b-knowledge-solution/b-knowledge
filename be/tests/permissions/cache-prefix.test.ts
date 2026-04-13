/**
 * @fileoverview Phase 2 P2.5 — Ability cache prefix bump (R-2 mitigation).
 *
 * Asserts the `ABILITY_CACHE_PREFIX` constant has been bumped to the V2
 * namespace so that any V1-shaped rules cached under the pre-bump prefix
 * are structurally unreachable by the new code path and expire naturally
 * on their existing TTL.
 *
 * Live-Redis behavior tests (cacheAbility writes to the new prefix,
 * loadCachedAbility does not return rules cached under the old prefix)
 * are intentionally omitted because they require a running Redis instance
 * and this repo has no Redis mock helper. The constant-value assertion
 * below is sufficient evidence that the new code path uses a fresh
 * namespace — every cache helper in `ability.service.ts` derives its key
 * from this single constant (`${ABILITY_CACHE_PREFIX}${sessionId}`), so a
 * changed constant value transitively changes every read and write path.
 * Phase 2 UAT will verify the live behavior end-to-end.
 *
 * @see Phase 2 PLAN.md P2.5, RISKS.md R-2
 */
import { describe, it, expect } from 'vitest'
import { ABILITY_CACHE_PREFIX } from '../../src/shared/constants/permissions.js'

describe('P2.5 ability cache prefix (R-2 mitigation)', () => {
  it('uses the v2 namespace so V1-shaped cached rules are unreachable', () => {
    // Tripwire: if someone reverts the bump or changes the namespace shape,
    // this assertion fails loudly before the change can ship.
    expect(ABILITY_CACHE_PREFIX).toBe('ability:v2:')
  })

  it('is a strict extension of the pre-bump namespace (no key overlap)', () => {
    // The pre-bump literal was `'ability:'`. The new prefix must start with
    // it AND be strictly longer, so a lookup for `ability:v2:<sid>` cannot
    // ever hit a key previously written under `ability:<sid>`.
    const preBumpPrefix = 'ability:'
    expect(ABILITY_CACHE_PREFIX.startsWith(preBumpPrefix)).toBe(true)
    expect(ABILITY_CACHE_PREFIX.length).toBeGreaterThan(preBumpPrefix.length)
  })
})
