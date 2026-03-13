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

  // Empty state — premium centered layout
  if (messages.length === 0 && !isStreaming) {
    return (
      <div className={cn('flex-1 flex flex-col items-center justify-center p-8', className)}>
        <div className="flex flex-col items-center gap-5 max-w-md text-center">
          {/* Icon with gradient background and subtle pulse */}
          <div className="relative">
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 dark:from-primary/15 dark:to-primary/5 flex items-center justify-center shadow-lg shadow-primary/5">
              <MessageSquare className="h-10 w-10 text-primary" />
            </div>
            {/* Animated sparkle accent */}
            <Sparkles className="absolute -top-1 -right-1 h-5 w-5 text-primary/60 animate-pulse" />
          </div>

          {/* Title and description */}
          <div className="space-y-1.5">
            <h3 className="text-xl font-semibold text-foreground tracking-tight">
              {t('chat.emptyTitle')}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t('chat.emptyDescription')}
            </p>
          </div>

          {/* Suggested prompts — card style with hover lift */}
          <div className="flex flex-col gap-2.5 w-full mt-2">
            {SUGGESTED_PROMPTS.map((key) => (
              <Button
                key={key}
                variant="outline"
                className="justify-start text-left h-auto py-3.5 px-4 text-sm whitespace-normal rounded-xl border-border/60 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 transition-all duration-200 group/prompt"
                onClick={() => onSuggestedPrompt?.(t(key))}
              >
                <Sparkles className="h-4 w-4 mr-2.5 shrink-0 text-primary/70 group-hover/prompt:text-primary transition-colors" />
                <span>{t(key)}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        'flex-1 overflow-y-auto',
        // Subtle fade at top edge to hint scrollable content
        '[mask-image:linear-gradient(to_bottom,transparent_0px,black_24px,black)]',
        className,
      )}
    >
      <div className="max-w-3xl mx-auto py-4 px-2">
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

        {/* Streaming indicator — glassmorphism bubble */}
        {isStreaming && (
          <div className="flex gap-3 px-4 py-3 chat-fade-in">
            {/* Bot avatar with pulsing ring */}
            <div className="h-8 w-8 rounded-full bg-muted/60 dark:bg-muted/40 backdrop-blur-sm flex items-center justify-center shrink-0 ring-2 ring-primary/20 animate-pulse">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>

            <div className="flex flex-col gap-1 max-w-[75%]">
              <div className="rounded-2xl rounded-bl-md bg-muted/60 dark:bg-muted/40 backdrop-blur-sm chat-bubble-glow border border-border/40 px-4 py-2.5 text-sm">
                {currentAnswer ? (
                  <MarkdownRenderer>{currentAnswer}</MarkdownRenderer>
                ) : (
                  // Typing dots with staggered animation
                  <div className="flex items-center gap-1.5 py-1">
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:0ms]" />
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:300ms]" />
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
