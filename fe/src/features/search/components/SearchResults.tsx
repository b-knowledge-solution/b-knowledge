/**
 * @fileoverview Search results display with AI summary, streaming, and result cards.
 * @module features/search/components/SearchResults
 */

import { useTranslation } from 'react-i18next'
import { Sparkles, SearchX, Square } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import { cn } from '@/lib/utils'
import CitationInline from '@/components/CitationInline'
import type { ChatChunk, ChatReference } from '@/features/chat/types/chat.types'
import SearchResultCard from './SearchResultCard'
import RelatedSearchQuestions from './RelatedSearchQuestions'
import DocumentFilterPopover from './DocumentFilterPopover'
import type { SearchResult } from '../types/search.types'

// ============================================================================
// Props
// ============================================================================

interface SearchResultsProps {
  /** Array of search results */
  results: SearchResult[]
  /** Whether a search is in progress */
  isSearching?: boolean
  /** AI-generated summary (non-streaming) */
  summary?: string | null
  /** Total number of results */
  totalResults?: number
  /** The search query for highlighting */
  query?: string
  /** Callback when a result card is clicked */
  onResultClick?: ((result: SearchResult) => void) | undefined
  /** Current error message */
  error?: string | null
  /** Optional CSS class name */
  className?: string
  /** Streaming AI answer text */
  streamingAnswer?: string | undefined
  /** Related question suggestions */
  relatedQuestions?: string[] | undefined
  /** Callback when a related question is clicked */
  onRelatedQuestionClick?: ((question: string) => void) | undefined
  /** Whether AI answer is currently streaming */
  isStreamingAnswer?: boolean | undefined
  /** Document aggregation data */
  docAggs?: Array<{ doc_id: string; doc_name: string; count: number }> | undefined
  /** Current pipeline processing status */
  pipelineStatus?: string | undefined
  /** Callback to stop the streaming answer */
  onStopStream?: (() => void) | undefined
  /** Current page number (1-based) */
  page?: number | undefined
  /** Results per page */
  pageSize?: number | undefined
  /** Callback when page changes */
  onPageChange?: ((page: number) => void) | undefined
  /** Callback when page size changes */
  onPageSizeChange?: ((size: number) => void) | undefined
  /** Currently selected document IDs for filtering */
  selectedDocIds?: string[] | undefined
  /** Callback when document filter selection changes */
  onDocFilterChange?: ((ids: string[]) => void) | undefined
  /** Reference data for citation popover display */
  reference?: ChatReference | undefined
  /** Callback when a citation badge is clicked to open document preview */
  onCitationClick?: ((chunk: ChatChunk) => void) | undefined
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Displays search results with an AI summary card, streaming support,
 * related questions, document aggregates, and pagination.
 *
 * @param {SearchResultsProps} props - Component properties
 * @returns {JSX.Element} The rendered search results
 */
function SearchResults({
  results,
  isSearching,
  summary,
  totalResults,
  query,
  onResultClick,
  error,
  className,
  streamingAnswer,
  relatedQuestions,
  onRelatedQuestionClick,
  isStreamingAnswer,
  docAggs,
  pipelineStatus,
  onStopStream,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange: _onPageSizeChange,
  selectedDocIds,
  onDocFilterChange,
  reference,
  onCitationClick,
}: SearchResultsProps) {
  const { t } = useTranslation()

  // Filter results by selected document IDs when filter is active
  const filteredResults = selectedDocIds && selectedDocIds.length > 0
    ? results.filter((r) => selectedDocIds.includes(r.doc_id))
    : results

  // Determine the effective answer to show (streaming or final)
  const displayAnswer = streamingAnswer || summary
  const showStreamingState = isStreamingAnswer || !!streamingAnswer

  // Loading state (only when not streaming — streaming shows inline)
  if (isSearching && !isStreamingAnswer) {
    return (
      <div className={cn('flex items-center justify-center py-20', className)}>
        <Spinner label={t('search.searching')} />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
        <SearchX className="h-12 w-12 text-destructive/50 mb-3" />
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  // No results state (only when not streaming)
  if (results.length === 0 && totalResults === 0 && query && !isStreamingAnswer && !streamingAnswer) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
        <SearchX className="h-12 w-12 text-muted-foreground/40 mb-3" />
        <h3 className="text-base font-medium text-foreground mb-1">
          {t('search.noResults')}
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          {t('search.noResultsDescription')}
        </p>
      </div>
    )
  }

  // No query yet
  if (results.length === 0 && !displayAnswer && !isStreamingAnswer) return null

  // Calculate pagination values
  const currentPage = page || 1
  const currentPageSize = pageSize || 20
  const total = totalResults || results.length
  const totalPages = Math.ceil(total / currentPageSize)
  const from = (currentPage - 1) * currentPageSize + 1
  const to = Math.min(currentPage * currentPageSize, total)

  return (
    <div className={cn('space-y-4', className)}>
      {/* Pipeline status badge */}
      {pipelineStatus && isStreamingAnswer && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs animate-pulse">
            {pipelineStatus === 'retrieving' && t('search.retrieving')}
            {pipelineStatus === 'generating' && t('search.generating')}
            {pipelineStatus !== 'retrieving' && pipelineStatus !== 'generating' && pipelineStatus}
          </Badge>
        </div>
      )}

      {/* AI Summary card (streaming or final) */}
      {displayAnswer && (
        <div className="border rounded-xl p-4 bg-primary/5 border-primary/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-primary">
                {isStreamingAnswer ? t('search.aiSummaryStreaming') : t('search.aiSummary')}
              </span>
            </div>

            {/* Stop button when streaming */}
            {isStreamingAnswer && onStopStream && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-7 text-xs"
                onClick={onStopStream}
              >
                <Square className="h-3 w-3" />
                {t('search.stopSearch')}
              </Button>
            )}
          </div>

          {/* Render answer with citation support */}
          {showStreamingState ? (
            <div className="text-sm">
              <CitationInline
                content={displayAnswer}
                reference={reference}
                onCitationClick={onCitationClick}
              />
              {isStreamingAnswer && (
                <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 align-text-bottom" />
              )}
            </div>
          ) : (
            <CitationInline
              content={displayAnswer}
              reference={reference}
              onCitationClick={onCitationClick}
            />
          )}
        </div>
      )}

      {/* Document filter popover */}
      {docAggs && docAggs.length > 0 && onDocFilterChange && (
        <DocumentFilterPopover
          docAggs={docAggs}
          selectedDocIds={selectedDocIds || []}
          onSelectionChange={onDocFilterChange}
        />
      )}

      {/* Results count */}
      {filteredResults.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {onPageChange
              ? t('search.pagesShowing', { from, to, total })
              : t('common.totalItems', { total })}
          </p>
        </div>
      )}

      {/* Result cards */}
      {filteredResults.length > 0 && (
        <div className="space-y-3">
          {filteredResults.map((result) => (
            <SearchResultCard
              key={result.chunk_id}
              result={result}
              query={query}
              onClick={onResultClick}
            />
          ))}
        </div>
      )}

      {/* Pagination controls */}
      {onPageChange && totalPages > 1 && (
        <div className="flex justify-center pt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </div>
      )}

      {/* Related search questions */}
      {relatedQuestions && onRelatedQuestionClick && (
        <RelatedSearchQuestions
          questions={relatedQuestions}
          onQuestionClick={onRelatedQuestionClick}
        />
      )}
    </div>
  )
}

export default SearchResults
