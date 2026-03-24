/**
 * @fileoverview Unit tests for the useGuideline hook.
 * Verifies guideline lookup by feature ID for all registered guidelines.
 */

import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGuideline } from '../../../../src/features/guideline/hooks/useGuideline'

describe('useGuideline', () => {
  // All registered feature IDs
  const registeredFeatures = [
    'ai-chat',
    'ai-search',
    'kb-config',
    'kb-prompts',
    'users',
    'teams',
    'audit',
    'broadcast',
    'global-histories',
  ]

  it.each(registeredFeatures)('returns a guideline for "%s"', (featureId) => {
    const { result } = renderHook(() => useGuideline(featureId))
    expect(result.current.guideline).not.toBeNull()
  })

  it('returns null for unknown feature ID', () => {
    const { result } = renderHook(() => useGuideline('nonexistent-feature'))
    expect(result.current.guideline).toBeNull()
  })

  it('returns null for empty string', () => {
    const { result } = renderHook(() => useGuideline(''))
    expect(result.current.guideline).toBeNull()
  })

  it('guideline object has expected structure', () => {
    const { result } = renderHook(() => useGuideline('ai-chat'))
    const guideline = result.current.guideline

    // Should have a non-empty object with guideline data
    expect(guideline).toBeTruthy()
    expect(typeof guideline).toBe('object')
  })
})
