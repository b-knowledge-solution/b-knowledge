/**
 * @fileoverview Single chat message component.
 * Renders user or assistant messages with avatars, markdown, timestamps, and actions.
 * @module features/ai/components/ChatMessage
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Check, ThumbsUp, ThumbsDown, Bot, User, Volume2, Square } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ChatMessage as ChatMessageType, ChatReference, ChatChunk } from '../types/chat.types'
import { useTts } from '../hooks/useTts'
import CitationInline from './CitationInline'

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
  /** Whether this is the last message (for animation) */
  isLast?: boolean | undefined
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
function ChatMessage({ message, onCitationClick, onChunkCitationClick, isLast }: ChatMessageProps) {
  const { t } = useTranslation()
  const { speak, stop, isPlaying, isLoading } = useTts()
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(
    message.feedback?.thumbup === true ? 'up' : message.feedback?.thumbup === false ? 'down' : null,
  )

  const isUser = message.role === 'user'

  /**
   * Copy message content to clipboard.
   */
  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  /**
   * Handle feedback button click.
   * @param type - Feedback type
   */
  const handleFeedback = (type: 'up' | 'down') => {
    setFeedback(feedback === type ? null : type)
  }

  // Count total citation chunks
  const citationCount = message.reference?.chunks?.length || 0

  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-3 group transition-opacity duration-300',
        isUser ? 'flex-row-reverse' : 'flex-row',
        isLast && 'animate-in fade-in slide-in-from-bottom-2 duration-300',
      )}
    >
      {/* Avatar */}
      <Avatar className={cn('h-8 w-8 shrink-0', isUser ? 'bg-primary' : 'bg-muted')}>
        <AvatarFallback
          className={cn(
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      {/* Message body */}
      <div className={cn('flex flex-col gap-1 max-w-[75%]', isUser ? 'items-end' : 'items-start')}>
        {/* Message bubble */}
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm',
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-md'
              : 'bg-muted text-foreground rounded-bl-md',
          )}
        >
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

        {/* Citation badges (assistant only) */}
        {!isUser && citationCount > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {message.reference?.doc_aggs?.map((doc, idx) => (
              <Badge
                key={doc.doc_id}
                variant="info"
                className="cursor-pointer text-xs hover:opacity-80 transition-opacity"
                onClick={() => message.reference && onCitationClick?.(message.reference)}
              >
                [{idx + 1}] {doc.doc_name} ({doc.count})
              </Badge>
            ))}
          </div>
        )}

        {/* Action bar */}
        <div
          className={cn(
            'flex items-center gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity',
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
        </div>
      </div>
    </div>
  )
}

export default ChatMessage
