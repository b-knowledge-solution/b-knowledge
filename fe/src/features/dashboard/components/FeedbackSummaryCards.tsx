/**
 * @fileoverview Gradient stat cards for feedback analytics metrics.
 * Reuses the existing StatCards gradient pattern with feedback-specific metrics.
 * @module features/dashboard/components/FeedbackSummaryCards
 */
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { ThumbsUp, MessageCircle, SearchX, Database } from 'lucide-react'
import type { FeedbackAnalytics } from '../types/dashboard.types'

// ============================================================================
// Types
// ============================================================================

interface FeedbackSummaryCardsProps {
    /** Feedback analytics data (null while loading) */
    data: FeedbackAnalytics | null
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Four gradient stat cards displaying feedback analytics summary metrics.
 * Shows satisfaction rate, total feedback, zero-result rate, and worst-performing dataset.
 * @param {FeedbackSummaryCardsProps} props - Component props.
 * @returns {JSX.Element} Feedback summary stats grid.
 */
export function FeedbackSummaryCards({ data }: FeedbackSummaryCardsProps) {
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
    )
}
