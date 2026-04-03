/**
 * @fileoverview Chunk content display with server-side highlight and expandable full content.
 * Renders OpenSearch highlight snippets with sanitized HTML, falling back to
 * client-side highlighting when server highlights are unavailable.
 *
 * SECURITY: All HTML content is sanitized with DOMPurify before rendering.
 * Only <em> tags are allowed through sanitization to prevent XSS attacks.
 *
 * @module components/ChunkContentDisplay
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import DOMPurify from 'dompurify'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SearchHighlight } from '@/features/search/components/SearchHighlight'

// ============================================================================
// Props
// ============================================================================

/** @description Props for the ChunkContentDisplay component */
interface ChunkContentDisplayProps {
  /** Server-side snippet with <em> tags from OpenSearch highlighting */
  highlight?: string | null
  /** Full chunk content (content_with_weight) */
  fullContent: string
  /** Search query for client-side fallback highlighting */
  query?: string
  /** Whether to start in expanded state (default: false) */
  defaultExpanded?: boolean
  /** Optional CSS class name for the outer container */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Displays chunk content with server-side highlight snippet and expandable full content.
 * In collapsed mode, shows the highlight snippet (sanitized to allow only <em> tags) or falls back
 * to client-side highlighting via SearchHighlight. An expand toggle reveals the full content in a
 * scrollable container when the highlight differs from the full content.
 *
 * @param {ChunkContentDisplayProps} props - Component properties
 * @returns {JSX.Element} Rendered chunk content with optional expand/collapse toggle
 */
export function ChunkContentDisplay({
  highlight,
  fullContent,
  query,
  defaultExpanded = false,
  className,
}: ChunkContentDisplayProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(defaultExpanded)

  // Sanitize server highlight — ONLY allow <em> tags to prevent XSS.
  // OpenSearch returns highlight snippets with <em> wrapping matched terms.
  const sanitizedHighlight = highlight
    ? DOMPurify.sanitize(highlight, { ALLOWED_TAGS: ['em'] })
    : null

  // Strip HTML tags from highlight to compare plain text with fullContent
  const highlightPlainText = sanitizedHighlight
    ? sanitizedHighlight.replace(/<\/?em>/g, '')
    : null

  // Only show toggle when server highlight exists and differs from full content
  const showToggle = !!sanitizedHighlight && highlightPlainText !== fullContent

  return (
    <div className={cn('space-y-1', className)}>
      {/* Collapsed view: server highlight or client-side fallback */}
      {!expanded && (
        <>
          {sanitizedHighlight ? (
            // Server-side highlight — render DOMPurify-sanitized HTML (only <em> tags allowed)
            <div
              className="text-sm text-foreground/80 line-clamp-3 [&>em]:bg-yellow-200 [&>em]:not-italic [&>em]:rounded-sm [&>em]:px-0.5 dark:[&>em]:bg-yellow-900/50"
              dangerouslySetInnerHTML={{ __html: sanitizedHighlight }}
            />
          ) : query ? (
            // Client-side fallback when no server highlight is available
            <SearchHighlight
              text={fullContent}
              query={query}
              className="text-sm text-foreground/80 line-clamp-3"
            />
          ) : (
            // Plain text fallback when neither highlight nor query is available
            <p className="text-sm text-foreground/80 line-clamp-3">
              {fullContent}
            </p>
          )}
        </>
      )}

      {/* Expanded view: full content in scrollable container */}
      {expanded && (
        <div className="max-h-[200px] overflow-y-auto p-2 bg-muted/50 rounded border">
          <p className="text-sm text-foreground/80 whitespace-pre-wrap">
            {fullContent}
          </p>
        </div>
      )}

      {/* Expand/collapse toggle — only shown when highlight differs from full content */}
      {showToggle && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              {t('search.hideFullContent')}
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              {t('search.showFullContent')}
            </>
          )}
        </button>
      )}
    </div>
  )
}

export default ChunkContentDisplay
