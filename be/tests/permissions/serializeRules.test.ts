/**
 * @fileoverview Unit tests for the deterministic CASL rule serializer.
 *
 * Verifies the three properties the Phase 2 regression suite depends on:
 *   1. Determinism — different `can()` insertion orders produce identical output.
 *   2. Whitelisting — non-snapshot fields are stripped.
 *   3. Shape — output is parseable JSON, an array, with only whitelisted keys.
 *
 * @module tests/permissions/serializeRules.test
 */

import { describe, it, expect } from 'vitest'
import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability'
import { serializeRules } from './__fixtures__/serialize-rules.js'

/** Whitelist mirrored from the serializer — kept local so a drift here is caught by the shape test. */
const EXPECTED_KEYS = ['action', 'subject', 'conditions', 'inverted', 'fields'] as const

type TestAbility = MongoAbility

/**
 * @description Build a CASL ability via a callback that receives the builder helpers.
 * @param {(b: AbilityBuilder<TestAbility>) => void} fn - Builder callback.
 * @returns {TestAbility} The compiled ability.
 */
function buildWith(fn: (b: AbilityBuilder<TestAbility>) => void): TestAbility {
  const builder = new AbilityBuilder<TestAbility>(createMongoAbility)
  fn(builder)
  return builder.build()
}

describe('serializeRules', () => {
  it('produces identical output regardless of can() insertion order', () => {
    // Order A: read first, then create.
    const abilityA = buildWith(({ can }) => {
      can('read', 'Dataset', { tenant_id: 'org-1' })
      can('create', 'Document', { tenant_id: 'org-1' })
      can('manage', 'User', { tenant_id: 'org-1' })
    })

    // Order B: reverse insertion order — should still serialize to the same string.
    const abilityB = buildWith(({ can }) => {
      can('manage', 'User', { tenant_id: 'org-1' })
      can('create', 'Document', { tenant_id: 'org-1' })
      can('read', 'Dataset', { tenant_id: 'org-1' })
    })

    expect(serializeRules(abilityA)).toBe(serializeRules(abilityB))
  })

  it('strips fields outside the snapshot whitelist', () => {
    // CASL accepts arbitrary metadata on rules via raw rule definitions —
    // simulate by injecting unknown keys after build.
    const ability = buildWith(({ can }) => {
      can('read', 'Dataset', { tenant_id: 'org-1' })
    })

    // Mutate the underlying rule to add fields the serializer must drop.
    ;(ability.rules[0] as unknown as Record<string, unknown>).reason = 'debug'
    ;(ability.rules[0] as unknown as Record<string, unknown>).priority = 99

    const serialized = serializeRules(ability)
    expect(serialized).not.toContain('reason')
    expect(serialized).not.toContain('priority')
    expect(serialized).not.toContain('debug')
  })

  it('emits parseable JSON whose elements only contain whitelisted keys', () => {
    const ability = buildWith(({ can, cannot }) => {
      can('read', 'Dataset', { tenant_id: 'org-1' })
      cannot('delete', 'Dataset', { tenant_id: 'org-1' })
    })

    const parsed = JSON.parse(serializeRules(ability)) as Array<Record<string, unknown>>
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBe(2)

    // Each element must contain ONLY the whitelisted keys (no extras).
    for (const rule of parsed) {
      const keys = Object.keys(rule).sort()
      expect(keys).toEqual([...EXPECTED_KEYS].sort())
    }
  })

  it('marks inverted rules with inverted=true', () => {
    const ability = buildWith(({ cannot }) => {
      cannot('delete', 'Dataset', { tenant_id: 'org-1' })
    })

    const parsed = JSON.parse(serializeRules(ability)) as Array<Record<string, unknown>>
    expect(parsed[0]?.inverted).toBe(true)
  })
})
