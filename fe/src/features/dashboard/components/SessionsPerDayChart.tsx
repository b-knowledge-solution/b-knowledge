/**
 * @fileoverview Sessions per day column chart for the admin dashboard.
 * @module features/dashboard/components/SessionsPerDayChart
 */
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from 'recharts'
import type { DailyActivity } from '../types/dashboard.types'

interface SessionsPerDayChartProps {
    /** Daily activity trend data */
    activityTrend: DailyActivity[]
}

/**
 * @description Bar chart showing total daily sessions (chat + search combined).
 * @param props - Activity trend data array.
 * @returns Chart card element.
 */
export function SessionsPerDayChart({ activityTrend }: SessionsPerDayChartProps) {
    const { t } = useTranslation()

    /** Combined daily session totals */
    const sessionsPerDayData = activityTrend.map(item => ({
        date: item.date,
        sessions: item.chatCount + item.searchCount,
    }))

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('dashboard.charts.sessionsPerDay')}</CardTitle>
            </CardHeader>
            <CardContent>
                {sessionsPerDayData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={sessionsPerDayData}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis
                                dataKey="date"
                                label={{ value: t('dashboard.charts.date'), position: 'insideBottom', offset: -5 }}
                            />
                            <YAxis
                                label={{ value: t('dashboard.charts.sessions'), angle: -90, position: 'insideLeft' }}
                            />
                            <Tooltip
                                formatter={(value: any) => [value, t('dashboard.charts.totalActivity')]}
                            />
                            {/* Session count bars with rounded top */}
                            <Bar
                                dataKey="sessions"
                                fill="#1677ff"
                                radius={[4, 4, 0, 0]}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <EmptyState
                        title={t('common.noData')}
                        className="h-[300px] flex items-center justify-center"
                    />
                )}
            </CardContent>
        </Card>
    )
}
