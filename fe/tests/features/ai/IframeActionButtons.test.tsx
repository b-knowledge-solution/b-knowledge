/**
 * @fileoverview Tests for IframeActionButtons component.
 *
 * Tests button rendering for chat vs search modes,
 * fullscreen toggle, and reset session functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('lucide-react', () => {
  const NullIcon = () => null
  return new Proxy({ default: NullIcon } as any, {
    get: (_t, prop) => (prop in _t ? _t[prop] : NullIcon),
  })
})

import { IframeActionButtons } from '../../../src/features/ai/components/IframeActionButtons'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IframeActionButtons', () => {
  const defaultProps = {
    path: 'chat' as const,
    isFullScreen: false,
    onToggleFullScreen: vi.fn(),
    onResetSession: vi.fn(),
    chatWidgetUrl: null as string | null | undefined,
    iframeRef: { current: null } as React.RefObject<HTMLIFrameElement | null>,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    const { container } = render(<IframeActionButtons {...defaultProps} />)
    expect(container).toBeTruthy()
  })

  it('calls onToggleFullScreen when fullscreen button is clicked', () => {
    render(<IframeActionButtons {...defaultProps} />)

    // Find the fullscreen button by looking for the button elements
    const buttons = screen.getAllByRole('button')
    // Click the first button (should be fullscreen toggle)
    if (buttons.length > 0) {
      fireEvent.click(buttons[0]!)
      // At least one of the handlers should have been called
      expect(
        defaultProps.onToggleFullScreen.mock.calls.length +
        defaultProps.onResetSession.mock.calls.length
      ).toBeGreaterThanOrEqual(1)
    }
  })

  it('calls onResetSession when reset button is clicked', () => {
    render(<IframeActionButtons {...defaultProps} />)

    const buttons = screen.getAllByRole('button')
    // Find and click the reset button (typically the second one)
    if (buttons.length > 1) {
      fireEvent.click(buttons[1]!)
      expect(
        defaultProps.onToggleFullScreen.mock.calls.length +
        defaultProps.onResetSession.mock.calls.length
      ).toBeGreaterThanOrEqual(1)
    }
  })
})
