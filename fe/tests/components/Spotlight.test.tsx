/**
 * @fileoverview Tests for the Spotlight radial gradient background component.
 *
 * Covers default rendering, custom className application, and
 * theme-dependent color selection (dark vs light mode).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

// Track the mock return value so tests can switch between dark/light
let mockIsDarkMode = false

// Mock the SettingsContext hook used by Spotlight
vi.mock('@/app/contexts/SettingsContext', () => ({
  useSettings: () => ({
    isDarkMode: mockIsDarkMode,
    theme: mockIsDarkMode ? 'dark' : 'light',
    resolvedTheme: mockIsDarkMode ? 'dark' : 'light',
    setTheme: vi.fn(),
    language: 'en',
    setLanguage: vi.fn(),
    isSettingsOpen: false,
    openSettings: vi.fn(),
    closeSettings: vi.fn(),
  }),
}))

import { Spotlight } from '@/components/Spotlight'

describe('Spotlight', () => {
  beforeEach(() => {
    // Reset to light mode before each test
    mockIsDarkMode = false
  })

  it('renders with default props', () => {
    const { container } = render(<Spotlight />)
    // Should render an outer div with backdrop blur
    const outer = container.firstElementChild as HTMLElement
    expect(outer).toBeTruthy()
    expect(outer.className).toContain('absolute')
    expect(outer.style.backdropFilter).toBe('blur(30px)')

    // Inner div should exist with a gradient style
    const inner = outer.firstElementChild as HTMLElement
    expect(inner).toBeTruthy()
    expect(inner.style.background).toContain('radial-gradient')
  })

  it('applies custom className to outer container', () => {
    const { container } = render(<Spotlight className="my-custom-class" />)
    const outer = container.firstElementChild as HTMLElement
    expect(outer.className).toContain('my-custom-class')
    // Should still keep base classes
    expect(outer.className).toContain('absolute')
  })

  it('uses light blue color in light mode', () => {
    mockIsDarkMode = false
    const { container } = render(<Spotlight />)
    const outer = container.firstElementChild as HTMLElement
    const inner = outer.firstElementChild as HTMLElement
    // Light mode uses rgb(194, 221, 243)
    expect(inner.style.background).toContain('194, 221, 243')
  })

  it('uses white color in dark mode', () => {
    mockIsDarkMode = true
    const { container } = render(<Spotlight />)
    const outer = container.firstElementChild as HTMLElement
    const inner = outer.firstElementChild as HTMLElement
    // Dark mode uses rgb(255, 255, 255)
    expect(inner.style.background).toContain('255, 255, 255')
  })

  it('uses custom color when provided regardless of theme', () => {
    mockIsDarkMode = true
    const { container } = render(<Spotlight color="100, 200, 50" />)
    const outer = container.firstElementChild as HTMLElement
    const inner = outer.firstElementChild as HTMLElement
    // Custom color overrides theme-based selection
    expect(inner.style.background).toContain('100, 200, 50')
  })
})
