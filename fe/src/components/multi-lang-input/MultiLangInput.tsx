/**
 * @fileoverview Multi-language input component for per-locale text entry.
 * Renders inline language tabs (EN / VI / JA) so admins can provide
 * locale-specific messages (e.g., welcome message, empty response).
 *
 * @module components/multi-lang-input/MultiLangInput
 */

import { useState } from 'react'
import { cn } from '@/lib/utils'

// ============================================================================
// Constants
// ============================================================================

/** Supported system locales with display labels */
const SYSTEM_LANGUAGES = [
  { code: 'en', label: 'EN' },
  { code: 'vi', label: 'VI' },
  { code: 'ja', label: 'JA' },
] as const

// ============================================================================
// Types
// ============================================================================

/** @description Multi-language field value — either a plain string (legacy) or per-locale map */
export type MultiLangValue = string | Record<string, string>

/**
 * @description Props for the MultiLangInput component.
 */
export interface MultiLangInputProps {
  /** Current value — supports both legacy string and per-locale Record */
  value: MultiLangValue
  /** Callback when any locale's value changes; always emits Record<string, string> */
  onChange: (val: Record<string, string>) => void
  /** Placeholder text displayed in the input/textarea */
  placeholder?: string
  /** When true, renders a resizable textarea instead of a single-line input */
  multiline?: boolean
  /** Additional CSS class names for the container */
  className?: string
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Normalize a MultiLangValue to a per-locale Record.
 * If the value is a plain string (legacy format), assigns it to the 'en' key.
 * @param {MultiLangValue} value - Raw value from the form state
 * @returns {Record<string, string>} Normalized per-locale map
 */
function normalizeValue(value: MultiLangValue): Record<string, string> {
  if (typeof value === 'string') {
    return { en: value, vi: '', ja: '' }
  }
  return { en: '', vi: '', ja: '', ...value }
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Multi-language text input with inline locale tabs.
 * Allows admins to enter separate text for each system language (EN, VI, JA).
 * Backward-compatible: accepts both plain strings and Record<string, string>.
 *
 * @param {MultiLangInputProps} props - Component properties
 * @returns {JSX.Element} The rendered multi-language input
 */
function MultiLangInput({
  value,
  onChange,
  placeholder,
  multiline = false,
  className,
}: MultiLangInputProps) {
  const [activeLang, setActiveLang] = useState('en')

  // Normalize the value to ensure we always work with a Record
  const normalizedValue = normalizeValue(value)

  /**
   * @description Handle text change for the active language tab.
   * @param {string} text - New text value for the active locale
   */
  const handleChange = (text: string) => {
    onChange({ ...normalizedValue, [activeLang]: text })
  }

  // Shared input styling
  const inputClassName = cn(
    'w-full rounded-b-md border border-t-0 bg-background px-3 text-sm',
    'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring',
    'dark:border-gray-600',
  )

  return (
    <div className={cn('relative', className)}>
      {/* Language tabs */}
      <div className="flex border border-b-0 rounded-t-md dark:border-gray-600 overflow-hidden">
        {SYSTEM_LANGUAGES.map((lang) => {
          const isActive = activeLang === lang.code
          // Show a subtle dot indicator when a non-active tab has content
          const hasContent = !!normalizedValue[lang.code]?.trim()

          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => setActiveLang(lang.code)}
              className={cn(
                'flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors',
                'border-r last:border-r-0 dark:border-gray-600',
                isActive
                  ? 'bg-background text-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {lang.label}
              {/* Content indicator dot for non-active tabs */}
              {!isActive && hasContent && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </div>

      {/* Text input area */}
      {multiline ? (
        <textarea
          value={normalizedValue[activeLang] ?? ''}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          className={cn(inputClassName, 'min-h-[60px] py-2 resize-y')}
        />
      ) : (
        <input
          value={normalizedValue[activeLang] ?? ''}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          className={cn(inputClassName, 'h-9')}
        />
      )}
    </div>
  )
}

export default MultiLangInput
