/**
 * @fileoverview Tests for the catalog-backed useHasPermission hook.
 *
 * Verifies:
 *   1. Returns true when the underlying CASL ability grants the (action, subject) pair.
 *   2. Returns false when no matching rule exists.
 *   3. Returns false against the default empty ability (logged-out / pre-boot).
 *   4. Bare strings outside the PERMISSION_KEYS map are caught at compile time.
 */

import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createMongoAbility } from '@casl/ability'
import React from 'react'

// Mock the auth feature so ability.tsx's AbilityProvider dependency graph
// doesn't drag the full feature barrel into the test transform — mirrors the
// approach used in tests/lib/ability.test.tsx.
vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: null }),
}))

import { AbilityContext } from '@/lib/ability'
import { useHasPermission } from '@/lib/permissions'
import { PERMISSION_KEYS } from '@/constants/permission-keys'

/**
 * @description Builds a renderHook wrapper that injects a fixed CASL ability
 * via AbilityContext.Provider. Mirrors the wrapper pattern used in ability.test.tsx.
 *
 * @param {ReturnType<typeof createMongoAbility>} ability - Pre-built CASL ability instance.
 * @returns {(props: { children: React.ReactNode }) => JSX.Element} Wrapper component for renderHook.
 */
function makeWrapper(ability: ReturnType<typeof createMongoAbility>) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    // Cast keeps the strongly-typed AppAbility shape happy without leaking
    // CASL generics into every test case.
    return (
      <AbilityContext.Provider value={ability as never}>{children}</AbilityContext.Provider>
    )
  }
}

/**
 * @description Render the permission hook against a fixed CASL ability so
 * tests can focus on catalog-key behavior instead of wrapper setup.
 * @param {PermissionKey} key - Permission key under test.
 * @param {ReturnType<typeof createMongoAbility>} ability - Ability instance exposed through context.
 * @returns {boolean} Current hook result for the supplied key.
 */
function renderPermissionCheck(
  key: Parameters<typeof useHasPermission>[0],
  ability: ReturnType<typeof createMongoAbility>,
): boolean {
  const { result } = renderHook(() => useHasPermission(key), {
    wrapper: makeWrapper(ability),
  })

  return result.current
}

describe('useHasPermission', () => {
  it('returns true when the ability grants the matching (action, subject) pair', () => {
    // Knowledge base view maps to (read, KnowledgeBase) in the catalog.
    const ability = createMongoAbility([{ action: 'read', subject: 'KnowledgeBase' }])
    expect(renderPermissionCheck(PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW, ability)).toBe(true)
  })

  it('returns false when no matching rule exists', () => {
    // Only read on KnowledgeBase — delete should be denied.
    const ability = createMongoAbility([{ action: 'read', subject: 'KnowledgeBase' }])
    expect(renderPermissionCheck(PERMISSION_KEYS.KNOWLEDGE_BASE_DELETE, ability)).toBe(false)
  })

  it('returns false against the default empty ability (logged-out / pre-boot)', () => {
    // No rules at all — every check should deny.
    const ability = createMongoAbility()
    expect(renderPermissionCheck(PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW, ability)).toBe(false)
  })

  it('supports repeated checks against the same provider-backed ability', () => {
    const ability = createMongoAbility([{ action: 'read', subject: 'KnowledgeBase' }])

    // This establishes the provider-backed baseline that Phase 7.3 will keep
    // exercising after the catalog data source becomes runtime-refreshable.
    expect(renderPermissionCheck(PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW, ability)).toBe(true)
    expect(renderPermissionCheck(PERMISSION_KEYS.KNOWLEDGE_BASE_DELETE, ability)).toBe(false)
  })

  it('rejects bare strings outside PERMISSION_KEYS at compile time', () => {
    const ability = createMongoAbility()

    const { result } = renderHook(
      () =>
        // @ts-expect-error — bare string is not assignable to PermissionKey
        useHasPermission('not.a.real.key'),
      { wrapper: makeWrapper(ability) },
    )

    // Runtime fallback: unknown keys log a warning and return false.
    expect(result.current).toBe(false)
  })
})
