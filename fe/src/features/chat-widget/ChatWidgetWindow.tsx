/**
 * @fileoverview Chat widget window component.
 * Renders the 380px overlay window with header, message list, and input area.
 * Reuses shared components from the main chat feature where possible.
 *
 * @module features/chat-widget/ChatWidgetWindow
 */

import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Minimize2, Send, Loader2, Bot, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WidgetDialogInfo } from './chatWidgetApi'

// ============================================================================
// Types
// ============================================================================

/**
 * @description A message in the widget conversation.
 */
export interface WidgetMessage {
  /** Unique message identifier */
  id: string
  /** Message sender role */
  role: 'user' | 'assistant'
  /** Message text content */
  content: string
  /** ISO timestamp */
  timestamp: string
}

interface ChatWidgetWindowProps {
  /** Whether the window is visible */
  isOpen: boolean
  /** Close the window */
  onClose: () => void
  /** Dialog info for the header */
  dialogInfo: WidgetDialogInfo | null
  /** All messages in the conversation */
  messages: WidgetMessage[]
  /** Whether a streaming response is in progress */
  isStreaming: boolean
  /** The partial answer being streamed */
  currentAnswer: string
  /** Send a user message */
  onSendMessage: (content: string) => void
  /** Position of the widget */
  position?: 'bottom-right' | 'bottom-left'
  /** Pipeline status label */
  statusLabel?: string | null
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Chat widget window overlay with header, message list, and input.
 * Positioned above the FAB button with a fixed width of 380px.
 *
 * @param {ChatWidgetWindowProps} props - Component props including messages, streaming state, and callbacks
 * @returns {JSX.Element | null} The rendered chat window or null when closed
 */
export default function ChatWidgetWindow({
  isOpen,
  onClose,
  dialogInfo,
  messages,
  isStreaming,
  currentAnswer,
  onSendMessage,
  position = 'bottom-right',
  statusLabel,
}: ChatWidgetWindowProps) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentAnswer])

  // Focus input when window opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to allow animation to complete
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [isOpen])

  /**
   * @description Handle message submission, clearing input on success.
   */
  const handleSubmit = () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return
    onSendMessage(trimmed)
    setInput('')
  }

  /**
   * @description Handle keyboard events: Enter to send, Shift+Enter for newline.
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className={cn(
        'fixed z-[9998] flex flex-col',
        'w-[380px] h-[520px] max-h-[80vh]',
        'rounded-xl border bg-background shadow-2xl',
        'animate-in fade-in slide-in-from-bottom-4 duration-200',
        position === 'bottom-right' ? 'bottom-24 right-6' : 'bottom-24 left-6',
      )}
    >
      {/* ================================================================ */}
      {/* Header */}
      {/* ================================================================ */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">
              {dialogInfo?.name || t('chatWidget.title')}
            </h3>
            {statusLabel && (
              <p className="truncate text-xs text-muted-foreground">{statusLabel}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t('chatWidget.minimize')}
          >
            <Minimize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* Message list */}
      {/* ================================================================ */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Prologue message */}
        {dialogInfo?.prologue && messages.length === 0 && !isStreaming && (
          <div className="flex gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="rounded-lg bg-muted px-3 py-2 text-sm">
              {dialogInfo.prologue}
            </div>
          </div>
        )}

        {/* Conversation messages */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex gap-2',
              msg.role === 'user' ? 'flex-row-reverse' : 'flex-row',
            )}
          >
            <div
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-primary/10',
              )}
            >
              {msg.role === 'user' ? (
                <User className="h-3.5 w-3.5" />
              ) : (
                <Bot className="h-3.5 w-3.5 text-primary" />
              )}
            </div>
            <div
              className={cn(
                'max-w-[75%] rounded-lg px-3 py-2 text-sm',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted',
              )}
            >
              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
            </div>
          </div>
        ))}

        {/* Streaming partial answer */}
        {isStreaming && currentAnswer && (
          <div className="flex gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="max-w-[75%] rounded-lg bg-muted px-3 py-2 text-sm">
              <p className="whitespace-pre-wrap break-words">{currentAnswer}</p>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isStreaming && !currentAnswer && (
          <div className="flex gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="rounded-lg bg-muted px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ================================================================ */}
      {/* Input area */}
      {/* ================================================================ */}
      <div className="border-t px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chatWidget.messagePlaceholder')}
            rows={1}
            className={cn(
              'flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-1 focus:ring-primary',
              'max-h-24',
            )}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!input.trim() || isStreaming}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              'bg-primary text-primary-foreground',
              'transition-colors hover:bg-primary/90',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            aria-label={t('chatWidget.sendMessage')}
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
