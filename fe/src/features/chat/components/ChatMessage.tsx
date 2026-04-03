/**
 * @fileoverview Single chat message component.
 * Renders user or assistant messages with avatars, markdown, timestamps, and actions.
 * @module features/chat/components/ChatMessage
 */

import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Check, Bot, User, Volume2, Square, FileText, RefreshCw, Pencil, X, Send } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FeedbackCommentPopover } from '@/components/FeedbackCommentPopover'
import type { ChatMessage as ChatMessageType, ChatReference, ChatChunk, DocAggregate } from '../types/chat.types'
import { chatApi } from '../api/chatApi'
import { useTts } from '../hooks/useTts'
import { useAuth } from '@/features/auth'
import CitationInline from '@/components/CitationInline'
import { ReferenceImageList } from './ReferenceImageList'
import { MessageRole } from '@/constants'

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
  /** Whether the assistant is currently streaming this message */
  isStreaming?: boolean | undefined
  /** Callback to regenerate this assistant message (only shown on last assistant message) */
  onRegenerate?: (() => void) | undefined
  /** Conversation ID for sending feedback */
  conversationId?: string | undefined
  /** Callback to edit a user message and re-generate (triggers truncation + re-send) */
  onEditMessage?: ((newContent: string) => void) | undefined
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
function ChatMessage({ message, onCitationClick: _onCitationClick, onChunkCitationClick, onDocBadgeClick, isLast, isStreaming, onRegenerate, conversationId, onEditMessage }: ChatMessageProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { speak, stop, isPlaying, isLoading } = useTts()
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(
    message.feedback?.thumbup === true ? 'up' : message.feedback?.thumbup === false ? 'down' : null,
  )

  // Edit mode state for user messages
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)

  const isUser = message.role === MessageRole.USER
  const isAssistant = message.role === MessageRole.ASSISTANT

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
   * @description Handle feedback submission from FeedbackCommentPopover.
   * Sends thumb up/down with optional comment to the backend.
   * @param {boolean} thumbup - True for positive, false for negative
   * @param {string} [comment] - Optional feedback comment text
   */
  const handleFeedback = async (thumbup: boolean, comment?: string) => {
    const newValue = thumbup ? 'up' : 'down'
    setFeedback(newValue)

    // Only send feedback for real messages (not temporary or error placeholders)
    if (conversationId && message.id && !message.id.startsWith('assistant-') && !message.id.startsWith('error-')) {
      try {
        await chatApi.sendFeedback(conversationId, message.id, thumbup, comment)
      } catch {
        // Best-effort — don't block the UI on feedback failure
      }
    }
  }

  /**
   * @description Enter edit mode for a user message. Pre-fills textarea and focuses.
   */
  const handleStartEdit = () => {
    setEditContent(message.content)
    setIsEditing(true)
    // Auto-focus textarea after React renders it
    setTimeout(() => editTextareaRef.current?.focus(), 50)
  }

  /**
   * @description Save edited message: call parent callback and exit edit mode.
   */
  const handleSaveEdit = () => {
    const trimmed = editContent.trim()
    if (!trimmed || trimmed === message.content) {
      setIsEditing(false)
      return
    }
    onEditMessage?.(trimmed)
    setIsEditing(false)
  }

  /**
   * @description Handle keyboard shortcuts in edit textarea.
   * Enter to save, Shift+Enter for newline, Escape to cancel.
   */
  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSaveEdit()
    }
    if (e.key === 'Escape') {
      setIsEditing(false)
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
            // User messages: show edit UI or plain text
            isEditing ? (
              <div className="space-y-2 min-w-[200px]">
                {/* Edit textarea */}
                <textarea
                  ref={editTextareaRef}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  className="w-full resize-none rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-primary-foreground placeholder:text-primary-foreground/50 focus:outline-none focus:ring-2 focus:ring-white/30 min-h-[60px] max-h-[200px]"
                  rows={2}
                />
                {/* Save / Cancel buttons */}
                <div className="flex items-center gap-1.5 justify-end">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10 transition-colors"
                  >
                    <X className="h-3 w-3" />
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-white/20 text-primary-foreground hover:bg-white/30 transition-colors"
                  >
                    <Send className="h-3 w-3" />
                    {t('chat.saveEdit', 'Save & Send')}
                  </button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            )
          ) : (
            // Assistant messages render as markdown with inline citation popovers
            <>
              <CitationInline
                content={message.content}
                reference={message.reference}
                onCitationClick={onChunkCitationClick}
              />
              {/* Streaming cursor — blinking ▌ while response is being generated */}
              {isStreaming && (
                <span className="inline-block ml-0.5 text-primary animate-[cursor-blink_0.7s_ease-in-out_infinite]">▌</span>
              )}
            </>
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

          {/* Edit button (user messages only, not while streaming) */}
          {isUser && onEditMessage && !isEditing && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleStartEdit}
              title={t('chat.editMessage', 'Edit message')}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}

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

          {/* Feedback buttons (assistant only) — shared popover component */}
          {!isUser && (
            <FeedbackCommentPopover
              feedback={feedback}
              onFeedback={handleFeedback}
              disabled={isStreaming}
            />
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
