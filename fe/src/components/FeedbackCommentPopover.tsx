/**
 * @fileoverview Shared feedback comment popover component.
 * Provides thumb up/down buttons with a comment popover on thumb-down.
 * Used by chat messages, search results, and agent run history.
 *
 * @module components/FeedbackCommentPopover
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

/** @description Props for the FeedbackCommentPopover component */
export interface FeedbackCommentPopoverProps {
  /** Current feedback state */
  feedback: 'up' | 'down' | null
  /** Called when user submits feedback. thumbup=true for up, false for down. comment is optional text. */
  onFeedback: (thumbup: boolean, comment?: string) => void
  /** Button size - sm for inline, md for standalone */
  size?: 'sm' | 'md'
  /** Whether buttons should be disabled (e.g. during streaming) */
  disabled?: boolean | undefined
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum character length for feedback comments */
const MAX_COMMENT_LENGTH = 500

// ============================================================================
// Component
// ============================================================================

/**
 * @description Renders thumb up/down feedback buttons with a comment popover on thumb-down.
 * Thumb up is one-click with no popover. Thumb down opens a popover with a textarea
 * for optional comment, "Send feedback" and "Skip for now" buttons.
 *
 * @param {FeedbackCommentPopoverProps} props - Component configuration
 * @returns {JSX.Element} Rendered feedback buttons with optional popover
 */
export function FeedbackCommentPopover({
  feedback,
  onFeedback,
  size: _size = 'sm',
  disabled = false,
}: FeedbackCommentPopoverProps) {
  const { t } = useTranslation()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [comment, setComment] = useState('')

  /**
   * @description Handle thumb-up click. One-click action with no popover.
   * Feedback is final — re-clicking a submitted vote is a no-op.
   */
  const handleThumbUp = () => {
    if (disabled) return

    // Feedback is final once submitted — second click is a no-op
    if (feedback === 'up') return

    onFeedback(true)
  }

  /**
   * @description Handle thumb-down click. Opens popover for optional comment.
   * Feedback is final — re-clicking a submitted vote is a no-op.
   */
  const handleThumbDown = () => {
    if (disabled) return

    // Feedback is final once submitted — second click is a no-op
    if (feedback === 'down') return

    // Open popover for comment
    setPopoverOpen(true)
  }

  /**
   * @description Submit feedback with comment text, close popover and reset state.
   */
  const handleSendFeedback = () => {
    onFeedback(false, comment.trim())
    setPopoverOpen(false)
    setComment('')
  }

  /**
   * @description Skip comment and submit thumb-down without comment, close popover.
   */
  const handleSkip = () => {
    onFeedback(false)
    setPopoverOpen(false)
    setComment('')
  }

  /**
   * @description Handle popover open state change. Reverts thumb state when closing
   * without submitting (clicking outside).
   * @param {boolean} open - New open state
   */
  const handlePopoverOpenChange = (open: boolean) => {
    setPopoverOpen(open)
    if (!open) {
      // Closing without submitting — reset comment
      setComment('')
    }
  }

  return (
    <div className="flex items-center gap-0.5">
      {/* Thumb up button — one-click, no popover */}
      <Button
        variant="ghost"
        size="icon"
        className={cn('h-6 w-6', feedback === 'up' && 'text-green-500')}
        onClick={handleThumbUp}
        disabled={disabled}
        aria-label={t('chat.thumbsUp', 'Helpful')}
      >
        <ThumbsUp className="h-3 w-3" />
      </Button>

      {/* Thumb down button — opens comment popover */}
      <Popover open={popoverOpen} onOpenChange={handlePopoverOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-6 w-6', feedback === 'down' && 'text-red-500')}
            onClick={handleThumbDown}
            disabled={disabled}
            aria-label={t('chat.thumbsDown', 'Not helpful')}
          >
            <ThumbsDown className="h-3 w-3" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          side="bottom"
          align="end"
          className="w-[280px] p-4"
        >
          {/* Popover heading */}
          <p className="text-xs text-muted-foreground mb-2">
            {t('feedback.whatWasWrong', 'What was wrong?')}
          </p>

          {/* Comment textarea */}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT_LENGTH))}
            placeholder={t('feedback.commentPlaceholder', 'Tell us what could be better...')}
            rows={3}
            maxLength={MAX_COMMENT_LENGTH}
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label={t('feedback.whatWasWrong', 'What was wrong?')}
          />

          {/* Character count indicator */}
          <div className="text-[10px] text-muted-foreground text-right mt-1">
            {comment.length}/{MAX_COMMENT_LENGTH}
          </div>

          {/* Button row */}
          <div className="flex items-center justify-end gap-2 mt-2">
            {/* Skip for now — sends thumb-down without comment */}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={handleSkip}
            >
              {t('feedback.skipForNow', 'Skip for now')}
            </Button>

            {/* Send feedback — disabled when textarea is empty */}
            <Button
              variant="default"
              size="sm"
              className="text-sm h-7"
              disabled={comment.trim().length === 0}
              onClick={handleSendFeedback}
            >
              {t('feedback.sendFeedback', 'Send feedback')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
