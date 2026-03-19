/**
 * @fileoverview Tests for shared utility functions.
 *
 * Tests:
 * - cn(): Merging class names, conditional classes, Tailwind conflict resolution
 */

import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

// ============================================================================
// Tests
// ============================================================================

describe('cn()', () => {
  it('should merge multiple class name strings', () => {
    const result = cn('flex', 'items-center', 'gap-2')
    expect(result).toBe('flex items-center gap-2')
  })

  it('should handle conditional classes via object syntax', () => {
    const isActive = true
    const isDisabled = false

    const result = cn('btn', { 'bg-blue-500': isActive, 'opacity-50': isDisabled })

    // Active class should be included, disabled class should be excluded
    expect(result).toContain('bg-blue-500')
    expect(result).not.toContain('opacity-50')
  })

  it('should resolve Tailwind class conflicts by keeping the last value', () => {
    // tailwind-merge should deduplicate conflicting utilities
    const result = cn('p-4', 'p-2')
    expect(result).toBe('p-2')
  })

  it('should resolve conflicting Tailwind color classes', () => {
    const result = cn('text-red-500', 'text-blue-500')
    expect(result).toBe('text-blue-500')
  })

  it('should handle empty inputs', () => {
    expect(cn()).toBe('')
    expect(cn('')).toBe('')
    expect(cn(undefined)).toBe('')
    expect(cn(null)).toBe('')
  })

  it('should handle array inputs', () => {
    const result = cn(['flex', 'gap-2'], 'p-4')
    expect(result).toContain('flex')
    expect(result).toContain('gap-2')
    expect(result).toContain('p-4')
  })

  it('should handle mixed conditional and string inputs', () => {
    const result = cn(
      'base-class',
      false && 'hidden',
      'visible-class',
      undefined,
      null,
    )

    expect(result).toContain('base-class')
    expect(result).toContain('visible-class')
    expect(result).not.toContain('hidden')
  })

  it('should resolve complex Tailwind conflicts across multiple arguments', () => {
    // Later padding overrides earlier padding, but unrelated classes remain
    const result = cn('px-4 py-2 text-sm', 'px-6 font-bold')
    expect(result).toContain('px-6')
    expect(result).not.toContain('px-4')
    expect(result).toContain('py-2')
    expect(result).toContain('text-sm')
    expect(result).toContain('font-bold')
  })
})
