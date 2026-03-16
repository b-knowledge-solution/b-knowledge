/**
 * @fileoverview Chat message list component rendering all messages in a conversation.
 * @module features/chat/components/ChatMessageList
 */

import { useTranslation } from 'react-i18next'
import type { ChatMessage, ChatReference, ChatChunk } from '../types/chat.types'

// ============================================================================
// Props
// ============================================================================

interface ChatMessageListProps {
  /** Array of messages to display */
  messages: ChatMessage[]
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
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Renders the message list for a chat conversation.
 *
 * @param {ChatMessageListProps} props - Component properties
 * @returns {JSX.Element} The rendered message list
 */
function ChatMessageList({
  messages,
  isStreaming,
  currentAnswer,
  onCitationClick: _onCitationClick,
  onChunkCitationClick: _onChunkCitationClick,
  onSuggestedPrompt: _onSuggestedPrompt,
  onRegenerate: _onRegenerate,
  className = '',
}: ChatMessageListProps) {
  const { t } = useTranslation()

  return (
    <div className={`overflow-y-auto px-4 py-6 space-y-4 ${className}`}>
      {messages.length === 0 && !isStreaming && (
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('chat.startConversation')}</p>
        </div>
      )}
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`max-w-3xl mx-auto ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
        >
          <div
            className={`inline-block px-4 py-2.5 rounded-xl text-sm ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
            }`}
          >
            {msg.content}
          </div>
        </div>
      ))}
      {/* Streaming indicator */}
      {isStreaming && currentAnswer && (
        <div className="max-w-3xl mx-auto text-left">
          <div className="inline-block px-4 py-2.5 rounded-xl text-sm bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100">
            {currentAnswer}
            <span className="animate-pulse ml-1">|</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChatMessageList
