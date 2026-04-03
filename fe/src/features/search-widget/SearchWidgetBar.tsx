/**
 * @fileoverview Compact spotlight-style search input bar for the search widget.
 * Renders a minimal search input that triggers search on submit.
 *
 * @module features/search-widget/SearchWidgetBar
 */

import { useState } from 'react'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the SearchWidgetBar component.
 */
interface SearchWidgetBarProps {
  /** Callback fired when user submits a search query */
  onSearch: (query: string) => void
  /** Whether a search is currently in progress */
  isSearching: boolean
  /** Placeholder text for the input */
  placeholder?: string | undefined
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Compact search input bar with spotlight-style design for the embeddable widget.
 * @param {SearchWidgetBarProps} props - Component props
 * @returns {JSX.Element} The rendered search input bar
 */
export function SearchWidgetBar({ onSearch, isSearching, placeholder }: SearchWidgetBarProps) {
  const [query, setQuery] = useState('')

  /**
   * @description Handle form submission. Prevents empty queries from being submitted.
   * @param {React.FormEvent} e - Form submit event
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = query.trim()
    // Guard: only submit non-empty queries when not already searching
    if (trimmed && !isSearching) {
      onSearch(trimmed)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bk-sw-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        borderRadius: '8px',
        border: '1px solid var(--bk-sw-border, #e2e8f0)',
        backgroundColor: 'var(--bk-sw-bg, #ffffff)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Search icon */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--bk-sw-icon, #94a3b8)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>

      {/* Search input */}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder || 'Search...'}
        disabled={isSearching}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: '14px',
          color: 'var(--bk-sw-text, #1e293b)',
          lineHeight: '20px',
        }}
      />

      {/* Submit button */}
      {query.trim() && (
        <button
          type="submit"
          disabled={isSearching}
          style={{
            flexShrink: 0,
            padding: '4px 12px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: isSearching
              ? 'var(--bk-sw-btn-disabled, #cbd5e1)'
              : 'var(--bk-sw-btn-bg, #0D26CF)',
            color: 'var(--bk-sw-btn-text, #ffffff)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: isSearching ? 'not-allowed' : 'pointer',
            lineHeight: '20px',
          }}
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      )}
    </form>
  )
}
