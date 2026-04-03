/**
 * @fileoverview Gradient stat cards for feedback analytics metrics.
 * Reuses the existing StatCards gradient pattern with feedback-specific metrics.
 * Includes optional source breakdown row showing chat/search/agent counts.
 * @module features/dashboard/components/FeedbackSummaryCards
 */
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ThumbsUp, MessageCircle, SearchX, Database } from 'lucide-react'
import type { FeedbackAnalytics } from '../types/dashboard.types'

// ============================================================================
// Types
// ============================================================================

interface FeedbackSummaryCardsProps {
    /** Feedback analytics data (null while loading) */
    data: FeedbackAnalytics | null
    /** Optional source breakdown counts from /api/feedback/stats */
    sourceBreakdown?: { chat: number; search: number; agent: number } | undefined
    /** Whether source breakdown data is loading */
    sourceBreakdownLoading?: boolean | undefined
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Four gradient stat cards displaying feedback analytics summary metrics,
 * plus an optional source breakdown row showing feedback counts by source type.
 * Shows satisfaction rate, total feedback, zero-result rate, and worst-performing dataset.
 * @param {FeedbackSummaryCardsProps} props - Component props.
 * @returns {JSX.Element} Feedback summary stats grid with source breakdown.
 */
export function FeedbackSummaryCards({ data, sourceBreakdown, sourceBreakdownLoading }: FeedbackSummaryCardsProps) {
    const { t } = useTranslation()

    // Determine the worst dataset name for the 4th card display
    const worstDatasetName =
        data?.worstDatasets?.[0]?.name ?? t('dashboard.noData')

    const cards = [
        {
            key: 'satisfactionRate',
            label: t('dashboard.feedback.satisfactionRate'),
            Icon: ThumbsUp,
            gradientVar: 1,
            value: data ? `${data.satisfactionRate.toFixed(1)}%` : '0%',
        },
        {
            key: 'totalFeedback',
            label: t('dashboard.feedback.totalFeedback'),
            Icon: MessageCircle,
            gradientVar: 2,
            value: data ? data.totalFeedback.toLocaleString() : '0',
        },
        {
            key: 'zeroResultRate',
            label: t('dashboard.feedback.zeroResultRate'),
            Icon: SearchX,
            gradientVar: 3,
            value: data ? `${data.zeroResultRate.toFixed(1)}%` : '0%',
        },
        {
            key: 'worstDatasets',
            label: t('dashboard.feedback.worstDatasets'),
            Icon: Database,
            gradientVar: 4,
            value: worstDatasetName,
        },
    ]

    return (
        <div className="space-y-4 mb-6">
            {/* Gradient stat cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {cards.map((card, index) => (
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
                                    {card.label}
                                </span>
                                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white/15">
                                    <card.Icon className="w-5 h-5 text-white/90" />
                                </div>
                            </div>

                            {/* Metric value -- uses smaller text for dataset name to avoid overflow */}
                            <p className={`font-bold tracking-tight ${
                                card.key === 'worstDatasets' ? 'text-xl truncate' : 'text-3xl'
                            }`}>
                                {card.value}
                            </p>
                        </CardContent>

                        {/* Decorative background circle */}
                        <div
                            className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-white/5 pointer-events-none"
                            aria-hidden="true"
                        />
                    </Card>
                ))}
            </div>

            {/* Source breakdown row: Chat | Search | Agent feedback counts */}
            {(sourceBreakdown || sourceBreakdownLoading) && (
                <Card className="border border-slate-200 dark:border-slate-700 shadow-sm">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                {t('dashboard.feedback.bySource')}:
                            </span>
                            {sourceBreakdownLoading ? (
                                // Show skeleton placeholders while loading
                                <>
                                    <Skeleton className="h-6 w-20" />
                                    <Skeleton className="h-6 w-20" />
                                    <Skeleton className="h-6 w-20" />
                                </>
                            ) : sourceBreakdown ? (
                                // Show colored badges with source counts
                                <>
                                    <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                        {t('dashboard.feedback.sourceChat')} {sourceBreakdown.chat}
                                    </Badge>
                                    <Badge variant="outline" className="border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-300">
                                        {t('dashboard.feedback.sourceSearch')} {sourceBreakdown.search}
                                    </Badge>
                                    <Badge variant="outline" className="border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-300">
                                        {t('dashboard.feedback.sourceAgent')} {sourceBreakdown.agent}
                                    </Badge>
                                </>
                            ) : null}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
