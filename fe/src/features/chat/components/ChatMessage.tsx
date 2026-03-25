/**
 * @fileoverview Single chat message component.
 * Renders user or assistant messages with avatars, markdown, timestamps, and actions.
 * @module features/chat/components/ChatMessage
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Check, ThumbsUp, ThumbsDown, Bot, User, Volume2, Square, FileText, RefreshCw } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ChatMessage as ChatMessageType, ChatReference, ChatChunk, DocAggregate } from '../types/chat.types'
import { chatApi } from '../api/chatApi'
import { useTts } from '../hooks/useTts'
import { useAuth } from '@/features/auth'
import CitationInline from '@/components/CitationInline'
import { ReferenceImageList } from './ReferenceImageList'

// ============================================================================
// Props
// ============================================================================

interface ChatMessageProps {
  /** The message data to render */
  message: ChatMessageType
  /** Callback when a citation badge is clicked */
  onCitationClick?: ((reference: ChatReference) => void) | undefined
  /** Callback when a specific chunk citation is clicked for document preview */
  onChunkCitationClick?: ((chunk: ChatChunk) => void) | undefined
  /** Callback when a document name badge is clicked to open document viewer */
  onDocBadgeClick?: ((doc: DocAggregate) => void) | undefined
  /** Whether this is the last message (for animation) */
  isLast?: boolean | undefined
  /** Callback to regenerate this assistant message (only shown on last assistant message) */
  onRegenerate?: (() => void) | undefined
  /** Conversation ID for sending feedback */
  conversationId?: string | undefined
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Renders a single chat message with avatar, content, and action buttons.
 * User messages appear right-aligned with a colored bubble.
 * Assistant messages appear left-aligned with markdown rendering.
 *
 * @param {ChatMessageProps} props - Component properties
 * @returns {JSX.Element} The rendered chat message
 */
function ChatMessage({ message, onCitationClick: _onCitationClick, onChunkCitationClick, onDocBadgeClick, isLast, onRegenerate, conversationId }: ChatMessageProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { speak, stop, isPlaying, isLoading } = useTts()
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(
    message.feedback?.thumbup === true ? 'up' : message.feedback?.thumbup === false ? 'down' : null,
  )

  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'

  // Determine bubble and avatar styling based on role — premium treatment
  const bubbleClass = isUser
    ? 'bg-gradient-to-br from-primary to-primary/85 text-primary-foreground rounded-2xl rounded-br-md shadow-md'
    : 'bg-muted/60 dark:bg-muted/40 backdrop-blur-sm rounded-2xl rounded-bl-md chat-bubble-glow border border-border/40'

  const avatarClass = isUser
    ? 'bg-primary/20 text-primary ring-2 ring-primary/20'
    : 'bg-muted text-muted-foreground ring-2 ring-muted-foreground/10'

  /**
   * @description Copy message content to clipboard with temporary success feedback.
   */
  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  /**
   * @description Handle feedback button click, toggle state, and send to backend.
   * @param type - Feedback type ('up' or 'down')
   */
  const handleFeedback = async (type: 'up' | 'down') => {
    const newValue = feedback === type ? null : type
    setFeedback(newValue)

    if (conversationId && message.id && !message.id.startsWith('assistant-') && !message.id.startsWith('error-')) {
      try {
        if (newValue) {
          await chatApi.sendFeedback(conversationId, message.id, newValue === 'up')
        }
      } catch {
        // Best-effort
      }
    }
  }

  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-3 group chat-fade-in',
        isUser ? 'flex-row-reverse' : 'flex-row',
        isLast && 'animate-in fade-in slide-in-from-bottom-2 duration-300',
      )}
    >
      {/* Avatar */}
      <Avatar
        className={cn(
          'h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-transform hover:scale-105',
          avatarClass,
        )}
      >
        {isUser && user?.avatar && (
          <AvatarImage src={user.avatar} alt={user.displayName || 'User'} className="object-cover" />
        )}
        <AvatarFallback
          className={cn(
            isUser
              ? 'bg-primary text-primary-foreground text-xs font-medium'
              : 'bg-muted text-muted-foreground ring-2 ring-muted-foreground/10',
          )}
        >
          {isUser ? (
            user?.displayName
              ? user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
              : <User className="h-4 w-4" />
          ) : (
            <Bot className="h-4 w-4" />
          )}
        </AvatarFallback>
      </Avatar>

      {/* Message body */}
      <div className={cn('flex flex-col gap-1 max-w-[75%]', isUser ? 'items-end' : 'items-start')}>
        {/* Message bubble */}
        <div className={cn('rounded-2xl px-4 py-2.5 text-sm', bubbleClass)}>
          {isUser ? (
            // User messages render as plain text
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            // Assistant messages render as markdown with inline citation popovers
            <CitationInline
              content={message.content}
              reference={message.reference}
              onCitationClick={onChunkCitationClick}
            />
          )}
        </div>

        {/* Image references — responsive grid of cited chunk images */}
        {isAssistant && message.reference?.chunks && (
          <ReferenceImageList
            chunks={message.reference.chunks}
            messageContent={message.content}
          />
        )}

        {/* Citation badges — refined with border accent */}
        {isAssistant && message.reference && message.reference.doc_aggs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {message.reference.doc_aggs.map((doc) => (
              <button
                key={doc.doc_id}
                onClick={() => onDocBadgeClick?.(doc)}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/8 dark:bg-primary/12 text-primary border border-primary/15 hover:bg-primary/15 hover:border-primary/25 transition-all duration-200 shadow-sm"
              >
                <FileText className="h-3 w-3" />
                {doc.doc_name} ({doc.count})
              </button>
            ))}
          </div>
        )}

        {/* Action bar */}
        <div
          className={cn(
            'flex items-center gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-100',
            isUser ? 'flex-row-reverse' : 'flex-row',
          )}
        >
          {/* Timestamp */}
          <span className="text-[10px] text-muted-foreground px-1">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>

          {/* Copy button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleCopy}
            title={t('common.copy')}
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>

          {/* TTS button (assistant only) */}
          {!isUser && (
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-6 w-6', isPlaying && 'text-primary')}
              onClick={() => isPlaying ? stop() : speak(message.content)}
              disabled={isLoading}
              title={isPlaying ? t('chat.ttsStop') : t('chat.ttsPlay')}
            >
              {isPlaying ? (
                <Square className="h-3 w-3" />
              ) : (
                <Volume2 className={cn('h-3 w-3', isLoading && 'animate-pulse')} />
              )}
            </Button>
          )}

          {/* Feedback buttons (assistant only) */}
          {!isUser && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-6 w-6', feedback === 'up' && 'text-green-500')}
                onClick={() => handleFeedback('up')}
                title={t('chat.thumbsUp')}
              >
                <ThumbsUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-6 w-6', feedback === 'down' && 'text-red-500')}
                onClick={() => handleFeedback('down')}
                title={t('chat.thumbsDown')}
              >
                <ThumbsDown className="h-3 w-3" />
              </Button>
            </>
          )}

          {/* Regenerate button (last assistant message only) */}
          {onRegenerate && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:text-primary"
              onClick={onRegenerate}
              title={t('chat.regenerate')}
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatMessage
