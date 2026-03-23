/**
 * @fileoverview Tests for the useDebounce hook.
 *
 * Tests:
 * - Initial value is returned immediately
 * - Value updates after the specified delay
 * - Value does not update before delay elapses
 * - Timer resets when value changes during the delay window
 *
 * Uses fake timers to control setTimeout behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebounce } from '@/hooks/useDebounce'

// ============================================================================
// Tests
// ============================================================================

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 500))

    // Debounced value should match the initial value on first render
    expect(result.current).toBe('initial')
  })

  it('should update the value after the specified delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'first', delay: 300 } }
    )

    // Change the input value
    rerender({ value: 'second', delay: 300 })

    // Before delay: value should still be the initial one
    expect(result.current).toBe('first')

    // Advance timers past the delay
    act(() => {
      vi.advanceTimersByTime(300)
    })

    // After delay: debounced value should update
    expect(result.current).toBe('second')
  })

  it('should not update the value before the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'original', delay: 500 } }
    )

    // Change value and advance only partway through the delay
    rerender({ value: 'changed', delay: 500 })

    act(() => {
      vi.advanceTimersByTime(250)
    })

    // Value should not have updated yet — timer hasn't fired
    expect(result.current).toBe('original')
  })

  it('should reset the timer when the value changes during the delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 300 } }
    )

    // First change
    rerender({ value: 'b', delay: 300 })

    // Advance partway through the delay
    act(() => {
      vi.advanceTimersByTime(200)
    })

    // Second change before timer fires — should reset the delay
    rerender({ value: 'c', delay: 300 })

    // Advance past the original timer (200ms + 200ms = 400ms > 300ms)
    // but not past the reset timer
    act(() => {
      vi.advanceTimersByTime(200)
    })

    // Timer was reset, so value 'b' should never have appeared and 'c' not yet applied
    expect(result.current).toBe('a')

    // Complete the remaining delay for the latest value
    act(() => {
      vi.advanceTimersByTime(100)
    })

    // Now the debounced value should be the latest input
    expect(result.current).toBe('c')
  })

  it('should handle numeric values', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 0, delay: 200 } }
    )

    rerender({ value: 42, delay: 200 })

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(result.current).toBe(42)
  })
})
