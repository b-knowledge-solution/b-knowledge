/**
 * @fileoverview Deterministic CASL ability rule serializer.
 *
 * The Phase 2 V1↔V2 regression suite depends on `JSON.stringify(rules)` being
 * BYTE-FOR-BYTE stable across runs and across CASL internal insertion order.
 * CASL's `ability.rules` getter is order-sensitive (rules are evaluated in the
 * order `can()`/`cannot()` were called), so naive serialization would flap any
 * time the V2 builder iterated permissions in a different order than V1.
 *
 * `serializeRules` solves this by:
 *   1. Whitelisting only the snapshot-relevant fields (`action`, `subject`,
 *      `conditions`, `inverted`, `fields`) — runtime metadata is dropped.
 *   2. Sorting the rule list by a composite `(action, subject, conditions)` key
 *      so insertion order is irrelevant.
 *   3. Pretty-printing JSON with stable 2-space indentation.
 *
 * @module tests/permissions/__fixtures__/serialize-rules
 */

import type { AnyAbility } from '@casl/ability'

/**
 * @description Whitelist of CASL rule fields included in the serialized snapshot.
 * Runtime-only fields (e.g. `priority`, internal indices) are intentionally omitted
 * so additions to CASL's internal shape never accidentally invalidate snapshots.
 */
const SNAPSHOT_FIELD_WHITELIST = ['action', 'subject', 'conditions', 'inverted', 'fields'] as const

/**
 * @description Stable shape of one serialized rule. `action`/`subject` may be
 * arrays in CASL when the same rule covers multiple verbs/subjects.
 */
interface SerializedRule {
  action: string | string[]
  subject: string | string[]
  conditions: Record<string, unknown> | undefined
  inverted: boolean
  fields: string[] | undefined
}

/**
 * @description Coerce a CASL rule field that may be string or string[] into a
 * stable string for sort-key composition. Arrays are joined after a sort so
 * order-independent equivalence collapses to the same key.
 *
 * @param {string | string[] | undefined} value - Raw CASL field.
 * @returns {string} A stable, sortable string representation.
 */
function stableFieldKey(value: string | string[] | undefined): string {
  if (value === undefined) return ''
  if (Array.isArray(value)) return [...value].sort().join(',')
  return value
}

/**
 * @description Serializes a CASL ability's rule list to a deterministic JSON string.
 *
 * Determinism is non-negotiable: this function backs the V1 snapshot capture in
 * Plan P2.1 and the V1-vs-V2 tripwire in P2.4. Any non-determinism here would
 * cause snapshot tests to flap regardless of actual rule correctness.
 *
 * @param {AnyAbility} ability - CASL ability whose rules should be serialized.
 * @returns {string} Pretty-printed JSON snapshot of the sorted, whitelisted rule set.
 *
 * @example
 *   const ability = buildAbilityFor(adminFixture)
 *   const snapshot = serializeRules(ability)
 *   expect(snapshot).toMatchSnapshot()
 */
export function serializeRules(ability: AnyAbility): string {
  // Pull the raw rule array off the ability — CASL exposes this on every ability instance.
  const rawRules = ability.rules

  // Project each rule onto the whitelisted shape so unrelated CASL metadata never bleeds in.
  const projected: SerializedRule[] = rawRules.map((rule) => ({
    action: rule.action as string | string[],
    subject: rule.subject as string | string[],
    // CASL stores conditions as undefined when none present; preserve that distinction.
    conditions: (rule.conditions as Record<string, unknown> | undefined) ?? undefined,
    inverted: rule.inverted === true,
    fields: rule.fields as string[] | undefined,
  }))

  // Sort by composite key (action, subject, JSON-stringified conditions, inverted) so
  // insertion order in the underlying AbilityBuilder is irrelevant to the snapshot.
  const sorted = [...projected].sort((a, b) => {
    const ka = `${stableFieldKey(a.action)}|${stableFieldKey(a.subject)}|${JSON.stringify(a.conditions ?? null)}|${a.inverted ? '1' : '0'}`
    const kb = `${stableFieldKey(b.action)}|${stableFieldKey(b.subject)}|${JSON.stringify(b.conditions ?? null)}|${b.inverted ? '1' : '0'}`
    if (ka < kb) return -1
    if (ka > kb) return 1
    return 0
  })

  // Re-project through the whitelist one final time so the JSON output keys
  // are emitted in a fixed order (object literal property order). We coerce
  // `undefined` to `null` because `JSON.stringify` drops undefined-valued keys,
  // which would make the snapshot shape inconsistent across rules.
  const normalized = sorted.map((r) => {
    const out: Record<string, unknown> = {}
    for (const field of SNAPSHOT_FIELD_WHITELIST) {
      const value = r[field]
      out[field] = value === undefined ? null : value
    }
    return out
  })

  return JSON.stringify(normalized, null, 2)
}
