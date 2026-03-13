/**
 * @fileoverview Bar chart showing session counts per day.
 * Uses gradient-filled bars and a themed custom tooltip.
 * @module features/dashboard/components/SessionsPerDayChart
 */
import { useTranslation } from 'react-i18next'
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DailyActivity } from '../types/dashboard.types'

// ============================================================================
// Types
// ============================================================================

interface SessionsPerDayChartProps {
    /** Array of daily activity data points */
    activityTrend: DailyActivity[]
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Read a CSS custom property from the document root.
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
 * @description Styled tooltip with rounded corners and shadow matching dashboard theme.
 */
const CustomTooltip = ({ active, payload, label }: any) => {
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
                    {entry.name}:{' '}
                    <span className="font-semibold">{entry.value}</span>
                </p>
            ))}
        </div>
    )
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Bar chart visualising the total sessions (chat + search) per day.
 * Derives total from chatCount + searchCount per DailyActivity entry.
 * Bars use a top-to-bottom gradient fill using chart CSS custom properties.
 * @param {SessionsPerDayChartProps} props - Component props.
 * @returns {JSX.Element} Sessions per day chart card.
 */
export function SessionsPerDayChart({ activityTrend }: SessionsPerDayChartProps) {
    const { t } = useTranslation()

    // Derive total sessions per day from the activity trend data
    const data = activityTrend.map((d) => ({
        date: d.date,
        totalSessions: d.chatCount + d.searchCount,
    }))

    // Resolve colours from CSS custom properties
    const primaryColor = cssVar('--chart-primary', '#3b82f6')
    const gridColor = cssVar('--chart-grid', '#e2e8f0')

    return (
        <Card className="border border-slate-200 dark:border-slate-700 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-slate-800 dark:text-slate-100">
                    {t('dashboard.sessionsPerDay')}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                        data={data}
                        margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    >
                        {/* Gradient definition for bar fill */}
                        <defs>
                            <linearGradient
                                id="gradientBar"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                            >
                                <stop
                                    offset="0%"
                                    stopColor={primaryColor}
                                    stopOpacity={0.85}
                                />
                                <stop
                                    offset="100%"
                                    stopColor={primaryColor}
                                    stopOpacity={0.4}
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

                        <Bar
                            dataKey="totalSessions"
                            name={t('dashboard.totalSessions')}
                            fill="url(#gradientBar)"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={40}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    )
}

export default SessionsPerDayChart
