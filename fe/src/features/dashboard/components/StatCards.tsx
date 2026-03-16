/**
 * @fileoverview Summary statistic cards for the admin dashboard.
 * Each card has a gradient background, icon, and staggered entrance animation.
 * @module features/dashboard/components/StatCards
 */
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { MessageSquare, Search, Users, BarChart3 } from 'lucide-react'
import type { DashboardStats } from '../types/dashboard.types'

// ============================================================================
// Types
// ============================================================================

interface StatCardsProps {
    /** Dashboard stats data (null while loading) */
    stats: DashboardStats | null
}

// ============================================================================
// Stat Card Configuration
// ============================================================================

/**
 * @description Configuration for each stat card — maps index to gradient CSS vars,
 * icon component, and i18n label key.
 */
const STAT_CARDS = [
    {
        key: 'totalSessions' as const,
        labelKey: 'dashboard.stats.totalSessions',
        Icon: MessageSquare,
        gradientVar: 1,
    },
    {
        key: 'totalMessages' as const,
        labelKey: 'dashboard.stats.totalMessages',
        Icon: BarChart3,
        gradientVar: 2,
    },
    {
        key: 'uniqueUsers' as const,
        labelKey: 'dashboard.stats.uniqueUsers',
        Icon: Users,
        gradientVar: 3,
    },
    {
        key: 'avgMessagesPerSession' as const,
        labelKey: 'dashboard.stats.avgMessagesPerSession',
        Icon: Search,
        gradientVar: 4,
    },
] as const

// ============================================================================
// Component
// ============================================================================

/**
 * @description Hero stat cards rendered in a responsive grid.
 * Each card uses a unique gradient from CSS custom properties and
 * enters with a staggered slideUp animation.
 * @param {StatCardsProps} props - Component props.
 * @returns {JSX.Element} Stats overview grid.
 */
export function StatCards({ stats }: StatCardsProps) {
    const { t } = useTranslation()

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {STAT_CARDS.map((card, index) => {
                // Read the value from stats, falling back to 0 while loading
                const rawValue = stats?.[card.key] ?? 0
                // Format avg with one decimal, integers for the rest
                // Format average with one decimal place; format integers with locale separators
                const displayValue =
                    card.key === 'avgMessagesPerSession'
                        ? rawValue.toFixed(1)
                        : rawValue.toLocaleString()

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
                            {/* Icon container — semi-transparent circle */}
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
