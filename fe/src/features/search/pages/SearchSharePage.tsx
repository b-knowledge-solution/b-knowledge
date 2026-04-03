/**
 * @fileoverview Standalone search share page for iframe embedding.
 * This page is publicly accessible via embed token — no authentication required.
 * It renders a minimal search UI (search bar, results, related questions)
 * and communicates with the backend through embed API endpoints.
 * @module features/search/pages/SearchSharePage
 */

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Search, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Spotlight } from '@/components/Spotlight'
import SearchBar from '../components/SearchBar'
import SearchResults from '../components/SearchResults'
import { searchEmbedApi } from '../api/searchEmbedApi'
import { useSearchStream } from '../hooks/useSearchStream'
import type { EmbedAppConfig, SearchResult, SearchFilters } from '../types/search.types'

// ============================================================================
// Component
// ============================================================================

/**
 * @description Standalone search page for iframe embedding.
 * Loads app configuration from an embed token, renders a minimal search UI,
 * and uses embed API endpoints for all data fetching.
 *
 * URL params:
 * - `:token` — Embed token from route
 * - `?locale=XX` — Override display locale (en/vi/ja)
 * - `?hide_avatar=true` — Hide app avatar and branding
 * - `?hide_powered_by=true` — Hide "Powered by" footer
 *
 * @returns {JSX.Element} Standalone search embed page
 */
export function SearchSharePage() {
  const { token } = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()
  const { t, i18n } = useTranslation()

  // Extract URL display options
  const hideAvatar = searchParams.get('hide_avatar') === 'true'
  const hidePoweredBy = searchParams.get('hide_powered_by') === 'true'
  const localeParam = searchParams.get('locale')

  // App config state
  const [appConfig, setAppConfig] = useState<EmbedAppConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [configError, setConfigError] = useState<string | null>(null)

  // Pagination state for page 2+ (non-streaming)
  const [paginatedResults, setPaginatedResults] = useState<SearchResult[]>([])
  const [paginatedTotal, setPaginatedTotal] = useState(0)
  const [isPaginating, setIsPaginating] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)

  // Create API overrides so useSearchStream uses embed endpoints
  const apiOverrides: import('../hooks/useSearchStream').SearchStreamApiOverrides | undefined = token
    ? {
        askSearch: (
          _appId: string,
          query: string,
          filters: SearchFilters | Record<string, unknown>,
          signal?: AbortSignal,
        ) => searchEmbedApi.askSearch(token, query, filters as Record<string, unknown>, signal),
      }
    : undefined

  // Initialize the search stream hook with embed API overrides
  const searchStream = useSearchStream(apiOverrides)

  const hasSearched = !!searchStream.lastQuery

  // Apply locale from URL param on mount
  useEffect(() => {
    if (localeParam && ['en', 'vi', 'ja'].includes(localeParam)) {
      i18n.changeLanguage(localeParam)
    }
  }, [localeParam, i18n])

  // Load app configuration from embed token on mount
  useEffect(() => {
    if (!token) {
      setConfigError('Missing embed token')
      setConfigLoading(false)
      return
    }

    let cancelled = false

    async function loadConfig() {
      try {
        setConfigLoading(true)
        setConfigError(null)
        const config = await searchEmbedApi.getConfig(token!)
        if (!cancelled) {
          setAppConfig(config)
        }
      } catch (err) {
        if (!cancelled) {
          setConfigError(
            err instanceof Error ? err.message : 'Failed to load search app configuration',
          )
        }
      } finally {
        if (!cancelled) {
          setConfigLoading(false)
        }
      }
    }

    loadConfig()

    return () => {
      cancelled = true
    }
  }, [token])

  /**
   * Handle search submission from the search bar.
   * Uses the token as the "appId" since the embed API routes by token.
   * @param {string} query - Search query text
   */
  function handleSearch(query: string) {
    if (!token) return

    // Reset pagination state for fresh search
    setPage(1)
    setPaginatedResults([])
    setPaginatedTotal(0)

    // The appId parameter is passed to searchStream but the apiOverrides
    // ignore it and use the token directly
    searchStream.askSearch(token, query)
  }

  /**
   * Handle related question click as a fresh search.
   * @param {string} question - Suggested follow-up question
   */
  function handleRelatedQuestionClick(question: string) {
    handleSearch(question)
  }

  /**
   * Handle pagination for page 2+ using non-streaming search endpoint.
   * @param {number} newPage - Requested page number
   */
  async function handlePageChange(newPage: number) {
    if (!token || !searchStream.lastQuery) return

    // Page 1 uses the streaming endpoint
    if (newPage === 1) {
      handleSearch(searchStream.lastQuery)
      return
    }

    setIsPaginating(true)
    try {
      const result = await searchEmbedApi.search(token, searchStream.lastQuery, {
        page: newPage,
        page_size: pageSize,
      })
      setPage(newPage)
      setPaginatedResults(result.chunks)
      setPaginatedTotal(result.total)
    } catch {
      // Silently fail pagination — the user can retry
    } finally {
      setIsPaginating(false)
    }
  }

  // Select which results to display based on current page
  const displayResults = page === 1 ? searchStream.chunks : paginatedResults
  const streamTotal = searchStream.total || searchStream.chunks.length
  const displayTotal = page === 1 ? streamTotal : paginatedTotal || streamTotal

  // Loading state while fetching app config
  if (configLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  // Error state for invalid or expired token
  if (configError || !appConfig) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4 px-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h1 className="text-lg font-semibold text-foreground">
          {t('common.error')}
        </h1>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          {configError || 'Unable to load search app configuration.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Main content area */}
      <div className="flex-1 flex flex-col">
        {/* Header / Landing section */}
        <div
          className={cn(
            'flex flex-col items-center transition-all duration-500',
            hasSearched
              ? 'pt-6 pb-4 border-b bg-muted/20'
              : 'flex-1 justify-center pb-20',
          )}
        >
          {/* Avatar and branding (pre-search, unless hidden) */}
          {!hasSearched && !hideAvatar && (
            <div className="relative">
              <Spotlight className="z-0" />
              <div className="flex flex-col items-center gap-3 mb-8 relative z-10">
                {appConfig.avatar ? (
                  <span className="text-5xl">{appConfig.avatar}</span>
                ) : (
                  <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center">
                    <Search className="h-10 w-10 text-primary" />
                  </div>
                )}
                <h1 className="text-2xl font-bold text-foreground text-center">
                  {appConfig.name}
                </h1>
                {appConfig.description && (
                  <p className="text-sm text-muted-foreground max-w-md text-center">
                    {appConfig.description}
                  </p>
                )}
              </div>
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

          {/* Compact header after search */}
          {hasSearched && !hideAvatar && (
            <div className="flex items-center gap-2 mt-3">
              {appConfig.name && (
                <Badge variant="secondary" className="text-xs">
                  {appConfig.avatar && <span className="mr-1">{appConfig.avatar}</span>}
                  {appConfig.name}
                </Badge>
              )}
            </div>
          )}

          {/* Locale pills */}
          {!hasSearched && (
            <div className="flex items-center gap-2 mt-4">
              {(['en', 'vi', 'ja'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => i18n.changeLanguage(lang)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs transition-colors',
                    i18n.language === lang
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80',
                  )}
                >
                  {lang === 'en' ? 'EN' : lang === 'vi' ? 'VI' : 'JA'}
                </button>
              ))}
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
                error={searchStream.error}
                streamingAnswer={searchStream.answer}
                relatedQuestions={
                  appConfig.search_config?.enable_related_questions === false
                    ? []
                    : searchStream.relatedQuestions
                }
                onRelatedQuestionClick={handleRelatedQuestionClick}
                isStreamingAnswer={searchStream.isStreaming}
                docAggs={page === 1 ? searchStream.docAggs : []}
                pipelineStatus={searchStream.pipelineStatus}
                onStopStream={searchStream.stopStream}
                page={page}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                emptyMessage={appConfig.empty_response ?? undefined}
              />
            </div>
          </div>
        )}
      </div>

      {/* Powered by footer */}
      {!hidePoweredBy && (
        <footer className="py-3 text-center border-t">
          <span className="text-xs text-muted-foreground">
            {t('search.poweredBy')}
          </span>
        </footer>
      )}
    </div>
  )
}

export default SearchSharePage
