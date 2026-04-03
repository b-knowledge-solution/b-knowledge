/**
 * @fileoverview Table displaying queries with low confidence scores (failed retrievals).
 * Filters from the top queries data to show queries with avg_confidence below threshold.
 * @module features/dashboard/components/FailedQueriesTable
 */
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { QueryAnalytics } from '../types/dashboard.types'

// ============================================================================
// Types
// ============================================================================

interface FailedQueriesTableProps {
    /** Full top queries array -- filtered client-side for low confidence */
    queries: QueryAnalytics['topQueries']
}

// ============================================================================
// Constants
// ============================================================================

/** Confidence threshold below which a query is considered "failed" */
const LOW_CONFIDENCE_THRESHOLD = 0.5

// ============================================================================
// Component
// ============================================================================

/**
 * @description Table card showing queries with low confidence (below 0.5 threshold).
 * Filters from the full top queries list client-side.
 * @param {FailedQueriesTableProps} props - Component props.
 * @returns {JSX.Element} Failed queries table card.
 */
export function FailedQueriesTable({ queries }: FailedQueriesTableProps) {
    const { t } = useTranslation()

    // Filter for queries with average confidence below the threshold
    const failedQueries = queries.filter(
        (q) => q.avg_confidence < LOW_CONFIDENCE_THRESHOLD
    )

    return (
        <Card className="border border-slate-200 dark:border-slate-700 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-slate-800 dark:text-slate-100">
                    {t('dashboard.analytics.failedQueries')}
                </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700">
                                <th className="px-5 py-2.5 text-left font-medium text-slate-500 dark:text-slate-400">
                                    {t('dashboard.analytics.queryColumn')}
                                </th>
                                <th className="px-5 py-2.5 text-right font-medium text-slate-500 dark:text-slate-400 w-20">
                                    {t('dashboard.analytics.countColumn')}
                                </th>
                                <th className="px-5 py-2.5 text-right font-medium text-slate-500 dark:text-slate-400 w-28">
                                    {t('dashboard.analytics.confidenceColumn')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {failedQueries.map((item, index) => (
                                <tr
                                    key={`${item.query}-${index}`}
                                    className={`
                                        border-b border-slate-100 dark:border-slate-800 last:border-0
                                        transition-colors duration-150
                                        hover:bg-slate-50 dark:hover:bg-slate-800/60
                                        ${index % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}
                                    `}
                                >
                                    {/* Query text */}
                                    <td className="px-5 py-3 text-slate-700 dark:text-slate-200 truncate max-w-[400px]">
                                        {item.query}
                                    </td>
                                    {/* Execution count */}
                                    <td className="px-5 py-3 text-right text-slate-700 dark:text-slate-200 font-semibold tabular-nums">
                                        {item.count.toLocaleString()}
                                    </td>
                                    {/* Low confidence highlighted in amber */}
                                    <td className="px-5 py-3 text-right text-amber-600 dark:text-amber-400 font-semibold tabular-nums">
                                        {item.avg_confidence.toFixed(2)}
                                    </td>
                                </tr>
                            ))}

                            {/* Empty state when no low-confidence queries */}
                            {failedQueries.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={3}
                                        className="px-5 py-8 text-center text-slate-400 dark:text-slate-500"
                                    >
                                        {t('dashboard.noData')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    )
}
