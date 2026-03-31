/**
 * @fileoverview Card component displaying top flagged sessions ranked by negative feedback count.
 * Shows sessions with the most negative feedback from /api/feedback/stats topFlagged data.
 * @module features/dashboard/components/TopFlaggedSessionsCard
 */
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { TopFlaggedSession } from '../types/dashboard.types'

// ============================================================================
// Types
// ============================================================================

interface TopFlaggedSessionsCardProps {
    /** Top flagged sessions data from /api/feedback/stats */
    topFlagged: TopFlaggedSession[] | undefined
    /** Whether data is loading */
    isLoading?: boolean
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Get CSS classes for source type badge coloring.
 * Blue for chat, green for search, purple for agent.
 * @param {string} source - Source type string.
 * @returns {string} Tailwind CSS class string for the badge.
 */
const getSourceBadgeClasses = (source: string): string => {
    switch (source) {
        case 'chat':
            return 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300'
        case 'search':
            return 'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-300'
        case 'agent':
            return 'border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-300'
        default:
            return ''
    }
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Card displaying top flagged sessions ranked by negative feedback count.
 * Each row shows a source badge, truncated session ID, negative count, and ratio.
 * Data comes from GET /api/feedback/stats topFlagged array.
 * @param {TopFlaggedSessionsCardProps} props - Component props.
 * @returns {JSX.Element} Top flagged sessions card.
 */
export function TopFlaggedSessionsCard({ topFlagged, isLoading }: TopFlaggedSessionsCardProps) {
    const { t } = useTranslation()

    return (
        <Card className="border border-slate-200 dark:border-slate-700 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-slate-800 dark:text-slate-100">
                    {t('dashboard.feedback.topFlaggedSessions')}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {/* Loading state with skeleton rows */}
                {isLoading && (
                    <div className="space-y-3">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                    </div>
                )}

                {/* Empty state when no flagged sessions */}
                {!isLoading && (!topFlagged || topFlagged.length === 0) && (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                        {t('dashboard.feedback.noFlaggedSessions')}
                    </p>
                )}

                {/* Flagged sessions list (max 5 items) */}
                {!isLoading && topFlagged && topFlagged.length > 0 && (
                    <div className="space-y-2">
                        {topFlagged.slice(0, 5).map((session) => (
                            <div
                                key={`${session.source}-${session.source_id}`}
                                className="flex items-center justify-between gap-3 rounded-md border border-slate-100 dark:border-slate-800 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    {/* Source type badge with color coding */}
                                    <Badge variant="outline" className={getSourceBadgeClasses(session.source)}>
                                        {session.source}
                                    </Badge>
                                    {/* Truncated source ID for compact display */}
                                    <span className="text-slate-600 dark:text-slate-300 font-mono text-xs truncate">
                                        {session.source_id.slice(0, 8)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {/* Negative count highlighted in red */}
                                    <span className="text-red-600 dark:text-red-400 font-semibold">
                                        {session.negative_count}
                                    </span>
                                    {/* Ratio of negative to total feedback */}
                                    <span className="text-xs text-muted-foreground">
                                        / {session.total_count}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
