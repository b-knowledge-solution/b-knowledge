/**
 * @fileoverview Usage breakdown pie/donut chart for the admin dashboard.
 * @module features/dashboard/components/UsageBreakdownChart
 */
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import {
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Tooltip,
    Legend,
} from 'recharts'
import type { UsageBreakdown } from '../types/dashboard.types'

/** Colour palette for chart slices */
const COLORS = ['#1677ff', '#52c41a']

interface UsageBreakdownChartProps {
    /** Session breakdown data */
    usageBreakdown: UsageBreakdown | undefined
}

/**
 * @description Donut chart showing chat vs search session distribution.
 * @param props - Usage breakdown data.
 * @returns Chart card element.
 */
export function UsageBreakdownChart({ usageBreakdown }: UsageBreakdownChartProps) {
    const { t } = useTranslation()

    /** Pie data filtered to non-zero values */
    const pieData = !usageBreakdown ? [] : [
        { name: t('dashboard.charts.aiChat'), value: usageBreakdown.chatSessions },
        { name: t('dashboard.charts.aiSearch'), value: usageBreakdown.searchSessions },
    ].filter(d => d.value > 0)

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('dashboard.charts.usageBreakdown')}</CardTitle>
            </CardHeader>
            <CardContent>
                {pieData.some(d => d.value > 0) ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={pieData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                label
                            >
                                {/* Assign colours to each slice */}
                                {pieData.map((_entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={COLORS[index % COLORS.length]}
                                    />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
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
