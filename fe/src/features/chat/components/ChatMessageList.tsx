/**
 * @fileoverview Chat message list component rendering all messages in a conversation.
 * Uses the ChatMessage component for rich rendering with avatars, markdown, and actions.
 * @module features/chat/components/ChatMessageList
 */

import { useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Search, BarChart3, Sparkles, Globe, BookOpen, Loader2 } from 'lucide-react'
import ChatMessage from './ChatMessage'
import type { ChatMessage as ChatMessageType, ChatReference, ChatChunk, DocAggregate } from '../types/chat.types'
import { MessageRole } from '@/constants'

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
  /** Current pipeline status for loading indicator */
  pipelineStatus?: string | null | undefined
  /** Callback when a citation is clicked */
  onCitationClick: (reference: ChatReference) => void
  /** Callback when a chunk citation is clicked */
  onChunkCitationClick: (chunk: ChatChunk) => void
  /** Callback when a document name badge is clicked */
  onDocBadgeClick: (doc: DocAggregate) => void
  /** Callback when a suggested prompt is clicked */
  onSuggestedPrompt: (content: string) => void
  /** Callback for regenerating the last message */
  onRegenerate: () => void
  /** Callback for editing a user message and re-generating from that point */
  onEditMessage?: ((messageIndex: number, newContent: string) => void) | undefined
  /** CSS class name */
  className?: string
  /** Active conversation ID for feedback */
  conversationId?: string | undefined
  /** Welcome message from assistant config (prologue), shown when no messages yet */
  welcomeMessage?: string | undefined
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
  onDocBadgeClick,
  onSuggestedPrompt: _onSuggestedPrompt,
  onRegenerate,
  onEditMessage,
  className = '',
  conversationId,
  welcomeMessage,
  pipelineStatus,
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
      {/* Welcome message: shown if no messages, or if local stream hasn't synced the DB prologue yet */}
      {welcomeMessage && (messages.length === 0 || messages[0]?.role !== 'assistant') && (
        <ChatMessage
          message={{
            id: 'welcome',
            role: 'assistant',
            content: welcomeMessage,
            timestamp: new Date().toISOString(),
          }}
          conversationId={conversationId}
          onCitationClick={() => {}}
          onChunkCitationClick={() => {}}
          onDocBadgeClick={() => {}}
          isLast={false}
        />
      )}

      {/* Empty state fallback: shown when no welcome message and no messages */}
      {!welcomeMessage && messages.length === 0 && !isStreaming && (
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
            onDocBadgeClick={onDocBadgeClick}
            isLast={index === messages.length - 1}
            onRegenerate={isLastAssistant ? onRegenerate : undefined}
            onEditMessage={
              msg.role === 'user' && !isStreaming && onEditMessage
                ? (newContent: string) => onEditMessage(index, newContent)
                : undefined
            }
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
          onDocBadgeClick={onDocBadgeClick}
          isLast
          isStreaming
        />
      )}

      {/* Pipeline status indicator: shown when streaming but no content yet */}
      {isStreaming && !currentAnswer && (
        <div className="flex gap-3 px-4 py-3 chat-fade-in">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
            <Bot className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl rounded-bl-md bg-muted/60 dark:bg-muted/40 border border-border/40">
            {/* Pipeline stage icon + label */}
            {(() => {
              const statusConfig: Record<string, { icon: typeof Search; label: string }> = {
                refining_question: { icon: Sparkles, label: t('chat.status.refiningQuestion', 'Refining question...') },
                embedding: { icon: Loader2, label: t('chat.status.embedding', 'Embedding query...') },
                retrieving: { icon: Search, label: t('chat.status.retrieving', 'Searching knowledge base...') },
                searching_web: { icon: Globe, label: t('chat.status.searchingWeb', 'Searching the web...') },
                searching_knowledge_graph: { icon: BookOpen, label: t('chat.status.searchingKg', 'Searching knowledge graph...') },
                reranking: { icon: BarChart3, label: t('chat.status.reranking', 'Reranking results...') },
                generating: { icon: Sparkles, label: t('chat.status.generating', 'Generating answer...') },
              }
              const config = statusConfig[pipelineStatus || ''] || { icon: Loader2, label: t('chat.status.thinking', 'Thinking...') }
              const StatusIcon = config.icon
              return (
                <>
                  <StatusIcon className="h-3.5 w-3.5 text-primary animate-pulse" />
                  <span className="text-xs text-muted-foreground">{config.label}</span>
                </>
              )
            })()}
            {/* Bouncing dots */}
            <div className="flex items-center gap-1 ml-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        </div>
      )}

      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </div>
  )
}

export default ChatMessageList
