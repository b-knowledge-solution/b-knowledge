/**
 * @fileoverview Unit tests for OverrideEditor pure helpers.
 *
 * NOTE: Component-tree rendering is avoided here for the same reason
 * documented in PrincipalPicker.test.tsx and ResourceGrantEditor.test.tsx —
 * cmdk + babel-plugin-react-compiler + jsdom hangs vitest during transform.
 * The component's logic is exercised through the exported pure helpers
 * `partitionOverrides` (allow/deny split) and `mergeEffective` (role +
 * override merge), which mirror the in-component flow 1:1.
 */
import { describe, it, expect } from 'vitest'
import { partitionOverrides } from '@/features/permissions/components/OverrideEditor'
import { mergeEffective } from '@/features/permissions/components/EffectivePermissionsPanel'
import {
  OVERRIDE_EFFECT_ALLOW,
  OVERRIDE_EFFECT_DENY,
  type UserPermissionOverride,
} from '@/features/permissions/types/permissions.types'

/**
 * @description Build a UserPermissionOverride fixture.
 */
function makeOverride(
  id: number,
  key: string,
  effect: typeof OVERRIDE_EFFECT_ALLOW | typeof OVERRIDE_EFFECT_DENY,
): UserPermissionOverride {
  return {
    id,
    user_id: 42,
    permission_key: key,
    effect,
    expires_at: null,
    created_at: '',
    updated_at: '',
  }
}

describe('OverrideEditor — partitionOverrides', () => {
  it('Test 1: partitions allow and deny rows into separate buckets', () => {
    const rows: UserPermissionOverride[] = [
      makeOverride(1, 'dataset.view', OVERRIDE_EFFECT_ALLOW),
      makeOverride(2, 'dataset.delete', OVERRIDE_EFFECT_DENY),
      makeOverride(3, 'chat.view', OVERRIDE_EFFECT_ALLOW),
    ]
    const { allows, denies } = partitionOverrides(rows)
    expect(allows).toHaveLength(2)
    expect(denies).toHaveLength(1)
    expect(allows[0]!.permission_key).toBe('dataset.view')
    expect(allows[1]!.permission_key).toBe('chat.view')
    expect(denies[0]!.permission_key).toBe('dataset.delete')
  })

  it('Test 2: returns two empty arrays when given no overrides', () => {
    const { allows, denies } = partitionOverrides([])
    expect(allows).toEqual([])
    expect(denies).toEqual([])
  })

  it('Test 3: preserves insertion order within each bucket', () => {
    const rows: UserPermissionOverride[] = [
      makeOverride(10, 'a.read', OVERRIDE_EFFECT_ALLOW),
      makeOverride(11, 'b.read', OVERRIDE_EFFECT_ALLOW),
      makeOverride(12, 'c.read', OVERRIDE_EFFECT_ALLOW),
    ]
    const { allows } = partitionOverrides(rows)
    expect(allows.map(a => a.id)).toEqual([10, 11, 12])
  })
})

describe('OverrideEditor — mergeEffective (D-05 client-side merge)', () => {
  it('Test 4: starts from role defaults when there are no overrides', () => {
    const result = mergeEffective(['dataset.view', 'dataset.edit'], [])
    // Sorted ascending
    expect(result).toEqual(['dataset.edit', 'dataset.view'])
  })

  it('Test 5: allow overrides add keys on top of role defaults', () => {
    const result = mergeEffective(
      ['dataset.view'],
      [makeOverride(1, 'chat.view', OVERRIDE_EFFECT_ALLOW)],
    )
    expect(result).toEqual(['chat.view', 'dataset.view'])
  })

  it('Test 6: deny overrides remove keys from the role defaults', () => {
    const result = mergeEffective(
      ['dataset.view', 'dataset.delete'],
      [makeOverride(1, 'dataset.delete', OVERRIDE_EFFECT_DENY)],
    )
    expect(result).toEqual(['dataset.view'])
  })

  it('Test 7: deny wins over a redundant allow for keys already in the role set', () => {
    const result = mergeEffective(
      ['dataset.view'],
      [
        makeOverride(1, 'dataset.view', OVERRIDE_EFFECT_ALLOW),
        makeOverride(2, 'dataset.view', OVERRIDE_EFFECT_DENY),
      ],
    )
    // Deny is applied AFTER allow since iteration is in-order — matches the
    // component comment: "deny removes". Effective set should be empty.
    expect(result).toEqual([])
  })

  it('Test 8: dedupes when an allow override repeats a role default', () => {
    const result = mergeEffective(
      ['a', 'b'],
      [makeOverride(1, 'a', OVERRIDE_EFFECT_ALLOW)],
    )
    expect(result).toEqual(['a', 'b'])
  })

  it('Test 9: sorts the merged output lexicographically', () => {
    const result = mergeEffective(['z', 'a', 'm'], [])
    expect(result).toEqual(['a', 'm', 'z'])
  })
})
