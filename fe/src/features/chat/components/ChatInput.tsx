/**
 * @fileoverview Chat message input component with auto-resize textarea.
 * Includes toggle buttons for deep thinking/reasoning mode and internet search.
 * @module features/chat/components/ChatInput
 */

import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Square, Brain, Globe, Paperclip } from 'lucide-react'

// ============================================================================
// Props
// ============================================================================

interface ChatInputProps {
  /** Callback when a message is sent, with optional toggle states */
  onSend: (content: string, options?: { reasoning?: boolean; useInternet?: boolean; file_ids?: string[] }) => void
  /** Callback to stop streaming */
  onStop?: () => void
  /** Whether a streaming response is in progress */
  isStreaming?: boolean
  /** Whether the input is disabled */
  disabled?: boolean
  /** Show the deep thinking / reasoning toggle button */
  showReasoningToggle?: boolean
  /** Show the internet search toggle button */
  showInternetToggle?: boolean
  /** Callback when files are selected for upload */
  onFilesSelected?: (files: FileList) => void
  /** Whether file upload is enabled */
  showFileUpload?: boolean
  /** Currently attached file IDs to send with the message */
  fileIds?: string[]
  /** Optional CSS class name */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Chat input with multiline textarea, send button, stop generation button,
 * and optional toggle buttons for deep thinking and internet search modes.
 * Supports Enter to send, Shift+Enter for newline, and auto-resize.
 *
 * @param {ChatInputProps} props - Component properties
 * @returns {JSX.Element} The rendered chat input
 */
function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  showReasoningToggle,
  showInternetToggle,
  onFilesSelected,
  showFileUpload,
  fileIds,
  className = '',
}: ChatInputProps) {
  const { t } = useTranslation()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Toggle states for reasoning and internet search
  const [reasoningEnabled, setReasoningEnabled] = useState(false)
  const [internetEnabled, setInternetEnabled] = useState(false)

  /**
   * Auto-resize the textarea based on content.
   */
  const autoResize = () => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
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

    // Build options from toggle states
    const options: { reasoning?: boolean; useInternet?: boolean; file_ids?: string[] } = {}
    if (reasoningEnabled) options.reasoning = true
    if (internetEnabled) options.useInternet = true
    if (fileIds && fileIds.length > 0) options.file_ids = fileIds

    onSend(content, Object.keys(options).length > 0 ? options : undefined)
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

  /**
   * Handle file input change event.
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (fileList && fileList.length > 0 && onFilesSelected) {
      onFilesSelected(fileList)
    }
    // Reset file input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Whether any toggle buttons should be shown
  const hasToggles = showReasoningToggle || showInternetToggle

  return (
    <div className={`px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ${className}`}>
      {/* Hidden file input */}
      {showFileUpload && (
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
          multiple
          onChange={handleFileChange}
        />
      )}

      <div className="max-w-3xl mx-auto space-y-2">
        {/* Toggle buttons row - shown above the textarea when toggles are available */}
        {hasToggles && (
          <div className="flex items-center gap-1.5 px-1">
            {/* File upload button */}
            {showFileUpload && (
              <button
                type="button"
                className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
                onClick={() => fileInputRef.current?.click()}
                title={t('chat.attachFile')}
                disabled={disabled}
              >
                <Paperclip className="h-4 w-4" />
              </button>
            )}

            {/* Deep thinking / reasoning toggle */}
            {showReasoningToggle && (
              <button
                type="button"
                className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all ${
                  reasoningEnabled
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
                onClick={() => setReasoningEnabled((v) => !v)}
                title={t('chat.deepThinking')}
              >
                <Brain className="h-4 w-4" />
              </button>
            )}

            {/* Internet search toggle */}
            {showInternetToggle && (
              <button
                type="button"
                className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all ${
                  internetEnabled
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
                onClick={() => setInternetEnabled((v) => !v)}
                title={t('chat.internetSearch')}
              >
                <Globe className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end gap-2.5">
          {/* Textarea */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              className="w-full resize-none rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-3 pr-12 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px] max-h-[200px] transition-all duration-200"
              placeholder={t('chat.inputPlaceholder')}
              rows={1}
              disabled={disabled}
              onInput={autoResize}
              onKeyDown={handleKeyDown}
              aria-label={t('chat.inputPlaceholder')}
            />
            {/* Keyboard shortcut hint */}
            <span className="absolute bottom-1.5 right-3 text-[10px] text-slate-300 dark:text-slate-600 pointer-events-none select-none">
              {t('chat.enterToSend')}
            </span>
          </div>

          {/* Send or Stop button */}
          {isStreaming ? (
            <button
              className="h-11 w-11 rounded-xl shrink-0 flex items-center justify-center bg-red-500 text-white shadow-md hover:bg-red-600 animate-pulse transition-colors"
              onClick={onStop}
              title={t('chat.stopGenerating')}
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              className="h-11 w-11 rounded-xl shrink-0 flex items-center justify-center bg-blue-600 text-white shadow-md hover:bg-blue-700 hover:shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              onClick={handleSubmit}
              disabled={disabled}
              title={t('chat.sendMessage')}
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatInput
