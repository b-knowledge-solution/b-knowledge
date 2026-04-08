/**
 * @fileoverview Tests for the catalog-backed useHasPermission hook.
 *
 * Verifies:
 *   1. Returns true when the underlying CASL ability grants the (action, subject) pair.
 *   2. Returns false when no matching rule exists.
 *   3. Returns false against the default empty ability (logged-out / pre-boot).
 *   4. Bare strings outside the PERMISSION_KEYS map are caught at compile time.
 */

import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createMongoAbility } from '@casl/ability'
import React from 'react'

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

describe('useHasPermission', () => {
  it('returns true when the ability grants the matching (action, subject) pair', () => {
    // Knowledge base view maps to (read, KnowledgeBase) in the catalog.
    const ability = createMongoAbility([{ action: 'read', subject: 'KnowledgeBase' }])

    const { result } = renderHook(() => useHasPermission(PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW), {
      wrapper: makeWrapper(ability),
    })

    expect(result.current).toBe(true)
  })

  it('returns false when no matching rule exists', () => {
    // Only read on KnowledgeBase — delete should be denied.
    const ability = createMongoAbility([{ action: 'read', subject: 'KnowledgeBase' }])

    const { result } = renderHook(() => useHasPermission(PERMISSION_KEYS.KNOWLEDGE_BASE_DELETE), {
      wrapper: makeWrapper(ability),
    })

    expect(result.current).toBe(false)
  })

  it('returns false against the default empty ability (logged-out / pre-boot)', () => {
    // No rules at all — every check should deny.
    const ability = createMongoAbility()

    const { result } = renderHook(() => useHasPermission(PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW), {
      wrapper: makeWrapper(ability),
    })

    expect(result.current).toBe(false)
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
