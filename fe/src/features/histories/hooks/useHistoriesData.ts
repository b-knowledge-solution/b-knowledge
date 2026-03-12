/**
 * @fileoverview Data fetching hook for admin histories.
 * Manages both chat and search tabs, infinite scrolling, session details, and auto-select.
 *
 * @module features/histories/hooks/useHistoriesData
 */
import { useState, useEffect, useRef } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type {
    FilterState,
    ChatSessionSummary,
    SearchSessionSummary,
    ExternalChatHistory,
    ExternalSearchHistory,
    HistoriesTab,
} from '../types/histories.types'
import {
    fetchExternalChatHistory,
    fetchExternalSearchHistory,
    fetchChatSessionDetails,
    fetchSearchSessionDetails,
} from '../api/historiesService'
import { queryKeys } from '@/lib/queryKeys'

/**
 * Return type for useHistoriesData hook.
 */
export interface UseHistoriesDataReturn {
    activeTab: HistoriesTab
    setActiveTab: (tab: HistoriesTab) => void
    switchTab: (tab: HistoriesTab) => void
    isSidebarOpen: boolean
    setIsSidebarOpen: (open: boolean) => void
    selectedSession: ChatSessionSummary | SearchSessionSummary | null
    setSelectedSession: (session: ChatSessionSummary | SearchSessionSummary | null) => void
    flattenedData: (ChatSessionSummary | SearchSessionSummary)[]
    isLoading: boolean
    isRefreshing: boolean
    sessionDetails: (ExternalChatHistory | ExternalSearchHistory)[] | undefined
    isLoadingDetails: boolean
    loadMoreRef: React.RefObject<HTMLDivElement | null>
    handleRefresh: () => void
}

/**
 * Manages tab switching, infinite-scroll data fetching, session selection, and detail loading.
 * @param executedSearchQuery - Currently executed search query.
 * @param filters - Current filter state.
 * @returns Data state and handlers.
 */
export const useHistoriesData = (
    executedSearchQuery: string,
    filters: FilterState,
): UseHistoriesDataReturn => {
    const [activeTab, setActiveTab] = useState<HistoriesTab>('chat')
    const [isSidebarOpen, setIsSidebarOpen] = useState(true)
    const [selectedSession, setSelectedSession] = useState<ChatSessionSummary | SearchSessionSummary | null>(null)
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

    // Session details query
    const {
        data: sessionDetails,
        isLoading: isLoadingDetails,
        refetch: refetchDetails,
        isRefetching: isRefetchingDetails,
    } = useQuery<(ExternalChatHistory | ExternalSearchHistory)[]>({
        queryKey: queryKeys.histories.sessionDetails(activeTab, selectedSession?.session_id ?? ''),
        queryFn: async () => {
            if (!selectedSession?.session_id) return []
            return activeTab === 'chat'
                ? fetchChatSessionDetails(selectedSession.session_id)
                : fetchSearchSessionDetails(selectedSession.session_id)
        },
        enabled: !!selectedSession?.session_id,
    })

    // Derived values based on active tab
    const isLoading = activeTab === 'chat' ? isLoadingChat : isLoadingSearch
    const isFetchingNextPage = activeTab === 'chat' ? isFetchingNextChatPage : isFetchingNextSearchPage
    const hasNextPage = activeTab === 'chat' ? hasNextChatPage : hasNextSearchPage
    const fetchNextPage = activeTab === 'chat' ? fetchNextChatPage : fetchNextSearchPage
    const isRefreshing = (activeTab === 'chat' ? isRefetchingChat : isRefetchingSearch) || isRefetchingDetails

    // Flatten paginated data
    const flattenedData = (() => {
        const pages = activeTab === 'chat' ? chatData?.pages : searchData?.pages
        return (pages?.flat() || []) as (ChatSessionSummary | SearchSessionSummary)[]
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

    /** Switch tab and reset state. */
    const switchTab = (tab: HistoriesTab) => {
        setActiveTab(tab)
        setSelectedSession(null)
    }

    /** Refresh current data and details. */
    const handleRefresh = () => {
        if (activeTab === 'chat') refetchChat()
        else refetchSearch()
        if (selectedSession) refetchDetails()
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
        isRefreshing,
        sessionDetails,
        isLoadingDetails,
        loadMoreRef,
        handleRefresh,
    }
}
