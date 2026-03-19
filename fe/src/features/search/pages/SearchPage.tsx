/**
 * @fileoverview Dataset Search page - search interface with streaming AI summary,
 * filters, document preview, and related questions.
 * @module features/ai/pages/DatasetSearchPage
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Database, Brain } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/features/auth'
import { useFirstVisit, GuidelineDialog } from '@/features/guideline'
import type { ChatChunk, ChatReference } from '@/features/chat/types/chat.types'
import SearchBar from '../components/SearchBar'
import SearchResults from '../components/SearchResults'
import SearchFilters from '../components/SearchFilters'
import SearchDocumentPreviewDrawer from '../components/SearchDocumentPreviewDrawer'
import SearchMindMapDrawer from '../components/SearchMindMapDrawer'
import TagFilterChips from '../components/TagFilterChips'
import { searchApi } from '../api/searchApi'
import { useAccessibleSearchApps } from '../api/searchQueries'
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

  // Search app selection (replaces hardcoded 'default')
  const { apps: searchApps, activeAppId: searchAppId, setActiveAppId } = useAccessibleSearchApps()

  // Paginated search state for non-first pages (avoids re-triggering SSE stream)
  const [paginatedResults, setPaginatedResults] = useState<SearchResult[]>([])
  const [paginatedTotal, setPaginatedTotal] = useState(0)
  const [isPaginating, setIsPaginating] = useState(false)

  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)

  // Document filter state
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])

  // Tag filter state for metadata filtering
  const [tagFilters, setTagFilters] = useState<Record<string, string>>({})

  // Mind map drawer state
  const [mindMapOpen, setMindMapOpen] = useState(false)

  // Document preview drawer state
  const [previewDoc, setPreviewDoc] = useState<{
    open: boolean
    result: SearchResult | null
  }>({ open: false, result: null })

  // Whether user has performed a search (show results layout vs landing)
  const hasSearched = !!searchStream.lastQuery

  /**
   * Build ChatReference from search stream chunks for CitationInline.
   * Maps SearchResult[] to ChatChunk[] and doc_aggs format.
   */
  const buildReference = (): ChatReference | undefined => {
    if (!searchStream.chunks.length) return undefined
    const chatChunks: ChatChunk[] = searchStream.chunks.map((c) => ({
      chunk_id: c.chunk_id,
      content_with_weight: c.content_with_weight || c.content,
      doc_id: c.doc_id,
      docnm_kwd: c.doc_name,
      page_num_int: Array.isArray(c.page_num) ? (c.page_num[0] ?? 0) : c.page_num,
      position_int: Array.isArray(c.position) ? (c.position[0] ?? 0) : c.position,
      positions: c.positions,
      score: c.score,
    }))
    return {
      chunks: chatChunks,
      doc_aggs: searchStream.docAggs.map((d) => ({
        doc_id: d.doc_id,
        doc_name: d.doc_name,
        count: d.count,
      })),
    }
  }

  /**
   * Handle citation click from CitationInline - open document preview.
   * @param chunk - The clicked ChatChunk from the citation
   */
  const handleCitationClick = (chunk: ChatChunk) => {
    // Map ChatChunk back to a SearchResult for the preview drawer
    // Find matching chunk from stream results for dataset_id
    const matchingChunk = searchStream.chunks.find((c) => c.doc_id === chunk.doc_id)
    const searchResult: SearchResult = {
      chunk_id: chunk.chunk_id,
      content: chunk.content_with_weight,
      content_with_weight: chunk.content_with_weight,
      doc_id: chunk.doc_id,
      doc_name: chunk.docnm_kwd,
      page_num: chunk.page_num_int ?? 0,
      position: chunk.position_int ?? 0,
      score: chunk.score || 0,
      dataset_id: matchingChunk?.dataset_id || '',
      ...(chunk.positions ? { positions: chunk.positions } : {}),
    }
    setPreviewDoc({ open: true, result: searchResult })
  }

  // Show first-visit guide
  useEffect(() => {
    if (isFirstVisit) {
      setShowGuide(true)
    }
  }, [isFirstVisit])

  /**
   * Build metadata_filter conditions from active tag filters.
   * Each active tag becomes an 'eq' condition on 'tag_kwd' field.
   * This format is consumed by buildMetadataFilters() in rag-search.service.ts.
   */
  const buildTagMetadataFilter = (tags: Record<string, string>) => {
    const entries = Object.entries(tags)
    if (entries.length === 0) return undefined
    return {
      logic: 'and' as const,
      conditions: entries.map(([key, value]) => ({
        name: 'tag_kwd',
        comparison_operator: 'eq',
        value: `${key}:${value}`,
      })),
    }
  }

  /**
   * Handle search submission.
   * @param query - Search query text
   */
  const handleSearch = (query: string) => {
    if (!searchAppId) return
    // Reset pagination, document filter, and stale paginated results
    setPage(1)
    setSelectedDocIds([])
    setPaginatedResults([])
    setPaginatedTotal(0)
    searchStream.askSearch(searchAppId, query, {
      ...filters,
      metadata_filter: buildTagMetadataFilter(tagFilters),
      page: 1,
      page_size: pageSize,
    })
  }

  /**
   * Handle filter changes - re-run search with new filters.
   * @param newFilters - Updated filters
   */
  const handleFiltersChange = (newFilters: SearchFiltersType) => {
    setFilters(newFilters)
    // Re-run search with updated filters if a query exists
    if (searchStream.lastQuery && searchAppId) {
      setPage(1)
      searchStream.askSearch(searchAppId, searchStream.lastQuery, {
        ...newFilters,
        metadata_filter: buildTagMetadataFilter(tagFilters),
        page: 1,
        page_size: pageSize,
      })
    }
  }

  /**
   * Handle tag filter changes from TagFilterChips.
   * Re-runs search with updated metadata_filter conditions.
   * @param newTags - Updated tag filter key-value pairs
   */
  const handleTagFilterChange = (newTags: Record<string, string>) => {
    setTagFilters(newTags)
    // Re-run search with updated tag filters if a query exists
    if (searchStream.lastQuery && searchAppId) {
      setPage(1)
      searchStream.askSearch(searchAppId, searchStream.lastQuery, {
        ...filters,
        metadata_filter: buildTagMetadataFilter(newTags),
        page: 1,
        page_size: pageSize,
      })
    }
  }

  /**
   * Handle result card click - open document preview drawer.
   * @param result - The clicked search result
   */
  const handleResultClick = (result: SearchResult) => {
    setPreviewDoc({ open: true, result })
  }

  /**
   * Handle related question click - re-run search with question.
   * @param question - The related question text
   */
  const handleRelatedQuestionClick = (question: string) => {
    if (!searchAppId) return
    setPage(1)
    searchStream.askSearch(searchAppId, question, {
      ...filters,
      metadata_filter: buildTagMetadataFilter(tagFilters),
      page: 1,
      page_size: pageSize,
    })
  }

  /**
   * Handle page change for pagination.
   * @param newPage - New page number
   */
  const handlePageChange = async (newPage: number) => {
    if (!searchStream.lastQuery || !searchAppId) return

    if (newPage === 1) {
      setPage(1)
      searchStream.askSearch(searchAppId, searchStream.lastQuery, {
        ...filters,
        metadata_filter: buildTagMetadataFilter(tagFilters),
        page: 1,
        page_size: pageSize,
      })
    } else {
      setIsPaginating(true)
      try {
        const result = await searchApi.searchByApp(searchAppId, searchStream.lastQuery, {
          ...filters,
          page: newPage,
          page_size: pageSize,
        })
        setPage(newPage)
        setPaginatedResults(result.chunks)
        setPaginatedTotal(result.total)
      } catch {
        // Keep current page and results on error
      } finally {
        setIsPaginating(false)
      }
    }
  }

  // Use paginated results for non-first pages, SSE stream results for page 1
  const displayResults = page === 1 ? searchStream.chunks : paginatedResults
  const streamTotal = searchStream.total || searchStream.chunks.length
  const displayTotal = page === 1 ? streamTotal : paginatedTotal

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

            {/* Tag filter chips (only after search) */}
            {hasSearched && (
              <div className="mt-3 w-full max-w-xl px-4">
                <TagFilterChips
                  activeFilters={tagFilters}
                  onFilterChange={handleTagFilterChange}
                />
              </div>
            )}

            {/* Filter toggle, app badge, and mind map button (only after search) */}
            {hasSearched && (
              <div className="flex items-center gap-2 mt-3">
                {searchApps.length > 1 && (
                  <Badge variant="secondary" className="text-xs">
                    {searchApps.find((a) => a.id === searchAppId)?.name}
                  </Badge>
                )}
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
                  disabled={!searchAppId}
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
                  results={displayResults}
                  isSearching={(searchStream.isStreaming && !searchStream.answer) || isPaginating}
                  summary={searchStream.answer}
                  totalResults={displayTotal}
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
                  reference={buildReference()}
                  onCitationClick={handleCitationClick}
                />
              </div>
            </div>
          )}

          {/* Search app selector */}
          {!hasSearched && searchApps.length > 1 && (
            <div className="flex justify-center mt-4">
              <Select value={searchAppId ?? ''} onValueChange={setActiveAppId}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder={t('search.selectApp')} />
                </SelectTrigger>
                <SelectContent>
                  {searchApps.map((app) => (
                    <SelectItem key={app.id} value={app.id}>
                      {app.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
      {searchAppId && (
        <SearchMindMapDrawer
          open={mindMapOpen}
          onOpenChange={setMindMapOpen}
          searchAppId={searchAppId}
          query={searchStream.lastQuery || ''}
        />
      )}

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
