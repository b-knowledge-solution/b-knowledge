/**
 * @fileoverview TanStack Query hooks for admin histories.
 * Manages chat, search, and agent runs tabs, infinite scrolling, session details, and auto-select.
 * @module features/histories/api/historiesQueries
 */
import { useState, useEffect, useRef } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type {
    FilterState,
    ChatSessionSummary,
    SearchSessionSummary,
    AgentRunSessionSummary,
    ExternalChatHistory,
    ExternalSearchHistory,
    ExternalAgentRunDetail,
    HistoriesTab,
} from '../types/histories.types'
import {
    fetchExternalChatHistory,
    fetchExternalSearchHistory,
    fetchChatSessionDetails,
    fetchSearchSessionDetails,
    fetchAgentRunHistory,
    fetchAgentRunDetails,
} from './historiesApi'
import { queryKeys } from '@/lib/queryKeys'

/** Union type for any selectable session/run item. */
type SelectableItem = ChatSessionSummary | SearchSessionSummary | AgentRunSessionSummary

/**
 * @description Return type for useHistoriesData hook.
 */
export interface UseHistoriesDataReturn {
    activeTab: HistoriesTab
    setActiveTab: (tab: HistoriesTab) => void
    switchTab: (tab: HistoriesTab) => void
    isSidebarOpen: boolean
    setIsSidebarOpen: (open: boolean) => void
    selectedSession: SelectableItem | null
    setSelectedSession: (session: SelectableItem | null) => void
    flattenedData: SelectableItem[]
    isLoading: boolean
    isRefreshing: boolean
    sessionDetails: (ExternalChatHistory | ExternalSearchHistory)[] | undefined
    agentRunDetails: ExternalAgentRunDetail | undefined
    isLoadingDetails: boolean
    loadMoreRef: React.RefObject<HTMLDivElement | null>
    handleRefresh: () => void
}

/**
 * @description Manages tab switching, infinite-scroll data fetching, session selection, and detail loading
 * for chat, search, and agent runs tabs.
 * @param {string} executedSearchQuery - Currently executed search query.
 * @param {FilterState} filters - Current filter state.
 * @returns {UseHistoriesDataReturn} Data state and handlers.
 */
export const useHistoriesData = (
    executedSearchQuery: string,
    filters: FilterState,
): UseHistoriesDataReturn => {
    const [activeTab, setActiveTab] = useState<HistoriesTab>('chat')
    const [isSidebarOpen, setIsSidebarOpen] = useState(true)
    const [selectedSession, setSelectedSession] = useState<SelectableItem | null>(null)
    const loadMoreRef = useRef<HTMLDivElement>(null)

    // Chat infinite query
    const {
        data: chatData,
        fetchNextPage: fetchNextChatPage,
        hasNextPage: hasNextChatPage,
        isFetchingNextPage: isFetchingNextChatPage,
        isLoading: isLoadingChat,
        refetch: refetchChat,
        isRefetching: isRefetchingChat,
    } = useInfiniteQuery({
        queryKey: queryKeys.histories.chatInfinite(executedSearchQuery, filters),
        queryFn: ({ pageParam = 1 }) => fetchExternalChatHistory(executedSearchQuery, filters, pageParam),
        initialPageParam: 1,
        getNextPageParam: (lastPage, allPages) => (lastPage.length === 20 ? allPages.length + 1 : undefined),
        enabled: activeTab === 'chat',
    })

    // Search infinite query
    const {
        data: searchData,
        fetchNextPage: fetchNextSearchPage,
        hasNextPage: hasNextSearchPage,
        isFetchingNextPage: isFetchingNextSearchPage,
        isLoading: isLoadingSearch,
        refetch: refetchSearch,
        isRefetching: isRefetchingSearch,
    } = useInfiniteQuery({
        queryKey: queryKeys.histories.searchInfinite(executedSearchQuery, filters),
        queryFn: ({ pageParam = 1 }) => fetchExternalSearchHistory(executedSearchQuery, filters, pageParam),
        initialPageParam: 1,
        getNextPageParam: (lastPage, allPages) => (lastPage.length === 20 ? allPages.length + 1 : undefined),
        enabled: activeTab === 'search',
    })

    // Agent runs infinite query
    const {
        data: agentRunsData,
        fetchNextPage: fetchNextAgentRunsPage,
        hasNextPage: hasNextAgentRunsPage,
        isFetchingNextPage: isFetchingNextAgentRunsPage,
        isLoading: isLoadingAgentRuns,
        refetch: refetchAgentRuns,
        isRefetching: isRefetchingAgentRuns,
    } = useInfiniteQuery({
        queryKey: queryKeys.histories.agentRunsInfinite(executedSearchQuery, filters),
        queryFn: ({ pageParam = 1 }) => fetchAgentRunHistory(executedSearchQuery, filters, pageParam),
        initialPageParam: 1,
        getNextPageParam: (lastPage, allPages) => (lastPage.length === 20 ? allPages.length + 1 : undefined),
        enabled: activeTab === 'agentRuns',
    })

    // Session details query (for chat and search tabs)
    const selectedSessionId = selectedSession && 'session_id' in selectedSession
        ? selectedSession.session_id
        : ''
    const {
        data: sessionDetails,
        isLoading: isLoadingSessionDetails,
        refetch: refetchDetails,
        isRefetching: isRefetchingDetails,
    } = useQuery<(ExternalChatHistory | ExternalSearchHistory)[]>({
        queryKey: queryKeys.histories.sessionDetails(activeTab, selectedSessionId),
        queryFn: async () => {
            if (!selectedSessionId) return []
            return activeTab === 'chat'
                ? fetchChatSessionDetails(selectedSessionId)
                : fetchSearchSessionDetails(selectedSessionId)
        },
        enabled: !!selectedSessionId && (activeTab === 'chat' || activeTab === 'search'),
    })

    // Agent run details query (for agent runs tab)
    const selectedRunId = selectedSession && 'run_id' in selectedSession
        ? (selectedSession as AgentRunSessionSummary).run_id
        : ''
    const {
        data: agentRunDetails,
        isLoading: isLoadingRunDetails,
        refetch: refetchRunDetails,
        isRefetching: isRefetchingRunDetails,
    } = useQuery<ExternalAgentRunDetail>({
        queryKey: queryKeys.histories.agentRunDetails(selectedRunId),
        queryFn: () => fetchAgentRunDetails(selectedRunId),
        enabled: !!selectedRunId && activeTab === 'agentRuns',
    })

    // Derived values based on active tab
    const isLoading = activeTab === 'chat'
        ? isLoadingChat
        : activeTab === 'search'
            ? isLoadingSearch
            : isLoadingAgentRuns

    const isFetchingNextPage = activeTab === 'chat'
        ? isFetchingNextChatPage
        : activeTab === 'search'
            ? isFetchingNextSearchPage
            : isFetchingNextAgentRunsPage

    const hasNextPage = activeTab === 'chat'
        ? hasNextChatPage
        : activeTab === 'search'
            ? hasNextSearchPage
            : hasNextAgentRunsPage

    const fetchNextPage = activeTab === 'chat'
        ? fetchNextChatPage
        : activeTab === 'search'
            ? fetchNextSearchPage
            : fetchNextAgentRunsPage

    const isRefreshing = activeTab === 'chat'
        ? isRefetchingChat
        : activeTab === 'search'
            ? isRefetchingSearch
            : isRefetchingAgentRuns
    const isRefreshingAll = isRefreshing || isRefetchingDetails || isRefetchingRunDetails

    const isLoadingDetails = activeTab === 'agentRuns' ? isLoadingRunDetails : isLoadingSessionDetails

    // Flatten paginated data
    const flattenedData = (() => {
        if (activeTab === 'chat') return (chatData?.pages?.flat() || []) as SelectableItem[]
        if (activeTab === 'search') return (searchData?.pages?.flat() || []) as SelectableItem[]
        return (agentRunsData?.pages?.flat() || []) as SelectableItem[]
    })()

    // Infinite scroll observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
                    fetchNextPage()
                }
            },
            { threshold: 0.1 },
        )
        if (loadMoreRef.current) observer.observe(loadMoreRef.current)
        return () => observer.disconnect()
    }, [hasNextPage, isFetchingNextPage, fetchNextPage])

    // Auto-select first item when data loads
    useEffect(() => {
        if (!selectedSession && flattenedData.length > 0) {
            const first = flattenedData[0]
            if (first) setSelectedSession(first)
        }
    }, [flattenedData, selectedSession])

    /**
     * @description Switch tab and reset state.
     * @param {HistoriesTab} tab - The tab to switch to.
     */
    const switchTab = (tab: HistoriesTab) => {
        setActiveTab(tab)
        setSelectedSession(null)
    }

    /**
     * @description Refresh current data and details.
     */
    const handleRefresh = () => {
        if (activeTab === 'chat') refetchChat()
        else if (activeTab === 'search') refetchSearch()
        else refetchAgentRuns()

        // Refresh details for the selected item
        if (selectedSession) {
            if (activeTab === 'agentRuns') refetchRunDetails()
            else refetchDetails()
        }
    }

    return {
        activeTab,
        setActiveTab,
        switchTab,
        isSidebarOpen,
        setIsSidebarOpen,
        selectedSession,
        setSelectedSession,
        flattenedData,
        isLoading,
        isRefreshing: isRefreshingAll,
        sessionDetails,
        agentRunDetails,
        isLoadingDetails,
        loadMoreRef,
        handleRefresh,
    }
}
