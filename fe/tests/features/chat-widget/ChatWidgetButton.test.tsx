/**
 * @fileoverview Unit tests for the ChatWidgetButton component.
 * Verifies rendering states, click behavior, unread badge display,
 * and accessibility attributes.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Override the global Proxy-based lucide-react mock with explicit named exports
vi.mock('lucide-react', () => ({
  MessageCircle: () => <span data-testid="message-circle-icon" />,
  X: () => <span data-testid="x-icon" />,
}))

// Mock cn utility to pass through classes
vi.mock('../../../src/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}))

import ChatWidgetButton from '../../../src/features/chat-widget/ChatWidgetButton'

describe('ChatWidgetButton', () => {
  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------
  describe('rendering', () => {
    it('renders with "Open chat" aria-label when closed', () => {
      render(<ChatWidgetButton isOpen={false} onToggle={vi.fn()} />)
      expect(screen.getByRole('button', { name: 'Open chat' })).toBeInTheDocument()
    })

    it('renders with "Close chat" aria-label when open', () => {
      render(<ChatWidgetButton isOpen={true} onToggle={vi.fn()} />)
      expect(screen.getByRole('button', { name: 'Close chat' })).toBeInTheDocument()
    })
  })

  // --------------------------------------------------------------------------
  // Click behavior
  // --------------------------------------------------------------------------
  describe('click behavior', () => {
    it('calls onToggle when clicked', () => {
      const onToggle = vi.fn()
      render(<ChatWidgetButton isOpen={false} onToggle={onToggle} />)

      fireEvent.click(screen.getByRole('button'))
      expect(onToggle).toHaveBeenCalledTimes(1)
    })
  })

  // --------------------------------------------------------------------------
  // Unread badge
  // --------------------------------------------------------------------------
  describe('unread badge', () => {
    it('shows unread count when closed and count > 0', () => {
      render(<ChatWidgetButton isOpen={false} onToggle={vi.fn()} unreadCount={5} />)
      expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('does not show badge when open even with unread count', () => {
      render(<ChatWidgetButton isOpen={true} onToggle={vi.fn()} unreadCount={5} />)
      expect(screen.queryByText('5')).not.toBeInTheDocument()
    })

    it('does not show badge when unread count is 0', () => {
      render(<ChatWidgetButton isOpen={false} onToggle={vi.fn()} unreadCount={0} />)
      // No badge number text should appear
      expect(screen.queryByText(/^\d+/)).not.toBeInTheDocument()
    })

    it('caps display at 99+ for large counts', () => {
      render(<ChatWidgetButton isOpen={false} onToggle={vi.fn()} unreadCount={150} />)
      expect(screen.getByText('99+')).toBeInTheDocument()
    })
  })
})
