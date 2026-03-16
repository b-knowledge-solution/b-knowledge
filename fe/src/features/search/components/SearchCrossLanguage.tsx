/**
 * @fileoverview Cross-language selector component for search configuration.
 * Renders a set of language toggle pills for multi-language search expansion.
 * @module features/search/components/SearchCrossLanguage
 */

import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'

// ============================================================================
// Constants
// ============================================================================

/** Supported languages for cross-language search */
const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
] as const

// ============================================================================
// Props
// ============================================================================

/** @description Props for the SearchCrossLanguage component */
interface SearchCrossLanguageProps {
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
 * @param {SearchCrossLanguageProps} props - Component properties
 * @returns {JSX.Element} The rendered cross-language selector
 */
export function SearchCrossLanguage({ value, onChange }: SearchCrossLanguageProps) {
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
      <Label>{t('searchAdmin.crossLanguages')}</Label>
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
