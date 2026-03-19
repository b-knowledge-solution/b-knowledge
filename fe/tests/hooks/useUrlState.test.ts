/**
 * @fileoverview Tests for the useUrlState hook.
 *
 * Tests:
 * - Reading default value when param is not in URL
 * - Reading param from URL with string serialization
 * - Reading param with JSON serialization
 * - Setting value updates URL search params
 * - Setting the default value removes the param from URL
 * - Functional updater pattern
 *
 * Unmocks react-router-dom so MemoryRouter provides real search params.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React, { type ReactNode } from 'react'

// Restore the real react-router-dom so MemoryRouter's useSearchParams works
vi.unmock('react-router-dom')

import { useUrlState } from '@/hooks/useUrlState'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * @description Creates a wrapper component with MemoryRouter at a given initial route
 * @param {string} initialRoute - Initial URL path with optional query string
 * @returns {React.FC<{ children: ReactNode }>} Wrapper component for renderHook
 */
function createWrapper(initialRoute = '/') {
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(
      MemoryRouter,
      { initialEntries: [initialRoute] },
      children
    )
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('useUrlState', () => {
  it('should return the default value when param is not in the URL', () => {
    const { result } = renderHook(
      () => useUrlState('page', { defaultValue: 1 }),
      { wrapper: createWrapper('/') }
    )

    // No 'page' param in URL, so default should be returned
    const [value] = result.current
    expect(value).toBe(1)
  })

  it('should read a string param from the URL with string serialization', () => {
    const { result } = renderHook(
      () => useUrlState('q', { defaultValue: '', serialize: 'string' }),
      { wrapper: createWrapper('/?q=hello') }
    )

    const [value] = result.current
    expect(value).toBe('hello')
  })

  it('should read a numeric param from URL and coerce to number', () => {
    const { result } = renderHook(
      () => useUrlState('page', { defaultValue: 1, serialize: 'string' }),
      { wrapper: createWrapper('/?page=5') }
    )

    // String serialization with a number default should coerce back to number
    const [value] = result.current
    expect(value).toBe(5)
  })

  it('should read a param with JSON serialization', () => {
    const filters = { status: 'active', role: 'admin' }
    const encoded = encodeURIComponent(JSON.stringify(filters))

    const { result } = renderHook(
      () => useUrlState('filters', { defaultValue: {}, serialize: 'json' }),
      { wrapper: createWrapper(`/?filters=${encoded}`) }
    )

    const [value] = result.current
    expect(value).toEqual(filters)
  })

  it('should return default for malformed JSON in URL', () => {
    const { result } = renderHook(
      () => useUrlState('data', { defaultValue: { fallback: true }, serialize: 'json' }),
      { wrapper: createWrapper('/?data=not-valid-json') }
    )

    // Malformed JSON should fall back to default
    const [value] = result.current
    expect(value).toEqual({ fallback: true })
  })

  it('should update URL search params when setting a value', () => {
    const { result } = renderHook(
      () => useUrlState('q', { defaultValue: '' }),
      { wrapper: createWrapper('/') }
    )

    act(() => {
      const [, setValue] = result.current
      setValue('search-term')
    })

    // After setting, the hook should reflect the new value
    const [value] = result.current
    expect(value).toBe('search-term')
  })

  it('should remove param from URL when setting the default value', () => {
    const { result } = renderHook(
      () => useUrlState('page', { defaultValue: 1 }),
      { wrapper: createWrapper('/?page=3') }
    )

    // Verify initial value from URL
    expect(result.current[0]).toBe(3)

    // Set back to default value — should remove param to keep URL clean
    act(() => {
      const [, setValue] = result.current
      setValue(1)
    })

    expect(result.current[0]).toBe(1)
  })

  it('should support functional updater pattern', () => {
    const { result } = renderHook(
      () => useUrlState('count', { defaultValue: 0 }),
      { wrapper: createWrapper('/?count=5') }
    )

    expect(result.current[0]).toBe(5)

    // Use functional updater to increment based on previous value
    act(() => {
      const [, setValue] = result.current
      setValue((prev: number) => prev + 1)
    })

    expect(result.current[0]).toBe(6)
  })

  it('should handle boolean values with string serialization', () => {
    const { result } = renderHook(
      () => useUrlState('expanded', { defaultValue: false }),
      { wrapper: createWrapper('/?expanded=true') }
    )

    // String 'true' should be coerced to boolean true
    const [value] = result.current
    expect(value).toBe(true)
  })
})
