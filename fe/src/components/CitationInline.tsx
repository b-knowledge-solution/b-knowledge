/**
 * @fileoverview Inline citation renderer for assistant messages.
 *
 * Thin wrapper around MarkdownRenderer that passes reference data for
 * integrated citation rendering. Citations are rendered INSIDE the markdown
 * pipeline (via rehype plugin) so they never break markdown formatting.
 *
 * @module components/CitationInline
 */

import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import type { ChatReference, ChatChunk } from '@/features/chat/types/chat.types'

// ============================================================================
// Props
// ============================================================================

interface CitationInlineProps {
  /** Raw message content potentially containing citation markers */
  content: string
  /** Reference data with chunks for hover card display */
  reference?: ChatReference | undefined
  /** Callback when a citation badge is clicked to open document preview */
  onCitationClick?: ((chunk: ChatChunk) => void) | undefined
}

// ============================================================================
// Helpers (exported for use by other components)
// ============================================================================

/** Regex to match all citation marker formats (double $$ first to avoid partial match) */
const CITATION_REGEX = /##ID:(\d+)\$\$|##ID:(\d+)\$|##(\d+)\$\$|\[ID:(\d+)\]/g

/**
 * @description Strip all citation markers from content for clean display.
 * @param {string} content - Raw content with markers
 * @returns {string} Clean content without markers
 */
export function stripCitationMarkers(content: string): string {
  return content.replace(CITATION_REGEX, '')
}

/**
 * @description Check if content contains any citation markers.
 * @param {string} content - Raw content to check
 * @returns {boolean} Whether markers are present
 */
export function hasCitationMarkers(content: string): boolean {
  CITATION_REGEX.lastIndex = 0
  return CITATION_REGEX.test(content)
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Renders assistant message content with inline citation hover cards.
 * Delegates to MarkdownRenderer which integrates citations directly into the
 * markdown rendering pipeline — citations appear inline next to the text that
 * references them, showing chunk previews on hover (not click).
 *
 * Supports all citation formats:
 * - ##ID:n$ (B-Knowledge format)
 * - ##n$$ (old RAGFlow format)
 * - [ID:n] (normalized format)
 *
 * @param {CitationInlineProps} props - Component properties
 * @returns {JSX.Element} Rendered content with inline citation hover cards
 */
function CitationInline({ content, reference, onCitationClick }: CitationInlineProps) {
  return (
    <MarkdownRenderer
      reference={reference}
      onCitationClick={onCitationClick}
    >
      {content}
    </MarkdownRenderer>
  )
}

export default CitationInline
