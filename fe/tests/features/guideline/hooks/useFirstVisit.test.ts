/**
 * @fileoverview Unit tests for the useFirstVisit hook.
 * Verifies that auto-show logic is disabled and all functions are no-ops.
 */

import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useFirstVisit } from '../../../../src/features/guideline/hooks/useFirstVisit'

describe('useFirstVisit', () => {
  it('returns isFirstVisit as false', () => {
    const { result } = renderHook(() => useFirstVisit('test-feature'))
    expect(result.current.isFirstVisit).toBe(false)
  })

  it('returns shouldShowAuto as false', () => {
    const { result } = renderHook(() => useFirstVisit('test-feature'))
    expect(result.current.shouldShowAuto).toBe(false)
  })

  it('provides no-op control functions that do not throw', () => {
    const { result } = renderHook(() => useFirstVisit('any-feature'))

    // All control functions should be callable without error
    expect(() => result.current.markAsSessionSeen()).not.toThrow()
    expect(() => result.current.markAsPermanentlySeen()).not.toThrow()
    expect(() => result.current.resetSeen()).not.toThrow()
  })

  it('returns same shape regardless of feature ID', () => {
    const { result: r1 } = renderHook(() => useFirstVisit('feature-a'))
    const { result: r2 } = renderHook(() => useFirstVisit('feature-b'))

    // Both should have identical boolean values
    expect(r1.current.isFirstVisit).toBe(r2.current.isFirstVisit)
    expect(r1.current.shouldShowAuto).toBe(r2.current.shouldShowAuto)
  })
})
