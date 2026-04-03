/**
 * @fileoverview Gradient stat cards for query analytics metrics.
 * Reuses the existing StatCards gradient pattern with query-specific metrics.
 * @module features/dashboard/components/QueryAnalyticsCards
 */
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Search, Clock, AlertTriangle, TrendingDown } from 'lucide-react'
import type { QueryAnalytics } from '../types/dashboard.types'

// ============================================================================
// Types
// ============================================================================

interface QueryAnalyticsCardsProps {
    /** Query analytics data (null while loading) */
    data: QueryAnalytics | null
}

// ============================================================================
// Card Configuration
// ============================================================================

/**
 * @description Configuration for each query analytics stat card.
 * Maps gradient CSS vars, icons, i18n label keys, and value formatters.
 */
const ANALYTICS_CARDS = [
    {
        key: 'totalQueries' as const,
        labelKey: 'dashboard.analytics.totalQueries',
        Icon: Search,
        gradientVar: 1,
        format: (v: number) => v.toLocaleString(),
    },
    {
        key: 'avgResponseTime' as const,
        labelKey: 'dashboard.analytics.avgResponseTime',
        Icon: Clock,
        gradientVar: 2,
        format: (v: number) => `${Math.round(v)}ms`,
    },
    {
        key: 'failedRate' as const,
        labelKey: 'dashboard.analytics.failedRate',
        Icon: AlertTriangle,
        gradientVar: 3,
        format: (v: number) => `${v.toFixed(1)}%`,
    },
    {
        key: 'lowConfRate' as const,
        labelKey: 'dashboard.analytics.lowConfRate',
        Icon: TrendingDown,
        gradientVar: 4,
        format: (v: number) => `${v.toFixed(1)}%`,
    },
] as const

// ============================================================================
// Component
// ============================================================================

/**
 * @description Four gradient stat cards displaying query analytics summary metrics.
 * Uses the same gradient CSS custom properties and animation pattern as StatCards.
 * @param {QueryAnalyticsCardsProps} props - Component props.
 * @returns {JSX.Element} Query analytics stats grid.
 */
export function QueryAnalyticsCards({ data }: QueryAnalyticsCardsProps) {
    const { t } = useTranslation()

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {ANALYTICS_CARDS.map((card, index) => {
                // Read the value from data, falling back to 0 while loading
                const rawValue = data?.[card.key] ?? 0
                const displayValue = card.format(rawValue)

                return (
                    <Card
                        key={card.key}
                        className="relative overflow-hidden border-0 text-white
                                   transition-all duration-300 ease-out
                                   hover:scale-[1.02] hover:shadow-lg
                                   opacity-0 animate-slideUp"
                        style={{
                            // Gradient from the CSS custom properties
                            background: `linear-gradient(135deg, var(--dashboard-gradient-${card.gradientVar}-from), var(--dashboard-gradient-${card.gradientVar}-to))`,
                            // Stagger animation per card
                            animationDelay: `${index * 80}ms`,
                        }}
                    >
                        <CardContent className="p-5">
                            {/* Icon container -- semi-transparent circle */}
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-medium text-white/85">
                                    {t(card.labelKey)}
                                </span>
                                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white/15">
                                    <card.Icon className="w-5 h-5 text-white/90" />
                                </div>
                            </div>

                            {/* Metric value */}
                            <p className="text-3xl font-bold tracking-tight">
                                {displayValue}
                            </p>
                        </CardContent>

                        {/* Decorative background circle */}
                        <div
                            className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-white/5 pointer-events-none"
                            aria-hidden="true"
                        />
                    </Card>
                )
            })}
        </div>
    )
}
