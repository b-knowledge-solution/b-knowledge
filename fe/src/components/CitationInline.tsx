/**
 * @fileoverview Inline citation renderer for assistant messages.
 * Parses ##ID:n$ markers in text and renders them as interactive popover badges
 * showing chunk content on hover.
 * @module features/ai/components/CitationInline
 */

import { useTranslation } from 'react-i18next'
import { FileText } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import type { ChatReference, ChatChunk } from '@/features/chat/types/chat.types'

// ============================================================================
// Props
// ============================================================================

interface CitationInlineProps {
  /** Raw message content potentially containing ##ID:n$ markers */
  content: string
  /** Reference data with chunks for popover display */
  reference?: ChatReference | undefined
  /** Callback when a citation is clicked to open document preview */
  onCitationClick?: ((chunk: ChatChunk) => void) | undefined
}

// ============================================================================
// Helpers
// ============================================================================

/** Regex to match citation markers: ##ID:0$, ##ID:1$, etc. */
const CITATION_REGEX = /##ID:(\d+)\$/g

/**
 * @description Strip all citation markers from content for clean markdown rendering.
 * @param content - Raw content with markers
 * @returns Clean content without markers
 */
export function stripCitationMarkers(content: string): string {
  return content.replace(CITATION_REGEX, '')
}

/**
 * @description Check if content contains any citation markers.
 * @param content - Raw content to check
 * @returns Whether markers are present
 */
export function hasCitationMarkers(content: string): boolean {
  return CITATION_REGEX.test(content)
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * @description A single citation badge with popover showing chunk content.
 */
function CitationBadge({
  index,
  chunk,
  onCitationClick,
}: {
  index: number
  chunk: ChatChunk | undefined
  onCitationClick?: ((chunk: ChatChunk) => void) | undefined
}) {
  const { t } = useTranslation()

  // If chunk not found, render a plain badge
  if (!chunk) {
    return (
      <Badge variant="outline" className="text-[10px] px-1 py-0 mx-0.5 align-super cursor-default">
        [{index + 1}]
      </Badge>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge
          variant="info"
          className="text-[10px] px-1 py-0 mx-0.5 align-super cursor-pointer hover:opacity-80 transition-opacity inline-flex"
          onClick={() => onCitationClick?.(chunk)}
        >
          [{index + 1}]
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-h-64 overflow-y-auto" side="top" align="start">
        {/* Document name header */}
        <div className="flex items-center gap-1.5 mb-2 text-xs text-muted-foreground">
          <FileText className="h-3 w-3 shrink-0" />
          <span className="truncate font-medium">{chunk.docnm_kwd}</span>
          {chunk.page_num_int > 0 && (
            <span className="ml-auto shrink-0">
              {t('chat.page')} {chunk.page_num_int}
            </span>
          )}
        </div>

        {/* Chunk content preview */}
        <p className="text-xs text-foreground/80 whitespace-pre-wrap line-clamp-6">
          {chunk.content_with_weight}
        </p>

        {/* Relevance score */}
        {chunk.score !== undefined && (
          <div className="mt-2 text-[10px] text-muted-foreground">
            {t('chat.relevance')}: {Math.round(chunk.score * 100)}%
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Renders assistant message content with inline citation markers
 * replaced by interactive popover badges. Content between markers is rendered
 * as markdown segments.
 *
 * @param {CitationInlineProps} props - Component properties
 * @returns {JSX.Element} The rendered content with inline citations
 */
function CitationInline({ content, reference, onCitationClick }: CitationInlineProps) {
  const chunks = reference?.chunks || []

  // Split content into segments: text and citation markers
  const parts: Array<{ type: 'text'; value: string } | { type: 'citation'; index: number }> = []
  let lastIndex = 0

  // Reset regex state
  const regex = new RegExp(CITATION_REGEX.source, 'g')
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    // Add text before this marker
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) })
    }
    // Add citation marker
    parts.push({ type: 'citation', index: parseInt(match[1]!, 10) })
    lastIndex = regex.lastIndex
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) })
  }

  // If no citations found, render as plain markdown
  if (parts.length === 0 || (parts.length === 1 && parts[0]!.type === 'text')) {
    return <MarkdownRenderer>{content}</MarkdownRenderer>
  }

  // Render segments: markdown text interspersed with citation badges
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      {parts.map((part, i) => {
        if (part.type === 'citation') {
          const chunk = chunks[part.index]
          return (
            <CitationBadge
              key={`cite-${i}`}
              index={part.index}
              chunk={chunk}
              onCitationClick={onCitationClick}
            />
          )
        }
        // Render text segment as markdown
        return <MarkdownRenderer key={`text-${i}`}>{part.value}</MarkdownRenderer>
      })}
    </div>
  )
}

export default CitationInline
