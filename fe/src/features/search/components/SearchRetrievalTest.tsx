/**
 * @fileoverview Retrieval test component for search apps.
 * Allows admins to test retrieval quality by running dry-run searches
 * that return raw chunks without LLM summary.
 * @module features/search/components/SearchRetrievalTest
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, ChevronDown, ChevronUp, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Pagination } from '@/components/ui/pagination'
import { searchApi } from '../api/searchApi'
import type { RetrievalTestChunk } from '../types/search.types'

// ============================================================================
// Props
// ============================================================================

interface SearchRetrievalTestProps {
  /** Search app ID to test against */
  appId: string
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * @description Renders a single retrieval test chunk card with score bar.
 * @param props - Chunk data and max score for normalization
 */
function ChunkCard({ chunk, maxScore }: { chunk: RetrievalTestChunk; maxScore: number }) {
  const { t } = useTranslation()
  const scorePercent = maxScore > 0 ? (chunk.score / maxScore) * 100 : 0

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-card">
      {/* Header: doc name + page */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          <span className="font-medium truncate max-w-[200px]">{chunk.doc_name}</span>
          {chunk.page_num > 0 && (
            <span className="text-xs">
              ({t('searchAdmin.retrievalTest.page')} {chunk.page_num})
            </span>
          )}
        </div>
        <span className="text-xs font-mono text-muted-foreground">
          {chunk.score.toFixed(4)}
        </span>
      </div>

      {/* Score bar */}
      <Progress value={scorePercent} className="h-1.5" />

      {/* Content preview */}
      <p className="text-sm text-foreground/80 line-clamp-4 whitespace-pre-wrap">
        {chunk.content}
      </p>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * @description Collapsible retrieval test section for search app configuration.
 * Provides a query input, run button, and displays paginated chunk results with score bars.
 *
 * @param {SearchRetrievalTestProps} props - Component properties
 * @returns {JSX.Element} The rendered retrieval test panel
 */
export function SearchRetrievalTest({ appId }: SearchRetrievalTestProps) {
  const { t } = useTranslation()

  // Collapsible state
  const [expanded, setExpanded] = useState(false)

  // Query and results state
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RetrievalTestChunk[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Page size for retrieval test results */
  const PAGE_SIZE = 10

  /**
   * Run the retrieval test with current query and page.
   * @param targetPage - Page number to fetch
   */
  const runTest = async (targetPage: number = 1) => {
    if (!query.trim() || !appId) return

    setIsRunning(true)
    setError(null)

    try {
      const response = await searchApi.retrievalTest(appId, query.trim(), {
        page: targetPage,
        page_size: PAGE_SIZE,
      })

      setResults(response.chunks)
      setTotal(response.total)
      setPage(targetPage)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
      setResults([])
      setTotal(0)
    } finally {
      setIsRunning(false)
    }
  }

  /** Handle page navigation */
  const goToPage = (targetPage: number) => {
    runTest(targetPage)
  }

  // Calculate max score for normalization
  const maxScore = results.length > 0
    ? Math.max(...results.map((r) => r.score))
    : 1

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="border rounded-lg">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        <span>{t('searchAdmin.retrievalTest.title')}</span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Collapsible content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t">
          {/* Query input + Run button */}
          <div className="flex gap-2 pt-3">
            <div className="flex-1">
              <Label className="sr-only">
                {t('searchAdmin.retrievalTest.queryLabel')}
              </Label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchAdmin.retrievalTest.queryPlaceholder')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runTest(1)
                }}
              />
            </div>
            <Button
              onClick={() => runTest(1)}
              disabled={isRunning || !query.trim()}
              size="default"
            >
              <Play className="h-4 w-4 mr-1.5" />
              {isRunning
                ? t('searchAdmin.retrievalTest.running')
                : t('searchAdmin.retrievalTest.run')}
            </Button>
          </div>

          {/* Error display */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Results summary */}
          {total > 0 && (
            <p className="text-xs text-muted-foreground">
              {t('searchAdmin.retrievalTest.resultsCount', { count: total })}
            </p>
          )}

          {/* Chunk cards */}
          {results.length > 0 && (
            <div className="space-y-2">
              {results.map((chunk) => (
                <ChunkCard key={chunk.chunk_id} chunk={chunk} maxScore={maxScore} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={goToPage}
            />
          )}

          {/* Empty state after running */}
          {!isRunning && total === 0 && query.trim() && results.length === 0 && !error && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t('searchAdmin.retrievalTest.noResults')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
