/**
 * @fileoverview Admin Dashboard page with 3 tabs: Activity, Query Analytics, RAG Quality.
 * Composes dashboard stat components, charts, and tables under a shared date range picker.
 * @module features/dashboard/pages/AdminDashboardPage
 */
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { subDays, subMonths, subYears, startOfMonth, endOfMonth, format, formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { DateRangePicker, type DateRangePreset } from '@/components/ui/date-range-picker'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { useDashboardStats, useQueryAnalytics, useFeedbackAnalytics, useFeedbackStats } from '../api/dashboardQueries'
import { StatCards } from '../components/StatCards'
import { ActivityTrendChart } from '../components/ActivityTrendChart'
import { TopUsersTable } from '../components/TopUsersTable'
import { UsageBreakdownChart } from '../components/UsageBreakdownChart'
import { SessionsPerDayChart } from '../components/SessionsPerDayChart'
import { QueryAnalyticsCards } from '../components/QueryAnalyticsCards'
import { QueriesOverTimeChart } from '../components/QueriesOverTimeChart'
import { TopQueriesTable } from '../components/TopQueriesTable'
import { FailedQueriesTable } from '../components/FailedQueriesTable'
import { FeedbackSummaryCards } from '../components/FeedbackSummaryCards'
import { FeedbackTrendChart } from '../components/FeedbackTrendChart'
import { NegativeFeedbackTable } from '../components/NegativeFeedbackTable'
import { TopFlaggedSessionsCard } from '../components/TopFlaggedSessionsCard'
import { queryKeys } from '@/lib/queryKeys'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'

/**
 * @description Admin dashboard page with 3 tabs: Activity, Query Analytics, RAG Quality.
 * Date range picker and refresh button are shared across all tabs.
 * @returns {JSX.Element} The rendered dashboard page.
 */
function AdminDashboardPage() {
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    // Shared date range state across all tabs
    const [startDate, setStartDate] = useState<Date | undefined>(undefined)
    const [endDate, setEndDate] = useState<Date | undefined>(undefined)

    // Convert dates to query-friendly strings
    const startStr = startDate ? format(startDate, 'yyyy-MM-dd') : undefined
    const endStr = endDate ? format(endDate, 'yyyy-MM-dd') : undefined

    // Track current tab for refresh targeting
    const [activeTab, setActiveTab] = useState('activity')

    // Activity tab data
    const dashboardStats = useDashboardStats()

    // Query Analytics tab data
    const analyticsQuery = useQueryAnalytics(startStr, endStr)

    // RAG Quality tab data
    const feedbackQuery = useFeedbackAnalytics(startStr, endStr)

    // Feedback stats (source breakdown + top flagged sessions) from /api/feedback/stats
    const feedbackStatsQuery = useFeedbackStats(startStr, endStr)

    /**
     * @description Handle date range change from the picker.
     * Updates both shared date state and the activity tab's own date handler.
     */
    const handleDateRangeChange = (start: Date | undefined, end: Date | undefined) => {
        setStartDate(start)
        setEndDate(end)
        // Also update the activity tab's date range
        dashboardStats.handleDateRangeChange(start, end)
    }

    /**
     * @description Determine the "last updated" timestamp for the current tab's query.
     * Returns dataUpdatedAt from the most relevant query for the active tab.
     */
    const getLastUpdatedAt = (): Date | null => {
        if (activeTab === 'activity' && dashboardStats.stats) {
            // Activity tab uses its own loading state -- approximate with current time
            return null
        }
        if (activeTab === 'queryAnalytics' && analyticsQuery.dataUpdatedAt) {
            return new Date(analyticsQuery.dataUpdatedAt)
        }
        if (activeTab === 'ragQuality' && feedbackQuery.dataUpdatedAt) {
            return new Date(feedbackQuery.dataUpdatedAt)
        }
        return null
    }

    const lastUpdatedAt = getLastUpdatedAt()

    /**
     * @description Refresh data for the current tab by invalidating relevant query keys.
     */
    const handleRefresh = () => {
        if (activeTab === 'activity') {
            dashboardStats.refresh()
        } else if (activeTab === 'queryAnalytics') {
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.analytics(startStr, endStr) })
        } else if (activeTab === 'ragQuality') {
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.feedback(startStr, endStr) })
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.feedbackStats(startStr, endStr) })
        }
    }

    // Determine if any tab is loading for the refresh button spin
    const isLoading =
        (activeTab === 'activity' && dashboardStats.loading) ||
        (activeTab === 'queryAnalytics' && analyticsQuery.isLoading) ||
        (activeTab === 'ragQuality' && feedbackQuery.isLoading)

    const now = new Date()

    const presets: DateRangePreset[] = [
        { label: t('dashboard.presets.last1Day'), value: [subDays(now, 1), now] },
        { label: t('dashboard.presets.last7Days'), value: [subDays(now, 7), now] },
        { label: t('dashboard.presets.last30Days'), value: [subDays(now, 30), now] },
        { label: t('dashboard.presets.last90Days'), value: [subDays(now, 90), now] },
        { label: t('dashboard.presets.thisMonth'), value: [startOfMonth(now), now] },
        { label: t('dashboard.presets.lastMonth'), value: [startOfMonth(subMonths(now, 1)), endOfMonth(subMonths(now, 1))] },
        { label: t('dashboard.presets.last1Year'), value: [subYears(now, 1), now] },
        { label: t('dashboard.presets.last2Years'), value: [subYears(now, 2), now] },
    ]

    return (
        <div className="p-6 overflow-auto h-full">
            {/* Header with date range picker and refresh */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <h4 className="text-lg font-semibold">{t('dashboard.subtitle')}</h4>
                <div className="flex items-center gap-2">
                    <DateRangePicker
                        startDate={startDate}
                        endDate={endDate}
                        onChange={handleDateRangeChange}
                        presets={presets}
                        startPlaceholder={t('dashboard.startDate')}
                        endPlaceholder={t('dashboard.endDate')}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={isLoading}
                        aria-label={t('dashboard.refresh')}
                    >
                        <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                        {t('dashboard.refresh')}
                    </Button>
                </div>
            </div>

            {/* Last updated stale indicator */}
            {lastUpdatedAt && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    {t('dashboard.lastUpdated')}: {formatDistanceToNow(lastUpdatedAt, { addSuffix: true })}
                </p>
            )}

            {/* Tabs: Activity, Query Analytics, RAG Quality */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="mb-4">
                    <TabsTrigger value="activity">
                        {t('dashboard.tabs.activity')}
                    </TabsTrigger>
                    <TabsTrigger value="queryAnalytics">
                        {t('dashboard.tabs.queryAnalytics')}
                    </TabsTrigger>
                    <TabsTrigger value="ragQuality">
                        {t('dashboard.tabs.ragQuality')}
                    </TabsTrigger>
                </TabsList>

                {/* ============================================================ */}
                {/* Activity Tab (existing content) */}
                {/* ============================================================ */}
                <TabsContent value="activity">
                    <div className="relative">
                        {/* Overlay spinner while data is loading */}
                        {dashboardStats.loading && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
                                <Spinner size={32} />
                            </div>
                        )}

                        {/* Summary Stat Cards */}
                        <StatCards stats={dashboardStats.stats} />

                        {/* Charts Row 1: Activity Trend + Top Users */}
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.7fr] gap-4 mb-6">
                            <ActivityTrendChart activityTrend={dashboardStats.stats?.activityTrend || []} />
                            <TopUsersTable
                                topUsers={dashboardStats.stats?.topUsers || []}
                                limit={dashboardStats.topUsersLimit}
                                onLimitChange={dashboardStats.setTopUsersLimit}
                            />
                        </div>

                        {/* Charts Row 2: Pie Chart + Sessions Per Day */}
                        <div className="grid grid-cols-1 lg:grid-cols-[0.7fr_1fr] gap-4 mb-6">
                            <UsageBreakdownChart usageBreakdown={dashboardStats.stats?.usageBreakdown} />
                            <SessionsPerDayChart activityTrend={dashboardStats.stats?.activityTrend || []} />
                        </div>
                    </div>
                </TabsContent>

                {/* ============================================================ */}
                {/* Query Analytics Tab */}
                {/* ============================================================ */}
                <TabsContent value="queryAnalytics">
                    <div className="relative">
                        {/* Loading overlay */}
                        {analyticsQuery.isLoading && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
                                <Spinner size={32} />
                            </div>
                        )}

                        {/* Error state */}
                        {analyticsQuery.isError && (
                            <EmptyState
                                icon={<AlertCircle className="h-12 w-12 mx-auto" strokeWidth={1} />}
                                title={t('dashboard.analytics.error')}
                            >
                                <Button variant="outline" size="sm" onClick={handleRefresh}>
                                    {t('dashboard.refresh')}
                                </Button>
                            </EmptyState>
                        )}

                        {/* Empty state when no data */}
                        {!analyticsQuery.isLoading && !analyticsQuery.isError && !analyticsQuery.data && (
                            <EmptyState
                                title={t('dashboard.analytics.empty')}
                                description={t('dashboard.analytics.emptyDescription')}
                            />
                        )}

                        {/* Analytics content */}
                        {analyticsQuery.data && (
                            <>
                                {/* Stat cards row */}
                                <QueryAnalyticsCards data={analyticsQuery.data} />

                                {/* Chart + Table row: Queries Over Time + Top Queries */}
                                <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.7fr] gap-4 mb-6">
                                    <QueriesOverTimeChart trend={analyticsQuery.data.trend} />
                                    <TopQueriesTable queries={analyticsQuery.data.topQueries} />
                                </div>

                                {/* Full-width failed queries table */}
                                <FailedQueriesTable queries={analyticsQuery.data.topQueries} />
                            </>
                        )}
                    </div>
                </TabsContent>

                {/* ============================================================ */}
                {/* RAG Quality Tab */}
                {/* ============================================================ */}
                <TabsContent value="ragQuality">
                    <div className="relative">
                        {/* Loading overlay */}
                        {feedbackQuery.isLoading && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
                                <Spinner size={32} />
                            </div>
                        )}

                        {/* Error state */}
                        {feedbackQuery.isError && (
                            <EmptyState
                                icon={<AlertCircle className="h-12 w-12 mx-auto" strokeWidth={1} />}
                                title={t('dashboard.analytics.error')}
                            >
                                <Button variant="outline" size="sm" onClick={handleRefresh}>
                                    {t('dashboard.refresh')}
                                </Button>
                            </EmptyState>
                        )}

                        {/* Empty state when no data */}
                        {!feedbackQuery.isLoading && !feedbackQuery.isError && !feedbackQuery.data && (
                            <EmptyState
                                title={t('dashboard.feedback.empty')}
                                description={t('dashboard.feedback.emptyDescription')}
                            />
                        )}

                        {/* Feedback content */}
                        {feedbackQuery.data && (
                            <>
                                {/* Stat cards row with source breakdown */}
                                <FeedbackSummaryCards
                                    data={feedbackQuery.data}
                                    sourceBreakdown={feedbackStatsQuery.data?.sourceBreakdown}
                                    sourceBreakdownLoading={feedbackStatsQuery.isLoading}
                                />

                                {/* Top flagged sessions + Feedback trend chart in 2-column layout */}
                                <div className="grid grid-cols-1 lg:grid-cols-[0.7fr_1fr] gap-4 mb-6">
                                    <TopFlaggedSessionsCard
                                        topFlagged={feedbackStatsQuery.data?.topFlagged}
                                        isLoading={feedbackStatsQuery.isLoading}
                                    />
                                    <FeedbackTrendChart trend={feedbackQuery.data.trend} />
                                </div>

                                {/* Negative feedback table with source column and Langfuse links */}
                                <NegativeFeedbackTable
                                    feedback={feedbackQuery.data.negativeFeedback}
                                    langfuseBaseUrl={feedbackQuery.data.langfuseBaseUrl}
                                />
                            </>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}

export default AdminDashboardPage
