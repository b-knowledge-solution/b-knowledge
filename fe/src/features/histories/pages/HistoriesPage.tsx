/**
 * @fileoverview Admin Histories page component.
 * Displays system-wide chat, search, and agent run history with filtering,
 * feedback indicators, and CSV export.
 *
 * @module features/histories/pages/HistoriesPage
 */
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquare, PanelLeft, Bot } from 'lucide-react'

import { useFirstVisit, GuidelineDialog } from '@/features/guideline'
import { EmptyState } from '@/features/histories/components/EmptyState'
import type {
    ChatSessionSummary,
    SearchSessionSummary,
    AgentRunSessionSummary,
    ExternalChatHistory,
    ExternalSearchHistory,
    HistoriesTab,
} from '../types/histories.types'
import { useHistoriesFilters } from '../hooks/useHistoriesFilters'
import { useHistoriesData } from '../api/historiesQueries'
import { AdminSessionListSidebar } from '../components/AdminSessionListSidebar'
import { AdminFilterDialog } from '../components/AdminFilterDialog'
import { AdminChatDetailView } from '../components/AdminChatDetailView'
import { AdminSearchDetailView } from '../components/AdminSearchDetailView'
import { AdminAgentRunsDetailView } from '../components/AdminAgentRunsDetailView'
import { FeedbackExportButton } from '../components/FeedbackExportButton'

/**
 * @description HistoriesPage Component.
 *
 * Admin page to view system-wide chat, search, and agent run history with:
 * - Chat / Search / Agent Runs tab switcher
 * - Infinite scrolling sessions with user email badges and feedback indicators
 * - Email, sourceName, feedback, and date range filters
 * - Detailed session/run view with read-only feedback display
 * - CSV feedback export button
 * - First-visit guideline dialog
 * @returns {JSX.Element} Rendered Histories page
 */
function HistoriesPage() {
    const { t } = useTranslation()

    // Guideline dialog for first-time visitors
    const { isFirstVisit } = useFirstVisit('global-histories')
    const [showGuide, setShowGuide] = useState(false)
    useEffect(() => {
        if (isFirstVisit) setShowGuide(true)
    }, [isFirstVisit])

    // Filter and search state
    const filterState = useHistoriesFilters()

    // Data fetching, tab management, and session state
    const dataState = useHistoriesData(filterState.executedSearchQuery, filterState.filters)

    /**
     * @description Handle tab switch -- also resets search/filters.
     * @param {HistoriesTab} tab - Target tab.
     */
    const handleTabSwitch = (tab: HistoriesTab) => {
        dataState.switchTab(tab)
        filterState.setSearchQuery('')
        filterState.handleResetFilters()
    }

    /**
     * @description Render the appropriate detail view based on the active tab and selected item.
     * @returns {JSX.Element} Detail view component for the selected session/run.
     */
    const renderDetailView = () => {
        if (!dataState.selectedSession) return null

        // Agent Runs tab -- render agent run detail view
        if (dataState.activeTab === 'agentRuns') {
            return (
                <AdminAgentRunsDetailView
                    run={dataState.selectedSession as AgentRunSessionSummary}
                    details={dataState.agentRunDetails}
                    isLoadingDetails={dataState.isLoadingDetails}
                    isSidebarOpen={dataState.isSidebarOpen}
                    onOpenSidebar={() => dataState.setIsSidebarOpen(true)}
                />
            )
        }

        // Chat tab -- render chat detail view
        if (dataState.activeTab === 'chat') {
            return (
                <AdminChatDetailView
                    session={dataState.selectedSession as ChatSessionSummary}
                    details={(dataState.sessionDetails || []) as ExternalChatHistory[]}
                    isLoadingDetails={dataState.isLoadingDetails}
                    searchQuery={filterState.executedSearchQuery}
                    isSidebarOpen={dataState.isSidebarOpen}
                    onOpenSidebar={() => dataState.setIsSidebarOpen(true)}
                />
            )
        }

        // Search tab -- render search detail view
        return (
            <AdminSearchDetailView
                session={dataState.selectedSession as SearchSessionSummary}
                details={(dataState.sessionDetails || []) as ExternalSearchHistory[]}
                isLoadingDetails={dataState.isLoadingDetails}
                searchQuery={filterState.executedSearchQuery}
                isSidebarOpen={dataState.isSidebarOpen}
                onOpenSidebar={() => dataState.setIsSidebarOpen(true)}
            />
        )
    }

    return (
        <div className="flex h-full bg-slate-50/50 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800 backdrop-blur-sm">
            {/* Sidebar */}
            <AdminSessionListSidebar
                isOpen={dataState.isSidebarOpen}
                onClose={() => dataState.setIsSidebarOpen(false)}
                activeTab={dataState.activeTab}
                onSwitchTab={handleTabSwitch}
                searchQuery={filterState.searchQuery}
                onSearchChange={filterState.setSearchQuery}
                onSearch={(e) => { filterState.handleSearch(e); dataState.setSelectedSession(null) }}
                executedSearchQuery={filterState.executedSearchQuery}
                isRefreshing={dataState.isRefreshing}
                onRefresh={dataState.handleRefresh}
                isFiltered={filterState.isFiltered}
                onFilterClick={filterState.openFilterDialog}
                isLoading={dataState.isLoading}
                items={dataState.flattenedData}
                selectedSession={dataState.selectedSession}
                onItemClick={(item) => dataState.setSelectedSession(item)}
                loadMoreRef={dataState.loadMoreRef}
                onResetSearch={() => { filterState.setSearchQuery(''); filterState.handleResetFilters() }}
            />

            {/* Main Content */}
            <div className="flex-1 relative overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col">
                {/* Export button in top-right corner */}
                <div className="absolute top-4 right-4 z-10">
                    <FeedbackExportButton filters={filterState.filters} />
                </div>

                {dataState.selectedSession ? (
                    renderDetailView()
                ) : (
                    <div className="flex-1 flex flex-col">
                        {!dataState.isSidebarOpen && (
                            <button
                                onClick={() => dataState.setIsSidebarOpen(true)}
                                className="absolute top-4 left-4 p-2 rounded-lg text-slate-500 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition-all z-10"
                                title={t('nav.expandMenu')}
                            >
                                <PanelLeft size={24} />
                            </button>
                        )}
                        <EmptyState
                            icon={dataState.activeTab === 'agentRuns' ? Bot : MessageSquare}
                            title={dataState.activeTab === 'agentRuns'
                                ? t('histories.agentRuns.emptyTitle', 'No agent runs found')
                                : t('histories.noSessionSelected', 'No Session Selected')
                            }
                            subtitle={dataState.activeTab === 'agentRuns'
                                ? t('histories.agentRuns.emptyDescription', 'Agent runs will appear here once agents have been executed.')
                                : t('histories.selectSessionHint', 'Select a conversation or search session from the sidebar to view details.')
                            }
                            glowColor={dataState.activeTab === 'agentRuns' ? 'rgba(139,92,246,0.3)' : 'rgba(120,119,198,0.3)'}
                        />
                    </div>
                )}
            </div>

            {/* Filter Dialog */}
            <AdminFilterDialog
                open={filterState.isFilterDialogOpen}
                onClose={() => filterState.setIsFilterDialogOpen(false)}
                tempFilters={filterState.tempFilters}
                setTempFilters={filterState.setTempFilters}
                onApply={filterState.handleApplyFilters}
                onReset={filterState.handleResetFilters}
            />

            {/* First Visit Guideline */}
            <GuidelineDialog
                open={showGuide}
                onClose={() => setShowGuide(false)}
                featureId="global-histories"
            />
        </div>
    )
}

export default HistoriesPage
