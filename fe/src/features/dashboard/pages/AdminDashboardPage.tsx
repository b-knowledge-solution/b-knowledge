/**
 * @fileoverview Admin Activity Dashboard page.
 * Composes from useDashboardStats hook and chart/stat components.
 * @module features/dashboard/pages/AdminDashboardPage
 */
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { subDays, subMonths, subYears, startOfMonth, endOfMonth } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { DateRangePicker, type DateRangePreset } from '@/components/ui/date-range-picker'
import { useDashboardStats } from '../hooks/useDashboardStats'
import { StatCards } from '../components/StatCards'
import { ActivityTrendChart } from '../components/ActivityTrendChart'
import { TopUsersTable } from '../components/TopUsersTable'
import { UsageBreakdownChart } from '../components/UsageBreakdownChart'
import { SessionsPerDayChart } from '../components/SessionsPerDayChart'

/**
 * @description Admin dashboard page — displays stats, charts, and top users.
 * @returns {JSX.Element} The rendered dashboard page.
 */
function AdminDashboardPage() {
    const { t } = useTranslation()
    const {
        stats,
        loading,
        startDate,
        endDate,
        handleDateRangeChange,
        topUsersLimit,
        setTopUsersLimit,
        refresh,
    } = useDashboardStats()

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
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
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
                        onClick={refresh}
                        disabled={loading}
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        {t('dashboard.refresh')}
                    </Button>
                </div>
            </div>

            <div className="relative">
                {loading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
                        <Spinner size={32} />
                    </div>
                )}

                {/* Summary Stat Cards */}
                <StatCards stats={stats} />

                {/* Charts Row 1: Activity Trend + Top Users */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.7fr] gap-4 mb-6">
                    <ActivityTrendChart activityTrend={stats?.activityTrend || []} />
                    <TopUsersTable
                        topUsers={stats?.topUsers || []}
                        limit={topUsersLimit}
                        onLimitChange={setTopUsersLimit}
                    />
                </div>

                {/* Charts Row 2: Pie Chart + Sessions Per Day */}
                <div className="grid grid-cols-1 lg:grid-cols-[0.7fr_1fr] gap-4 mb-6">
                    <UsageBreakdownChart usageBreakdown={stats?.usageBreakdown} />
                    <SessionsPerDayChart activityTrend={stats?.activityTrend || []} />
                </div>
            </div>
        </div>
    )
}

export default AdminDashboardPage
