/**
 * @fileoverview Dataset Search page - search interface with streaming AI summary,
 * filters, document preview, and related questions.
 * @module features/ai/pages/DatasetSearchPage
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Database, Brain } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth'
import { useFirstVisit, GuidelineDialog } from '@/features/guideline'
import SearchBar from '../components/SearchBar'
import SearchResults from '../components/SearchResults'
import SearchFilters from '../components/SearchFilters'
import SearchDocumentPreviewDrawer from '../components/SearchDocumentPreviewDrawer'
import SearchMindMapDrawer from '../components/SearchMindMapDrawer'
import { useSearchStream } from '../hooks/useSearchStream'
import type { SearchFilters as SearchFiltersType, SearchResult } from '../types/search.types'

// ============================================================================
// Component
// ============================================================================

/**
 * @description Dataset search page with large centered search bar,
 * filter sidebar, streaming AI summary, and document preview drawer.
 *
 * @returns {JSX.Element} The rendered dataset search page
 */
function DatasetSearchPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { isFirstVisit } = useFirstVisit('ai-search')
  const [showGuide, setShowGuide] = useState(false)

  // Search stream state
  const searchStream = useSearchStream()
  const [filters, setFilters] = useState<SearchFiltersType>({})
  const [showFilters, setShowFilters] = useState(false)

  // Search app ID (could come from URL params or config)
  const [searchAppId] = useState('default')

  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)

  // Document filter state
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])

  // Mind map drawer state
  const [mindMapOpen, setMindMapOpen] = useState(false)

  // Document preview drawer state
  const [previewDoc, setPreviewDoc] = useState<{
    open: boolean
    result: SearchResult | null
  }>({ open: false, result: null })

  // Whether user has performed a search (show results layout vs landing)
  const hasSearched = !!searchStream.lastQuery

  // Show first-visit guide
  useEffect(() => {
    if (isFirstVisit) {
      setShowGuide(true)
    }
  }, [isFirstVisit])

  /**
   * Handle search submission.
   * @param query - Search query text
   */
  const handleSearch = useCallback(
    (query: string) => {
      // Reset pagination and document filter on new search
      setPage(1)
      setSelectedDocIds([])
      searchStream.askSearch(searchAppId, query, {
        ...filters,
        page: 1,
        page_size: pageSize,
      })
    },
    [searchStream, searchAppId, filters, pageSize],
  )

  /**
   * Handle filter changes - re-run search with new filters.
   * @param newFilters - Updated filters
   */
  const handleFiltersChange = useCallback(
    (newFilters: SearchFiltersType) => {
      setFilters(newFilters)
      // Re-run search with updated filters if a query exists
      if (searchStream.lastQuery) {
        setPage(1)
        searchStream.askSearch(searchAppId, searchStream.lastQuery, {
          ...newFilters,
          page: 1,
          page_size: pageSize,
        })
      }
    },
    [searchStream, searchAppId, pageSize],
  )

  /**
   * Handle result card click - open document preview drawer.
   * @param result - The clicked search result
   */
  const handleResultClick = useCallback((result: SearchResult) => {
    setPreviewDoc({ open: true, result })
  }, [])

  /**
   * Handle related question click - re-run search with question.
   * @param question - The related question text
   */
  const handleRelatedQuestionClick = useCallback(
    (question: string) => {
      setPage(1)
      searchStream.askSearch(searchAppId, question, {
        ...filters,
        page: 1,
        page_size: pageSize,
      })
    },
    [searchStream, searchAppId, filters, pageSize],
  )

  /**
   * Handle page change for pagination.
   * @param newPage - New page number
   */
  const handlePageChange = useCallback(
    (newPage: number) => {
      setPage(newPage)
      if (searchStream.lastQuery) {
        searchStream.askSearch(searchAppId, searchStream.lastQuery, {
          ...filters,
          page: newPage,
          page_size: pageSize,
        })
      }
    },
    [searchStream, searchAppId, filters, pageSize],
  )

  return (
    <>
      <div className="flex h-full w-full overflow-hidden">
        {/* Filter sidebar (conditionally visible) */}
        {hasSearched && showFilters && (
          <SearchFilters
            filters={filters}
            onFiltersChange={handleFiltersChange}
            visible={showFilters}
            onToggle={() => setShowFilters(!showFilters)}
            className="hidden md:block"
          />
        )}

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* Landing / search bar section */}
          <div
            className={cn(
              'flex flex-col items-center transition-all duration-500',
              hasSearched
                ? 'pt-6 pb-4 border-b bg-muted/20'
                : 'flex-1 justify-center pb-20',
            )}
          >
            {/* Logo / branding (only on landing) */}
            {!hasSearched && (
              <div className="flex flex-col items-center gap-3 mb-8">
                <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center">
                  <Search className="h-10 w-10 text-primary" />
                </div>
                <h1 className="text-2xl font-bold text-foreground">
                  {user?.name
                    ? `${t('search.greeting')}, ${user.name}`
                    : t('search.title')}
                </h1>
                <p className="text-sm text-muted-foreground max-w-md text-center">
                  {t('search.description')}
                </p>
              </div>
            )}

            {/* Search bar */}
            <SearchBar
              onSearch={handleSearch}
              isSearching={searchStream.isStreaming}
              isStreaming={searchStream.isStreaming}
              onStop={searchStream.stopStream}
              defaultValue={searchStream.lastQuery}
              className={hasSearched ? 'max-w-xl' : 'max-w-2xl'}
            />

            {/* Filter toggle and mind map button (only after search) */}
            {hasSearched && (
              <div className="flex items-center gap-2 mt-3">
                <SearchFilters
                  filters={filters}
                  onFiltersChange={handleFiltersChange}
                  visible={false}
                  onToggle={() => setShowFilters(!showFilters)}
                />
                {/* Mind map button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMindMapOpen(true)}
                  title={t('search.mindMap')}
                >
                  <Brain className="h-4 w-4 mr-1.5" />
                  {t('search.mindMap')}
                </Button>
              </div>
            )}
          </div>

          {/* Search results */}
          {hasSearched && (
            <div className="flex-1 px-4 py-6">
              <div className="max-w-3xl mx-auto">
                <SearchResults
                  results={searchStream.chunks}
                  isSearching={searchStream.isStreaming && !searchStream.answer}
                  summary={searchStream.answer}
                  totalResults={searchStream.chunks.length}
                  query={searchStream.lastQuery}
                  onResultClick={handleResultClick}
                  error={searchStream.error}
                  streamingAnswer={searchStream.answer}
                  relatedQuestions={searchStream.relatedQuestions}
                  onRelatedQuestionClick={handleRelatedQuestionClick}
                  isStreamingAnswer={searchStream.isStreaming}
                  docAggs={searchStream.docAggs}
                  selectedDocIds={selectedDocIds}
                  onDocFilterChange={setSelectedDocIds}
                  pipelineStatus={searchStream.pipelineStatus}
                  onStopStream={searchStream.stopStream}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={handlePageChange}
                />
              </div>
            </div>
          )}

          {/* Dataset badges on landing */}
          {!hasSearched && (
            <div className="flex items-center justify-center gap-2 mt-4 px-4 flex-wrap">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {t('search.searchAcrossDatasets')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Document preview drawer */}
      <SearchDocumentPreviewDrawer
        open={previewDoc.open}
        onClose={() => setPreviewDoc({ open: false, result: null })}
        documentId={previewDoc.result?.doc_id}
        documentName={previewDoc.result?.doc_name}
        chunk={previewDoc.result}
        datasetId={previewDoc.result?.dataset_id}
      />

      {/* Mind map drawer */}
      <SearchMindMapDrawer
        open={mindMapOpen}
        onOpenChange={setMindMapOpen}
        searchAppId={searchAppId}
        query={searchStream.lastQuery || ''}
      />

      {/* First visit guide */}
      <GuidelineDialog
        open={showGuide}
        onClose={() => setShowGuide(false)}
        featureId="ai-search"
      />
    </>
  )
}

export default DatasetSearchPage
