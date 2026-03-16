/**
 * @fileoverview Chat message list component rendering all messages in a conversation.
 * Uses the ChatMessage component for rich rendering with avatars, markdown, and actions.
 * @module features/chat/components/ChatMessageList
 */

import { useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import ChatMessage from './ChatMessage'
import type { ChatMessage as ChatMessageType, ChatReference, ChatChunk } from '../types/chat.types'

// ============================================================================
// Props
// ============================================================================

interface ChatMessageListProps {
  /** Array of messages to display */
  messages: ChatMessageType[]
  /** Whether streaming is in progress */
  isStreaming: boolean
  /** Partial answer being streamed */
  currentAnswer: string
  /** Callback when a citation is clicked */
  onCitationClick: (reference: ChatReference) => void
  /** Callback when a chunk citation is clicked */
  onChunkCitationClick: (chunk: ChatChunk) => void
  /** Callback when a suggested prompt is clicked */
  onSuggestedPrompt: (content: string) => void
  /** Callback for regenerating the last message */
  onRegenerate: () => void
  /** CSS class name */
  className?: string
  /** Active conversation ID for feedback */
  conversationId?: string | undefined
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Renders the message list for a chat conversation.
 * Uses the ChatMessage component for each message with full action support.
 * Auto-scrolls to the bottom when new messages arrive or streaming content updates.
 *
 * @param {ChatMessageListProps} props - Component properties
 * @returns {JSX.Element} The rendered message list
 */
function ChatMessageList({
  messages,
  isStreaming,
  currentAnswer,
  onCitationClick,
  onChunkCitationClick,
  onSuggestedPrompt: _onSuggestedPrompt,
  onRegenerate,
  className = '',
  conversationId,
}: ChatMessageListProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)

  // Track whether user is near the bottom of the scroll container
  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const threshold = 100
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }

  // Auto-scroll only when user is near the bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, currentAnswer])

  // Always scroll to bottom when conversation changes (messages reset)
  useEffect(() => {
    isNearBottomRef.current = true
    bottomRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [conversationId])

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`overflow-y-auto px-4 py-6 space-y-1 ${className}`}
    >
      {/* Empty state */}
      {messages.length === 0 && !isStreaming && (
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-muted-foreground">{t('chat.startConversation')}</p>
        </div>
      )}

      {/* Rendered messages */}
      {messages.map((msg, index) => {
        const isLastAssistant =
          !isStreaming &&
          msg.role === 'assistant' &&
          index === messages.length - 1

        return (
          <ChatMessage
            key={msg.id}
            message={msg}
            conversationId={conversationId}
            onCitationClick={onCitationClick}
            onChunkCitationClick={onChunkCitationClick}
            isLast={index === messages.length - 1}
            onRegenerate={isLastAssistant ? onRegenerate : undefined}
          />
        )
      })}

      {/* Streaming message */}
      {isStreaming && currentAnswer && (
        <ChatMessage
          message={{
            id: 'streaming',
            role: 'assistant',
            content: currentAnswer,
            timestamp: new Date().toISOString(),
          }}
          conversationId={conversationId}
          onCitationClick={onCitationClick}
          onChunkCitationClick={onChunkCitationClick}
          isLast
        />
      )}

      {/* Typing indicator: shown when streaming but no content yet */}
      {isStreaming && !currentAnswer && (
        <div className="flex gap-3 px-4 py-3">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
            <div className="h-4 w-4 text-muted-foreground">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <circle cx="4" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="20" cy="12" r="2" />
              </svg>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl rounded-bl-md bg-muted/60 dark:bg-muted/40">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
            <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
            <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
      )}

      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </div>
  )
}

export default ChatMessageList
