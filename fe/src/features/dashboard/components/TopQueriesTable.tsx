/**
 * @fileoverview Table displaying the top queries by frequency.
 * Shows query text, execution count, and average confidence score.
 * @module features/dashboard/components/TopQueriesTable
 */
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { QueryAnalytics } from '../types/dashboard.types'

// ============================================================================
// Types
// ============================================================================

interface TopQueriesTableProps {
    /** Top queries array from query analytics data */
    queries: QueryAnalytics['topQueries']
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Table card showing the top 10 most frequent queries with count and confidence.
 * Includes alternating row backgrounds and empty state fallback.
 * @param {TopQueriesTableProps} props - Component props.
 * @returns {JSX.Element} Top queries table card.
 */
export function TopQueriesTable({ queries }: TopQueriesTableProps) {
    const { t } = useTranslation()

    return (
        <Card className="border border-slate-200 dark:border-slate-700 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-slate-800 dark:text-slate-100">
                    {t('dashboard.analytics.topQueries')}
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
                            {queries.map((item, index) => (
                                <tr
                                    key={`${item.query}-${index}`}
                                    className={`
                                        border-b border-slate-100 dark:border-slate-800 last:border-0
                                        transition-colors duration-150
                                        hover:bg-slate-50 dark:hover:bg-slate-800/60
                                        ${index % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}
                                    `}
                                >
                                    {/* Query text -- truncated for long queries */}
                                    <td className="px-5 py-3 text-slate-700 dark:text-slate-200 truncate max-w-[300px]">
                                        {item.query}
                                    </td>
                                    {/* Execution count */}
                                    <td className="px-5 py-3 text-right text-slate-700 dark:text-slate-200 font-semibold tabular-nums">
                                        {item.count.toLocaleString()}
                                    </td>
                                    {/* Average confidence score formatted to 2 decimal places */}
                                    <td className="px-5 py-3 text-right text-slate-700 dark:text-slate-200 tabular-nums">
                                        {item.avg_confidence.toFixed(2)}
                                    </td>
                                </tr>
                            ))}

                            {/* Empty state when no queries available */}
                            {queries.length === 0 && (
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
