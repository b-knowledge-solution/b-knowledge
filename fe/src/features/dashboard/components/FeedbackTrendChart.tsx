/**
 * @fileoverview Area chart showing feedback trend over time (total vs positive).
 * Reuses the existing ActivityTrendChart Recharts pattern with two area series.
 * @module features/dashboard/components/FeedbackTrendChart
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
import type { FeedbackAnalytics } from '../types/dashboard.types'

// ============================================================================
// Types
// ============================================================================

interface FeedbackTrendChartProps {
    /** Daily feedback trend data */
    trend: FeedbackAnalytics['trend']
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
 * @description Styled tooltip matching the dashboard theme.
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
 * @description Area chart visualising daily feedback trend with total and positive counts.
 * Uses gradient-filled areas with two series for comparison.
 * @param {FeedbackTrendChartProps} props - Component props.
 * @returns {JSX.Element} Feedback trend chart card.
 */
export function FeedbackTrendChart({ trend }: FeedbackTrendChartProps) {
    const { t } = useTranslation()

    // Resolve colours from CSS custom properties at render time
    const primaryColor = cssVar('--chart-primary', '#3b82f6')
    const secondaryColor = cssVar('--chart-secondary', '#10b981')
    const gridColor = cssVar('--chart-grid', '#e2e8f0')

    return (
        <Card className="border border-slate-200 dark:border-slate-700 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-slate-800 dark:text-slate-100">
                    {t('dashboard.feedback.trend')}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <AreaChart
                        data={trend}
                        margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    >
                        {/* Gradient definitions for both series */}
                        <defs>
                            <linearGradient
                                id="gradientFeedbackTotal"
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
                                id="gradientFeedbackPositive"
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

                        {/* Total feedback area */}
                        <Area
                            type="monotone"
                            dataKey="total"
                            name={t('dashboard.feedback.totalLabel')}
                            stroke={primaryColor}
                            strokeWidth={2}
                            fill="url(#gradientFeedbackTotal)"
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 2 }}
                        />
                        {/* Positive feedback area */}
                        <Area
                            type="monotone"
                            dataKey="positive"
                            name={t('dashboard.feedback.positiveLabel')}
                            stroke={secondaryColor}
                            strokeWidth={2}
                            fill="url(#gradientFeedbackPositive)"
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 2 }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    )
}
