/**
 * @fileoverview Floating action button for the chat widget.
 * Renders a 56px circular button with chat icon and optional unread badge.
 * Position is configurable (bottom-right or bottom-left).
 *
 * @module features/chat-widget/ChatWidgetButton
 */

import { MessageCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================================
// Props
// ============================================================================

interface ChatWidgetButtonProps {
  /** Whether the chat window is currently open */
  isOpen: boolean
  /** Toggle the chat window open/close */
  onToggle: () => void
  /** Number of unread messages to show in badge */
  unreadCount?: number | undefined
  /** Position of the button */
  position?: 'bottom-right' | 'bottom-left'
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Floating action button (FAB) that toggles the chat widget window.
 * Shows a chat icon when closed and an X icon when open.
 * Displays an unread message count badge when applicable.
 *
 * @param {ChatWidgetButtonProps} props - Component props including open state and position
 * @returns {JSX.Element} The rendered floating action button
 */
export default function ChatWidgetButton({
  isOpen,
  onToggle,
  unreadCount = 0,
  position = 'bottom-right',
}: ChatWidgetButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isOpen ? 'Close chat' : 'Open chat'}
      className={cn(
        'fixed z-[9999] flex h-14 w-14 items-center justify-center rounded-full',
        'bg-primary text-primary-foreground shadow-lg',
        'transition-all duration-200 hover:scale-105 hover:shadow-xl',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        position === 'bottom-right' ? 'bottom-6 right-6' : 'bottom-6 left-6',
      )}
    >
      {/* Icon transition: show X when open, chat icon when closed */}
      {isOpen ? (
        <X className="h-6 w-6" />
      ) : (
        <MessageCircle className="h-6 w-6" />
      )}

      {/* Unread badge — only visible when closed and has unread messages */}
      {!isOpen && unreadCount > 0 && (
        <span
          className={cn(
            'absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center',
            'rounded-full bg-destructive px-1 text-[11px] font-medium text-destructive-foreground',
            'animate-in fade-in zoom-in-50',
          )}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}
