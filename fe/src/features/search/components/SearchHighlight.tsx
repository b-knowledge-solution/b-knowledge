/**
 * @fileoverview Search term highlighting component.
 * Splits text by query terms and wraps matches in <mark> elements.
 * @module features/search/components/SearchHighlight
 */

// ============================================================================
// Props
// ============================================================================

/** @description Props for the SearchHighlight component */
interface SearchHighlightProps {
  /** The text content to render with highlights */
  text: string
  /** The search query whose terms will be highlighted */
  query: string
  /** Optional CSS class name for the wrapper span */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Highlights matching search terms within text content.
 * Splits query into individual words, escapes regex special characters,
 * and wraps matched portions in <mark> elements with yellow background.
 *
 * @param {SearchHighlightProps} props - Component properties
 * @returns {JSX.Element} The rendered text with highlighted matches
 */
export function SearchHighlight({ text, query, className }: SearchHighlightProps) {
  // Guard: return plain text when query is empty
  if (!query.trim()) return <span className={className}>{text}</span>

  try {
    // Split query into individual terms and escape regex special chars
    const terms = query.split(/\s+/).filter(Boolean)
    const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const regex = new RegExp(`(${escaped.join('|')})`, 'gi')
    const parts = text.split(regex)

    return (
      <span className={className}>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark
              key={i}
              className="bg-yellow-200 dark:bg-yellow-800 text-foreground rounded-sm px-0.5"
            >
              {part}
            </mark>
          ) : (
            part
          ),
        )}
      </span>
    )
  } catch {
    // Fallback to plain text if regex fails
    return <span className={className}>{text}</span>
  }
}

export default SearchHighlight
