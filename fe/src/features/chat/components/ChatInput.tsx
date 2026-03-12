/**
 * @fileoverview Chat message input component with auto-resize textarea.
 * @module features/ai/components/ChatInput
 */

import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ============================================================================
// Props
// ============================================================================

interface ChatInputProps {
  /** Callback when a message is sent */
  onSend: (content: string) => void
  /** Callback to stop streaming */
  onStop?: () => void
  /** Whether a streaming response is in progress */
  isStreaming?: boolean
  /** Whether the input is disabled */
  disabled?: boolean
  /** Optional CSS class name */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Chat input with multiline textarea, send button, and stop generation button.
 * Supports Enter to send, Shift+Enter for newline, and auto-resize.
 *
 * @param {ChatInputProps} props - Component properties
 * @returns {JSX.Element} The rendered chat input
 */
function ChatInput({ onSend, onStop, isStreaming, disabled, className }: ChatInputProps) {
  const { t } = useTranslation()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  /**
   * Auto-resize the textarea based on content.
   */
  const autoResize = () => {
    const textarea = textareaRef.current
    if (!textarea) return
    // Reset height to auto to correctly calculate scrollHeight
    textarea.style.height = 'auto'
    // Clamp between min and max height
    const newHeight = Math.min(textarea.scrollHeight, 200)
    textarea.style.height = `${newHeight}px`
  }

  /**
   * Handle form submission.
   */
  const handleSubmit = () => {
    const textarea = textareaRef.current
    if (!textarea) return

    const content = textarea.value.trim()
    if (!content || isStreaming || disabled) return

    // Send message and clear input
    onSend(content)
    textarea.value = ''
    textarea.style.height = 'auto'
    textarea.focus()
  }

  /**
   * Handle keyboard events: Enter to send, Shift+Enter for newline.
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className={cn('border-t bg-background px-4 py-3', className)}>
      <div className="flex items-end gap-2 max-w-4xl mx-auto">
        {/* Textarea */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 pr-12 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px] max-h-[200px]"
            placeholder={t('chat.inputPlaceholder')}
            rows={1}
            disabled={disabled}
            onInput={autoResize}
            onKeyDown={handleKeyDown}
            aria-label={t('chat.inputPlaceholder')}
          />
          {/* Keyboard shortcut hint */}
          <span className="absolute bottom-1.5 right-3 text-[10px] text-muted-foreground/50 pointer-events-none">
            {t('chat.enterToSend')}
          </span>
        </div>

        {/* Send or Stop button */}
        {isStreaming ? (
          <Button
            variant="destructive"
            size="icon"
            className="h-11 w-11 rounded-xl shrink-0"
            onClick={onStop}
            title={t('chat.stopGenerating')}
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="default"
            size="icon"
            className="h-11 w-11 rounded-xl shrink-0"
            onClick={handleSubmit}
            disabled={disabled}
            title={t('chat.sendMessage')}
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

export default ChatInput
