/**
 * @fileoverview Large search bar component with search icon and clear button.
 * @module features/ai/components/SearchBar
 */

import { useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X, Square } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================================
// Props
// ============================================================================

interface SearchBarProps {
  /** Callback when a search is submitted */
  onSearch: (query: string) => void
  /** Whether a search is in progress */
  isSearching?: boolean
  /** Default value for the input */
  defaultValue?: string
  /** Optional CSS class name */
  className?: string
  /** Callback to stop streaming */
  onStop?: (() => void) | undefined
  /** Whether streaming is in progress */
  isStreaming?: boolean | undefined
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Large, prominent search bar with keyboard shortcuts.
 *
 * @param {SearchBarProps} props - Component properties
 * @returns {JSX.Element} The rendered search bar
 */
function SearchBar({ onSearch, isSearching, defaultValue = '', className, onStop, isStreaming }: SearchBarProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(defaultValue)

  /**
   * Handle form submission.
   */
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (value.trim() && !isSearching) {
        onSearch(value.trim())
      }
    },
    [value, isSearching, onSearch],
  )

  /**
   * Clear the search input.
   */
  const handleClear = useCallback(() => {
    setValue('')
    inputRef.current?.focus()
  }, [])

  return (
    <form onSubmit={handleSubmit} className={cn('w-full max-w-2xl mx-auto', className)}>
      <div className="relative group">
        {/* Search icon */}
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('search.placeholder')}
          className="w-full h-14 rounded-2xl border-2 border-input bg-background pl-12 pr-12 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary transition-all shadow-sm hover:shadow-md focus:shadow-md"
          aria-label={t('search.placeholder')}
          disabled={isSearching}
        />

        {/* Stop button (when streaming) or clear button */}
        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
          >
            <Square className="h-4 w-4" />
          </button>
        ) : value ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Hint text */}
      <p className="text-xs text-muted-foreground text-center mt-2">
        {t('search.hint')}
      </p>
    </form>
  )
}

export default SearchBar
