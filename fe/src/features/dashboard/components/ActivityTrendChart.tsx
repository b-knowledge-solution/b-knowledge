/**
 * @fileoverview Activity trend line chart for the admin dashboard.
 * @module features/dashboard/components/ActivityTrendChart
 */
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    CartesianGrid,
} from 'recharts'
import type { DailyActivity } from '../types/dashboard.types'

interface ActivityTrendChartProps {
    /** Daily activity trend data */
    activityTrend: DailyActivity[]
}

/**
 * @description Line chart showing daily chat and search message counts.
 * @param props - Activity trend data array.
 * @returns Chart card element.
 */
export function ActivityTrendChart({ activityTrend }: ActivityTrendChartProps) {
    const { t } = useTranslation()

    /** Transform raw trend data into recharts-ready format (one object per date) */
    const chartData = activityTrend.map(item => ({
        date: item.date,
        [t('dashboard.charts.chatMessages')]: item.chatCount,
        [t('dashboard.charts.searchRecords')]: item.searchCount,
    }))

    /** Translated series labels */
    const chatLabel = t('dashboard.charts.chatMessages')
    const searchLabel = t('dashboard.charts.searchRecords')

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('dashboard.charts.activityTrend')}</CardTitle>
            </CardHeader>
            <CardContent>
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis
                                dataKey="date"
                                label={{ value: t('dashboard.charts.date'), position: 'insideBottom', offset: -5 }}
                            />
                            <YAxis
                                label={{ value: t('dashboard.charts.messageCount'), angle: -90, position: 'insideLeft' }}
                            />
                            <Tooltip />
                            <Legend />
                            {/* Chat messages line */}
                            <Line
                                type="monotone"
                                dataKey={chatLabel}
                                stroke="#1677ff"
                                strokeWidth={2}
                                dot={false}
                            />
                            {/* Search records line */}
                            <Line
                                type="monotone"
                                dataKey={searchLabel}
                                stroke="#52c41a"
                                strokeWidth={2}
                                dot={false}
                            />
                        </LineChart>
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
