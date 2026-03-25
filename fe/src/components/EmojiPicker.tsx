/**
 * @fileoverview Simple emoji grid picker for search app avatars.
 * Displays a curated set of knowledge/search-relevant emoji with
 * custom text input fallback for arbitrary emoji entry.
 *
 * @module components/EmojiPicker
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

// ============================================================================
// Constants
// ============================================================================

/** Curated set of knowledge/search-relevant emoji for quick selection */
const EMOJI_LIST = [
  '\u{1F4DA}', '\u{1F50D}', '\u{1F4A1}', '\u{1F9E0}', '\u{1F4D6}',
  '\u{1F5C2}\uFE0F', '\u{1F3AF}', '\u{1F4CA}', '\u{1F52C}', '\u{1F4BB}',
  '\u{1F4DD}', '\u{1F3D7}\uFE0F', '\u26A1', '\u{1F310}', '\u{1F527}',
  '\u{1F4CB}', '\u{1F393}', '\u{1F3E5}', '\u2696\uFE0F', '\u{1F510}',
  '\u{1F4F0}', '\u{1F3B5}', '\u{1F3A8}', '\u{1F4F7}', '\u{1F6D2}',
  '\u2708\uFE0F', '\u{1F3E6}', '\u{1F3ED}', '\u{1F331}', '\u{1F916}',
  '\u{1F4E1}', '\u{1F514}', '\u{1F4AC}', '\u{1F4C1}', '\u{1F5C4}\uFE0F',
  '\u{1F9EA}', '\u{1F4C8}', '\u{1F517}', '\u{1F6E1}\uFE0F', '\u{1F48E}',
  '\u{1F30D}', '\u{1F4E6}', '\u{1F3EA}', '\u{1F3E0}', '\u{1F52D}',
  '\u{1F4D0}', '\u{1F9E9}', '\u{1F3B2}', '\u{1F4CC}', '\u2728',
] as const

// ============================================================================
// Props
// ============================================================================

/** @description Props for the EmojiPicker component */
interface EmojiPickerProps {
  /** Currently selected emoji value */
  value: string
  /** Callback fired when an emoji is selected or cleared */
  onChange: (emoji: string) => void
  /** Optional CSS class name for the outer container */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Grid-based emoji picker with curated emoji set and custom text input.
 * Displays a 10-column grid of knowledge/search-relevant emoji, highlights the
 * currently selected emoji, and provides a text input for arbitrary emoji entry.
 *
 * @param {EmojiPickerProps} props - Component properties
 * @returns {JSX.Element} Rendered emoji picker with grid and custom input
 */
export function EmojiPicker({ value, onChange, className }: EmojiPickerProps) {
  const { t } = useTranslation()
  const [customInput, setCustomInput] = useState('')

  /**
   * @description Handles custom emoji input changes.
   * Extracts the first emoji-like character from the input and selects it.
   * @param {string} input - Raw text from the custom input field
   */
  const handleCustomInput = (input: string) => {
    setCustomInput(input)

    // Select the first grapheme cluster from input via spread (handles emoji correctly)
    if (input.trim()) {
      const chars = [...input.trim()]
      if (chars.length > 0) {
        onChange(chars[0]!)
      }
    }
  }

  /**
   * @description Clears the current emoji selection and custom input.
   */
  const handleClear = () => {
    onChange('')
    setCustomInput('')
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Emoji grid — 10 columns of curated emoji */}
      <div className="grid grid-cols-10 gap-1">
        {EMOJI_LIST.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              onChange(emoji)
              setCustomInput('')
            }}
            className={cn(
              'h-8 w-8 flex items-center justify-center rounded text-base hover:bg-accent transition-colors',
              value === emoji && 'ring-2 ring-primary ring-offset-1'
            )}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Custom emoji input with clear button */}
      <div className="flex items-center gap-2">
        <Input
          value={customInput}
          onChange={(e) => handleCustomInput(e.target.value)}
          placeholder={t('common.customEmojiPlaceholder')}
          className="flex-1 h-8 text-sm"
        />
        {/* Show clear button only when a value is selected */}
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title={t('common.clearSelection')}
          >
            <X className="h-3.5 w-3.5" />
            {t('common.clear')}
          </button>
        )}
      </div>
    </div>
  )
}

export default EmojiPicker
