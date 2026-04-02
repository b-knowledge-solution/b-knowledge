/**
 * @fileoverview Unit tests for the useGuidedTour hook.
 * Verifies tour state management (start/stop controls).
 */

import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGuidedTour } from '../../../../src/features/guideline/hooks/useGuidedTour'

describe('useGuidedTour', () => {
  it('starts with tour not running', () => {
    const { result } = renderHook(() => useGuidedTour())
    expect(result.current.isTourRunning).toBe(false)
  })

  it('sets isTourRunning to true when startTour is called', () => {
    const { result } = renderHook(() => useGuidedTour())

    act(() => {
      result.current.startTour()
    })

    expect(result.current.isTourRunning).toBe(true)
  })

  it('sets isTourRunning to false when stopTour is called', () => {
    const { result } = renderHook(() => useGuidedTour())

    // Start then stop
    act(() => {
      result.current.startTour()
    })
    act(() => {
      result.current.stopTour()
    })

    expect(result.current.isTourRunning).toBe(false)
  })

  it('handles multiple start/stop cycles', () => {
    const { result } = renderHook(() => useGuidedTour())

    // Cycle 1
    act(() => result.current.startTour())
    expect(result.current.isTourRunning).toBe(true)
    act(() => result.current.stopTour())
    expect(result.current.isTourRunning).toBe(false)

    // Cycle 2
    act(() => result.current.startTour())
    expect(result.current.isTourRunning).toBe(true)
    act(() => result.current.stopTour())
    expect(result.current.isTourRunning).toBe(false)
  })

  it('calling stopTour when already stopped is a no-op', () => {
    const { result } = renderHook(() => useGuidedTour())

    act(() => result.current.stopTour())
    expect(result.current.isTourRunning).toBe(false)
  })
})
