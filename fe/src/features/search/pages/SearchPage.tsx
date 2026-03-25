/**
 * @fileoverview Search application page with app-aware routing, streaming answers,
 * retrieval filters, document preview, and admin controls.
 * @module features/search/pages/SearchPage
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Search, Database, Brain, Settings2, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/features/auth'
import { useFirstVisit, GuidelineDialog } from '@/features/guideline'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { globalMessage } from '@/app/App'
import type { ChatChunk, ChatReference } from '@/features/chat/types/chat.types'
import SearchBar from '../components/SearchBar'
import SearchResults from '../components/SearchResults'
import SearchFilters from '../components/SearchFilters'
import SearchResultDocDialog from '../components/SearchResultDocDialog'
import SearchMindMapDrawer from '../components/SearchMindMapDrawer'
import TagFilterChips from '../components/TagFilterChips'
import SearchAppConfig from '../components/SearchAppConfig'
import SearchAppEmbedDialog from '../components/SearchAppEmbedDialog'
import { searchApi } from '../api/searchApi'
import { useAccessibleSearchApps, useSearchAppDetail, useSendSearchFeedback } from '../api/searchQueries'
import { useSearchStream } from '../hooks/useSearchStream'
import type {
  SearchApp,
  SearchAppConfig as SearchAppConfigType,
  SearchFilters as SearchFiltersType,
  SearchResult,
  CreateSearchAppPayload,
} from '../types/search.types'

/**
 * @description Build runtime search filters from a search app configuration.
 * @param {SearchAppConfigType | undefined} config - Search app configuration
 * @returns {SearchFiltersType} Default runtime filter state
 */
function buildDefaultFilters(config?: SearchAppConfigType): SearchFiltersType {
  const filters: SearchFiltersType = {}

  if (config?.search_method) {
    filters.search_method = config.search_method
  }
  if (config?.similarity_threshold !== undefined) {
    filters.similarity_threshold = config.similarity_threshold
  }
  if (config?.top_k !== undefined) {
    filters.top_k = config.top_k
  }
  if (config?.vector_similarity_weight !== undefined) {
    filters.vector_similarity_weight = config.vector_similarity_weight
  }

  return filters
}

/**
 * @description Build metadata filter conditions from active tag filters.
 * Each active tag becomes an exact-match condition on the `tag_kwd` field.
 * @param {Record<string, string>} tags - Active tag key/value pairs
 * @returns {SearchFiltersType['metadata_filter']} Metadata filter payload
 */
function buildTagMetadataFilter(tags: Record<string, string>): SearchFiltersType['metadata_filter'] {
  const entries = Object.entries(tags)
  if (entries.length === 0) return undefined

  return {
    logic: 'and',
    conditions: entries.map(([key, value]) => ({
      name: 'tag_kwd',
      comparison_operator: 'is',
      value: `${key}:${value}`,
    })),
  }
}

/**
 * @description Merge base runtime filters with tag and document filters for API requests.
 * @param {SearchFiltersType} filters - Runtime filter state
 * @param {Record<string, string>} tagFilters - Active tag filters
 * @param {string[]} selectedDocIds - Selected document IDs
 * @param {number} page - Requested page
 * @param {number} pageSize - Requested page size
 * @returns {SearchFiltersType} API-ready request payload
 */
function buildRequestFilters(
  filters: SearchFiltersType,
  tagFilters: Record<string, string>,
  selectedDocIds: string[],
  page: number,
  pageSize: number,
): SearchFiltersType {
  const requestFilters: SearchFiltersType = {
    ...filters,
    page,
    page_size: pageSize,
  }

  const tagMetadataFilter = buildTagMetadataFilter(tagFilters)
  if (tagMetadataFilter) {
    requestFilters.metadata_filter = tagMetadataFilter
  }
  if (selectedDocIds.length > 0) {
    requestFilters.doc_ids = selectedDocIds
  }

  return requestFilters
}

/**
 * @description Search page with route-based app identity, app-aware controls,
 * streaming answer handling, and server-backed retrieval filtering.
 * @returns {JSX.Element} Rendered search page
 */
function DatasetSearchPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { appId } = useParams<{ appId: string }>()
  const [urlParams, setUrlParams] = useSearchParams()
  const { user } = useAuth()
  const { isFirstVisit } = useFirstVisit('ai-search')
  const [showGuide, setShowGuide] = useState(false)
  const searchStream = useSearchStream()
  const sendFeedback = useSendSearchFeedback()
  const canManageApps = user?.role === 'admin' || user?.role === 'super-admin'

  const requestedQuery = urlParams.get('q') || ''
  const { apps: searchApps, activeAppId, setActiveAppId } = useAccessibleSearchApps()
  const resolvedAppId = appId || activeAppId
  const { data: currentApp } = useSearchAppDetail(resolvedAppId)

  const [filters, setFilters] = useState<SearchFiltersType>({})
  const [showFilters, setShowFilters] = useState(false)
  const [paginatedResults, setPaginatedResults] = useState<SearchResult[]>([])
  const [paginatedTotal, setPaginatedTotal] = useState(0)
  const [paginatedDocAggs, setPaginatedDocAggs] = useState<Array<{ doc_id: string; doc_name: string; count: number }>>([])
  const [isPaginating, setIsPaginating] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [tagFilters, setTagFilters] = useState<Record<string, string>>({})
  const [mindMapOpen, setMindMapOpen] = useState(false)
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [isEmbedOpen, setIsEmbedOpen] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<{
    open: boolean
    result: SearchResult | null
  }>({ open: false, result: null })
  const hydratedSearchKeyRef = useRef<string | null>(null)

  const { data: rawDatasets = [] } = useQuery({
    queryKey: queryKeys.datasets.list(),
    queryFn: () => api.get<{ id: string; name: string; doc_count?: number }[]>('/api/rag/datasets'),
    enabled: canManageApps,
  })
  const { data: rawProjects = [] } = useQuery({
    queryKey: queryKeys.projects.all,
    queryFn: () => api.get<{ id: string; name: string; dataset_count?: number }[]>('/api/projects'),
    enabled: canManageApps,
  })

  const datasetItems = rawDatasets.map((d) => ({
    id: d.id, name: d.name, type: 'dataset' as const, docCount: d.doc_count,
  }))
  const projectItems = rawProjects.map((p) => ({
    id: p.id, name: p.name, type: 'project' as const, docCount: p.dataset_count,
  }))

  const hasSearched = !!searchStream.lastQuery
  const currentAppName = currentApp?.name || searchApps.find((app) => app.id === resolvedAppId)?.name
  const currentAppDescription = currentApp?.description || null
  // Use app-configured empty response or fall back to default i18n key
  const emptyMessage = currentApp?.empty_response ?? undefined

  /**
   * Persist the current query in the URL without disturbing the active app route.
   * @param {string} query - Search query to persist
   */
  const updateQueryParam = (query: string) => {
    const next = new URLSearchParams(urlParams)
    if (query) {
      next.set('q', query)
    } else {
      next.delete('q')
    }
    setUrlParams(next, { replace: true })
  }

  /**
   * Build citation reference data for the current streamed chunks.
   * @returns {ChatReference | undefined} Reference payload for citation rendering
   */
  const buildReference = (): ChatReference | undefined => {
    if (!searchStream.chunks.length) return undefined

    return {
      chunks: searchStream.chunks.map((chunk) => ({
        chunk_id: chunk.chunk_id,
        content_with_weight: chunk.content_with_weight || chunk.content,
        doc_id: chunk.doc_id,
        docnm_kwd: chunk.doc_name,
        page_num_int: Array.isArray(chunk.page_num) ? (chunk.page_num[0] ?? 0) : chunk.page_num,
        position_int: Array.isArray(chunk.position) ? (chunk.position[0] ?? 0) : chunk.position,
        positions: chunk.positions,
        score: chunk.score,
      })),
      doc_aggs: searchStream.docAggs.map((doc) => ({
        doc_id: doc.doc_id,
        doc_name: doc.doc_name,
        count: doc.count,
      })),
    }
  }

  /**
   * Execute a fresh search request and reset secondary result state.
   * @param {string} query - Query text
   * @param {SearchFiltersType} [runtimeFilters] - Runtime filters to apply
   * @param {Record<string, string>} [runtimeTagFilters] - Tag filters to apply
   * @param {string[]} [runtimeDocIds] - Document IDs to constrain retrieval to
   */
  const executeFreshSearch = (
    query: string,
    runtimeFilters: SearchFiltersType = filters,
    runtimeTagFilters: Record<string, string> = tagFilters,
    runtimeDocIds: string[] = selectedDocIds,
  ) => {
    if (!resolvedAppId) return

    setPage(1)
    setPaginatedResults([])
    setPaginatedTotal(0)
    setPaginatedDocAggs([])
    updateQueryParam(query)
    searchStream.askSearch(
      resolvedAppId,
      query,
      buildRequestFilters(runtimeFilters, runtimeTagFilters, runtimeDocIds, 1, pageSize),
    )
  }

  /**
   * Save search app configuration updates from the in-page admin dialog.
   * @param {CreateSearchAppPayload} data - Updated app payload
   */
  const handleSaveConfig = async (data: CreateSearchAppPayload) => {
    if (!currentApp) return

    try {
      await searchApi.updateSearchApp(currentApp.id, data)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.search.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.search.detail(currentApp.id) }),
      ])
      globalMessage.success(t('common.updateSuccess'))
    } catch (error: any) {
      globalMessage.error(error?.message || t('common.error'))
    }
  }

  /**
   * Submit feedback for the current answer or a specific result card.
   * @param {boolean} thumbup - Whether the feedback is positive
   * @param {SearchResult} [result] - Optional specific result context
   */
  const handleFeedback = async (thumbup: boolean, result?: SearchResult) => {
    if (!resolvedAppId || !searchStream.lastQuery) return

    try {
      await sendFeedback.mutateAsync({
        searchAppId: resolvedAppId,
        thumbup,
        query: searchStream.lastQuery,
        answer: searchStream.answer || '',
        chunksUsed: (result ? [result] : (page === 1 ? searchStream.chunks : paginatedResults)).map((chunk) => ({
          chunk_id: chunk.chunk_id,
          doc_id: chunk.doc_id,
          score: chunk.score,
        })),
      })
      globalMessage.success(t('search.feedbackThankYou'))
    } catch (error: any) {
      globalMessage.error(error?.message || t('common.error'))
    }
  }

  /**
   * Handle citation clicks from the AI summary, opening document preview for the source chunk.
   * @param {ChatChunk} chunk - Citation chunk selected by the user
   */
  const handleCitationClick = (chunk: ChatChunk) => {
    const matchingChunk = searchStream.chunks.find((candidate) => candidate.doc_id === chunk.doc_id)
    setPreviewDoc({
      open: true,
      result: {
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
      },
    })
  }

  // Show the first-visit guideline once per user.
  useEffect(() => {
    if (isFirstVisit) {
      setShowGuide(true)
    }
  }, [isFirstVisit])

  // Sync route-driven app selection into the shared app list state.
  useEffect(() => {
    if (appId) {
      setActiveAppId(appId)
    }
  }, [appId, setActiveAppId])

  // Reset runtime filters and search state when the active app changes.
  useEffect(() => {
    if (!currentApp) return

    setFilters(buildDefaultFilters(currentApp.search_config))
    setTagFilters({})
    setSelectedDocIds([])
    setPage(1)
    setPaginatedResults([])
    setPaginatedTotal(0)
    setPaginatedDocAggs([])
    hydratedSearchKeyRef.current = null
  }, [currentApp?.id])

  // Hydrate a query from the URL once the active app is known.
  useEffect(() => {
    if (!currentApp || !requestedQuery) return

    const hydrationKey = `${currentApp.id}:${requestedQuery}`
    if (hydratedSearchKeyRef.current === hydrationKey) return

    hydratedSearchKeyRef.current = hydrationKey
    const defaultFilters = buildDefaultFilters(currentApp.search_config)
    setFilters(defaultFilters)
    executeFreshSearch(requestedQuery, defaultFilters, {}, [])
  }, [currentApp?.id, requestedQuery])

  /**
   * Handle the landing-page search app selector by navigating to the app route.
   * @param {string} nextAppId - Selected search app ID
   */
  const handleSelectApp = (nextAppId: string) => {
    setActiveAppId(nextAppId)
    navigate({
      pathname: `/search/apps/${nextAppId}`,
      search: requestedQuery ? `?q=${encodeURIComponent(requestedQuery)}` : '',
    })
  }

  /**
   * Handle search submission from the search bar.
   * @param {string} query - Query text
   */
  const handleSearch = (query: string) => {
    executeFreshSearch(query)
  }

  /**
   * Re-run the current query when runtime retrieval filters change.
   * @param {SearchFiltersType} newFilters - Updated filter state
   */
  const handleFiltersChange = (newFilters: SearchFiltersType) => {
    setFilters(newFilters)
    if (searchStream.lastQuery) {
      executeFreshSearch(searchStream.lastQuery, newFilters)
    }
  }

  /**
   * Re-run the current query when tag filters change.
   * @param {Record<string, string>} newTags - Updated tag filters
   */
  const handleTagFilterChange = (newTags: Record<string, string>) => {
    setTagFilters(newTags)
    if (searchStream.lastQuery) {
      executeFreshSearch(searchStream.lastQuery, filters, newTags)
    }
  }

  /**
   * Re-run retrieval when the document scope changes.
   * @param {string[]} newDocIds - Selected document IDs
   */
  const handleDocFilterChange = (newDocIds: string[]) => {
    setSelectedDocIds(newDocIds)
    if (searchStream.lastQuery) {
      executeFreshSearch(searchStream.lastQuery, filters, tagFilters, newDocIds)
    }
  }

  /**
   * Open a search result in the document preview dialog.
   * @param {SearchResult} result - Search result selected by the user
   */
  const handleResultClick = (result: SearchResult) => {
    setPreviewDoc({ open: true, result })
  }

  /**
   * Handle a related-question click by treating it as a fresh search.
   * @param {string} question - Suggested follow-up question
   */
  const handleRelatedQuestionClick = (question: string) => {
    executeFreshSearch(question)
  }

  /**
   * Handle pagination using the non-streaming search endpoint for pages > 1.
   * @param {number} newPage - Requested page number
   */
  const handlePageChange = async (newPage: number) => {
    if (!searchStream.lastQuery || !resolvedAppId) return

    if (newPage === 1) {
      executeFreshSearch(searchStream.lastQuery)
      return
    }

    setIsPaginating(true)
    try {
      const result = await searchApi.searchByApp(
        resolvedAppId,
        searchStream.lastQuery,
        buildRequestFilters(filters, tagFilters, selectedDocIds, newPage, pageSize),
      )
      setPage(newPage)
      setPaginatedResults(result.chunks)
      setPaginatedTotal(result.total)
      setPaginatedDocAggs(result.doc_aggs || [])
    } catch (error: any) {
      globalMessage.error(error?.message || t('common.error'))
    } finally {
      setIsPaginating(false)
    }
  }

  const displayResults = page === 1 ? searchStream.chunks : paginatedResults
  const streamTotal = searchStream.total || searchStream.chunks.length
  const displayTotal = page === 1 ? streamTotal : paginatedTotal || streamTotal
  const displayDocAggs = page === 1 ? searchStream.docAggs : paginatedDocAggs

  return (
    <>
      <div className="flex h-full w-full overflow-hidden">
        {hasSearched && showFilters && (
          <SearchFilters
            filters={filters}
            onFiltersChange={handleFiltersChange}
            showScopeFilters={false}
            visible={showFilters}
            onToggle={() => setShowFilters(!showFilters)}
            className="hidden md:block"
          />
        )}

        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <div
            className={cn(
              'flex flex-col items-center transition-all duration-500',
              hasSearched
                ? 'pt-6 pb-4 border-b bg-muted/20'
                : 'flex-1 justify-center pb-20',
            )}
          >
            {!hasSearched && (
              <div className="flex flex-col items-center gap-3 mb-8">
                {/* Show app avatar emoji or default search icon */}
                {currentApp?.avatar ? (
                  <span className="text-5xl">{currentApp.avatar}</span>
                ) : (
                  <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center">
                    <Search className="h-10 w-10 text-primary" />
                  </div>
                )}
                <h1 className="text-2xl font-bold text-foreground text-center">
                  {currentAppName || (user?.name
                    ? `${t('search.greeting')}, ${user.name}`
                    : t('search.title'))}
                </h1>
                <p className="text-sm text-muted-foreground max-w-md text-center">
                  {currentAppDescription || t('search.description')}
                </p>
              </div>
            )}

            <SearchBar
              onSearch={handleSearch}
              isSearching={searchStream.isStreaming}
              isStreaming={searchStream.isStreaming}
              onStop={searchStream.stopStream}
              defaultValue={searchStream.lastQuery || requestedQuery}
              className={hasSearched ? 'max-w-xl' : 'max-w-2xl'}
            />

            {hasSearched && (
              <div className="mt-3 w-full max-w-xl px-4">
                <TagFilterChips
                  activeFilters={tagFilters}
                  onFilterChange={handleTagFilterChange}
                />
              </div>
            )}

            {hasSearched && (
              <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
                {currentAppName && (
                  <Badge variant="secondary" className="text-xs">
                    {/* Show avatar alongside app name in compact search header */}
                    {currentApp?.avatar && <span className="mr-1">{currentApp.avatar}</span>}
                    {currentAppName}
                  </Badge>
                )}

                <SearchFilters
                  filters={filters}
                  onFiltersChange={handleFiltersChange}
                  showScopeFilters={false}
                  visible={false}
                  onToggle={() => setShowFilters(!showFilters)}
                />

                {currentApp?.search_config?.enable_mindmap && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMindMapOpen(true)}
                    disabled={!resolvedAppId}
                    title={t('search.mindMap')}
                  >
                    <Brain className="h-4 w-4 mr-1.5" />
                    {t('search.mindMap')}
                  </Button>
                )}

                {canManageApps && currentApp && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsConfigOpen(true)}
                      title={t('searchAdmin.editApp')}
                    >
                      <Settings2 className="h-4 w-4 mr-1.5" />
                      {t('searchAdmin.editApp')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEmbedOpen(true)}
                      title={t('searchAdmin.embedApp')}
                    >
                      <KeyRound className="h-4 w-4 mr-1.5" />
                      {t('searchAdmin.embedApp')}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

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
                  relatedQuestions={currentApp?.search_config?.enable_related_questions === false
                    ? []
                    : searchStream.relatedQuestions}
                  onRelatedQuestionClick={handleRelatedQuestionClick}
                  isStreamingAnswer={searchStream.isStreaming}
                  docAggs={displayDocAggs}
                  selectedDocIds={selectedDocIds}
                  onDocFilterChange={handleDocFilterChange}
                  pipelineStatus={searchStream.pipelineStatus}
                  onStopStream={searchStream.stopStream}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={handlePageChange}
                  reference={buildReference()}
                  onCitationClick={handleCitationClick}
                  onFeedback={handleFeedback}
                  emptyMessage={emptyMessage}
                />
              </div>
            </div>
          )}

          {!hasSearched && searchApps.length > 1 && (
            <div className="flex justify-center mt-4">
              <Select value={resolvedAppId ?? ''} onValueChange={handleSelectApp}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder={t('search.selectApp')} />
                </SelectTrigger>
                <SelectContent>
                  {searchApps.map((app: SearchApp) => (
                    <SelectItem key={app.id} value={app.id}>
                      {app.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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

      <SearchResultDocDialog
        open={previewDoc.open}
        onClose={() => setPreviewDoc({ open: false, result: null })}
        documentId={previewDoc.result?.doc_id}
        documentName={previewDoc.result?.doc_name}
        datasetId={previewDoc.result?.dataset_id}
      />

      {resolvedAppId && currentApp?.search_config?.enable_mindmap && (
        <SearchMindMapDrawer
          open={mindMapOpen}
          onOpenChange={setMindMapOpen}
          searchAppId={resolvedAppId}
          query={searchStream.lastQuery || requestedQuery}
        />
      )}

      <SearchAppConfig
        open={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        onSave={handleSaveConfig}
        app={currentApp ?? null}
        datasets={datasetItems}
        projects={projectItems}
      />

      <SearchAppEmbedDialog
        open={isEmbedOpen}
        onClose={() => setIsEmbedOpen(false)}
        app={currentApp ?? null}
      />

      <GuidelineDialog
        open={showGuide}
        onClose={() => setShowGuide(false)}
        featureId="ai-search"
      />
    </>
  )
}

export default DatasetSearchPage
