/**
 * @fileoverview Shared cross-language selector component.
 * Renders a set of language toggle pills for multi-language search expansion.
 * Used by both Chat assistant and Search app configuration.
 * @module components/cross-language/CrossLanguageSelector
 */

import { useTranslation } from 'react-i18next'

// ============================================================================
// Constants
// ============================================================================

/** Supported languages for cross-language search */
const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Ti\u1EBFng Vi\u1EC7t' },
  { code: 'ja', label: '\u65E5\u672C\u8A9E' },
  { code: 'zh', label: '\u4E2D\u6587' },
  { code: 'ko', label: '\uD55C\uAD6D\uC5B4' },
  { code: 'fr', label: 'Fran\u00E7ais' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Espa\u00F1ol' },
] as const

// ============================================================================
// Props
// ============================================================================

/** @description Props for the CrossLanguageSelector component */
interface CrossLanguageSelectorProps {
  /** Comma-separated string of selected language codes */
  value: string
  /** Callback when language selection changes */
  onChange: (value: string) => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Multi-select language toggle pills for cross-language search.
 * Stores selected languages as a comma-separated string.
 *
 * @param {CrossLanguageSelectorProps} props - Component properties
 * @returns {JSX.Element} The rendered cross-language selector
 */
export function CrossLanguageSelector({ value, onChange }: CrossLanguageSelectorProps) {
  const { t } = useTranslation()

  // Parse comma-separated string into a Set for fast lookup
  const selectedCodes = new Set(
    value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [],
  )

  /**
   * Toggle a language code in the selection.
   * @param code - Language code to toggle
   */
  const toggleLanguage = (code: string) => {
    const next = new Set(selectedCodes)
    if (next.has(code)) {
      next.delete(code)
    } else {
      next.add(code)
    }
    onChange(Array.from(next).join(','))
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{t('searchAdmin.crossLanguages')}</label>
      <p className="text-xs text-muted-foreground">
        {t('searchAdmin.crossLanguagesDesc')}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isSelected = selectedCodes.has(lang.code)
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => toggleLanguage(lang.code)}
              className={`
                inline-flex items-center rounded-full px-3 py-1 text-xs font-medium
                border transition-colors cursor-pointer
                ${isSelected
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-input hover:bg-muted'
                }
              `}
            >
              {lang.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
