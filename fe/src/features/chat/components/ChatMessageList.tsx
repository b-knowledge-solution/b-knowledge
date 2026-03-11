/**
 * @fileoverview Chat message list component.
 * Displays messages, streaming indicator, and empty state with suggested prompts.
 * @module features/ai/components/ChatMessageList
 */

import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquare, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { cn } from '@/lib/utils'
import ChatMessage from './ChatMessage'
import type { ChatMessage as ChatMessageType, ChatReference, ChatChunk } from '../types/chat.types'

// ============================================================================
// Props
// ============================================================================

interface ChatMessageListProps {
  /** Array of messages to display */
  messages: ChatMessageType[]
  /** Whether a streaming response is in progress */
  isStreaming?: boolean
  /** The partial answer being streamed */
  currentAnswer?: string
  /** Callback when a citation badge is clicked */
  onCitationClick?: (reference: ChatReference) => void
  /** Callback when a specific chunk citation is clicked for document preview */
  onChunkCitationClick?: (chunk: ChatChunk) => void
  /** Callback when a suggested prompt is clicked */
  onSuggestedPrompt?: (prompt: string) => void
  /** Optional CSS class name */
  className?: string
}

// ============================================================================
// Suggested Prompts
// ============================================================================

const SUGGESTED_PROMPTS = [
  'chat.suggestedPrompt1',
  'chat.suggestedPrompt2',
  'chat.suggestedPrompt3',
]

// ============================================================================
// Component
// ============================================================================

/**
 * @description Renders the scrollable message list with auto-scroll,
 * streaming indicator, and empty state with suggested prompts.
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
  onSuggestedPrompt,
  className,
}: ChatMessageListProps) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)

  /**
   * Auto-scroll to bottom when new messages arrive or during streaming.
   */
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, currentAnswer])

  // Empty state
  if (messages.length === 0 && !isStreaming) {
    return (
      <div className={cn('flex-1 flex flex-col items-center justify-center p-8', className)}>
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          {/* Icon */}
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <MessageSquare className="h-8 w-8 text-primary" />
          </div>

          {/* Title and description */}
          <h3 className="text-lg font-semibold text-foreground">
            {t('chat.emptyTitle')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('chat.emptyDescription')}
          </p>

          {/* Suggested prompts */}
          <div className="flex flex-col gap-2 w-full mt-4">
            {SUGGESTED_PROMPTS.map((key) => (
              <Button
                key={key}
                variant="outline"
                className="justify-start text-left h-auto py-3 px-4 text-sm whitespace-normal"
                onClick={() => onSuggestedPrompt?.(t(key))}
              >
                <Sparkles className="h-4 w-4 mr-2 shrink-0 text-primary" />
                <span>{t(key)}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className={cn('flex-1 overflow-y-auto', className)}>
      <div className="max-w-4xl mx-auto py-4">
        {/* Render each message */}
        {messages.map((msg, idx) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onCitationClick={onCitationClick}
            onChunkCitationClick={onChunkCitationClick}
            isLast={idx === messages.length - 1 && !isStreaming}
          />
        ))}

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex gap-3 px-4 py-3">
            {/* Bot avatar placeholder */}
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-primary animate-pulse" />
            </div>

            <div className="flex flex-col gap-1 max-w-[75%]">
              <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-2.5 text-sm">
                {currentAnswer ? (
                  <MarkdownRenderer>{currentAnswer}</MarkdownRenderer>
                ) : (
                  // Typing dots animation
                  <div className="flex items-center gap-1 py-1">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ChatMessageList
