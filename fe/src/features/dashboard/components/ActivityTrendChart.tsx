/**
 * @fileoverview Activity trend area chart showing chat & search sessions over time.
 * Uses gradient fills under the curves and themed tooltips referencing CSS custom properties.
 * @module features/dashboard/components/ActivityTrendChart
 */
import { useTranslation } from 'react-i18next'
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DailyActivity } from '../types/dashboard.types'

// ============================================================================
// Types
// ============================================================================

interface ActivityTrendChartProps {
    /** Array of daily activity data points */
    activityTrend: DailyActivity[]
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Read a CSS custom property from the document root.
 * Falls back to defaultValue if not available (e.g. SSR / test environment).
 * @param {string} name - CSS variable name including `--` prefix.
 * @param {string} defaultValue - Fallback value.
 * @returns {string} Resolved CSS variable value.
 */
const cssVar = (name: string, defaultValue: string): string => {
    if (typeof window === 'undefined') return defaultValue
    return (
        getComputedStyle(document.documentElement)
            .getPropertyValue(name)
            .trim() || defaultValue
    )
}

// ============================================================================
// Custom Tooltip
// ============================================================================

/**
 * @description Styled tooltip matching the dashboard theme with rounded corners and shadow.
 */
const CustomTooltip = ({ active, payload, label }: any) => {
    // Only render tooltip when hovering over a data point with valid payload
    if (!active || !payload?.length) return null

    return (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 
                        bg-white dark:bg-slate-800 px-3 py-2 shadow-lg text-xs">
            <p className="font-medium text-slate-700 dark:text-slate-200 mb-1">
                {label}
            </p>
            {payload.map((entry: any) => (
                <p
                    key={entry.dataKey}
                    className="flex items-center gap-1.5"
                    style={{ color: entry.color }}
                >
                    <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ backgroundColor: entry.color }}
                    />
                    {entry.name}: <span className="font-semibold">{entry.value}</span>
                </p>
            ))}
        </div>
    )
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Area chart visualising daily chat & search activity trends.
 * Renders gradient-filled areas with themed colours from CSS custom properties.
 * @param {ActivityTrendChartProps} props - Component props.
 * @returns {JSX.Element} Activity trend chart card.
 */
export function ActivityTrendChart({ activityTrend }: ActivityTrendChartProps) {
    const { t } = useTranslation()

    // Resolve colours from CSS custom properties at render time
    const primaryColor = cssVar('--chart-primary', '#3b82f6')
    const secondaryColor = cssVar('--chart-secondary', '#10b981')
    const gridColor = cssVar('--chart-grid', '#e2e8f0')

    return (
        <Card className="border border-slate-200 dark:border-slate-700 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-slate-800 dark:text-slate-100">
                    {t('dashboard.activityTrend')}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <AreaChart
                        data={activityTrend}
                        margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    >
                        {/* Gradient definitions */}
                        <defs>
                            <linearGradient
                                id="gradientChat"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                            >
                                <stop
                                    offset="0%"
                                    stopColor={primaryColor}
                                    stopOpacity={0.3}
                                />
                                <stop
                                    offset="95%"
                                    stopColor={primaryColor}
                                    stopOpacity={0.02}
                                />
                            </linearGradient>
                            <linearGradient
                                id="gradientSearch"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                            >
                                <stop
                                    offset="0%"
                                    stopColor={secondaryColor}
                                    stopOpacity={0.3}
                                />
                                <stop
                                    offset="95%"
                                    stopColor={secondaryColor}
                                    stopOpacity={0.02}
                                />
                            </linearGradient>
                        </defs>

                        <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={gridColor}
                            vertical={false}
                        />
                        <XAxis
                            dataKey="date"
                            tick={{ fontSize: 11, fill: '#94a3b8' }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            tick={{ fontSize: 11, fill: '#94a3b8' }}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend
                            iconType="circle"
                            iconSize={8}
                            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                        />

                        {/* Chat count area */}
                        <Area
                            type="monotone"
                            dataKey="chatCount"
                            name={t('dashboard.chatSessions')}
                            stroke={primaryColor}
                            strokeWidth={2}
                            fill="url(#gradientChat)"
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 2 }}
                        />
                        {/* Search count area */}
                        <Area
                            type="monotone"
                            dataKey="searchCount"
                            name={t('dashboard.searchSessions')}
                            stroke={secondaryColor}
                            strokeWidth={2}
                            fill="url(#gradientSearch)"
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 2 }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    )
}

export default ActivityTrendChart
