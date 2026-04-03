/**
 * @fileoverview Donut chart showing usage breakdown by type (chat vs search).
 * Features custom labels inside slices and a styled legend with dot indicators.
 * @module features/dashboard/components/UsageBreakdownChart
 */
import { useTranslation } from 'react-i18next'
import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { UsageBreakdown } from '../types/dashboard.types'

// ============================================================================
// Types
// ============================================================================

interface UsageBreakdownChartProps {
    /** Usage breakdown object (optional, undefined while loading) */
    usageBreakdown: UsageBreakdown | undefined
}

// ============================================================================
// Constants
// ============================================================================

/** Harmonious palette for the donut slices */
const COLORS = ['#3b82f6', '#10b981']

// ============================================================================
// Custom Renderers
// ============================================================================

/**
 * @description Renders percentage labels inside the donut slices.
 */
const renderCustomLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
}: any) => {
    // Skip labels for slices smaller than 5% to avoid overlapping text
    if (percent < 0.05) return null

    // Position label at 55% of the way between inner and outer radius
    const RADIAN = Math.PI / 180
    const radius = innerRadius + (outerRadius - innerRadius) * 0.55
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)

    return (
        <text
            x={x}
            y={y}
            fill="#fff"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={12}
            fontWeight={600}
        >
            {`${(percent * 100).toFixed(0)}%`}
        </text>
    )
}

/**
 * @description Styled tooltip with dark background for the donut chart.
 */
const CustomTooltip = ({ active, payload }: any) => {
    // Only render tooltip when hovering over a slice with valid payload
    if (!active || !payload?.length) return null

    const { name, value } = payload[0]
    return (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700
                        bg-white dark:bg-slate-800 px-3 py-2 shadow-lg text-xs">
            <p className="flex items-center gap-1.5">
                <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: payload[0].payload.fill }}
                />
                <span className="text-slate-700 dark:text-slate-200">{name}:</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                    {value}
                </span>
            </p>
        </div>
    )
}

/**
 * @description Custom legend renderer with colored dots instead of default squares.
 */
const CustomLegend = ({ payload }: any) => (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2">
        {payload?.map((entry: any, index: number) => (
            <span
                key={`legend-${index}`}
                className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300"
            >
                <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: entry.color }}
                />
                {entry.value}
            </span>
        ))}
    </div>
)

// ============================================================================
// Component
// ============================================================================

/**
 * @description Donut chart visualising the usage breakdown by session type.
 * Converts the UsageBreakdown object into pie chart data.
 * Shows percentage labels inside slices and a custom dot-style legend.
 * @param {UsageBreakdownChartProps} props - Component props.
 * @returns {JSX.Element} Usage breakdown chart card.
 */
export function UsageBreakdownChart({ usageBreakdown }: UsageBreakdownChartProps) {
    const { t } = useTranslation()

    // Convert the UsageBreakdown object to an array for Recharts
    const data = usageBreakdown
        ? [
              { name: t('dashboard.chatSessions'), value: usageBreakdown.chatSessions },
              { name: t('dashboard.searchSessions'), value: usageBreakdown.searchSessions },
          ]
        : []

    return (
        <Card className="border border-slate-200 dark:border-slate-700 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-slate-800 dark:text-slate-100">
                    {t('dashboard.usageBreakdown')}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={65}
                            outerRadius={110}
                            paddingAngle={2}
                            dataKey="value"
                            nameKey="name"
                            label={renderCustomLabel}
                            labelLine={false}
                            strokeWidth={0}
                        >
                            {data.map((_entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={COLORS[index % COLORS.length]}
                                />
                            ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend content={<CustomLegend />} />
                    </PieChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    )
}

export default UsageBreakdownChart
