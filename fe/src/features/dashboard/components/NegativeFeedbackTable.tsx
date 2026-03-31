/**
 * @fileoverview Table displaying recent negative feedback entries with source badges and Langfuse deep links.
 * Shows source type, query text, answer snippet, date, and "View in Langfuse" action when traceId exists.
 * @module features/dashboard/components/NegativeFeedbackTable
 */
import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { FeedbackAnalytics } from '../types/dashboard.types'

// ============================================================================
// Types
// ============================================================================

interface NegativeFeedbackTableProps {
    /** Array of negative feedback entries */
    feedback: FeedbackAnalytics['negativeFeedback']
    /** Base URL for constructing Langfuse trace links */
    langfuseBaseUrl: string
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Truncate a string to maxLen characters with ellipsis.
 * @param {string} text - Input text.
 * @param {number} maxLen - Maximum character count.
 * @returns {string} Truncated text.
 */
const truncate = (text: string, maxLen: number): string =>
    text.length > maxLen ? `${text.slice(0, maxLen)}...` : text

/**
 * @description Build a Langfuse trace URL from the base URL and trace ID.
 * Strips trailing slash from base URL to prevent double-slash.
 * @param {string} baseUrl - Langfuse base URL.
 * @param {string} traceId - Trace identifier.
 * @returns {string} Full Langfuse trace URL.
 */
const buildLangfuseUrl = (baseUrl: string, traceId: string): string =>
    `${baseUrl.replace(/\/$/, '')}/trace/${traceId}`

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
 * @description Table card showing recent negative feedback with source badge, query, answer, date,
 * and a "View in Langfuse" link for entries that have a trace_id.
 * @param {NegativeFeedbackTableProps} props - Component props.
 * @returns {JSX.Element} Negative feedback table card.
 */
export function NegativeFeedbackTable({ feedback, langfuseBaseUrl }: NegativeFeedbackTableProps) {
    const { t } = useTranslation()

    return (
        <Card className="border border-slate-200 dark:border-slate-700 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-slate-800 dark:text-slate-100">
                    {t('dashboard.feedback.negativeFeedback')}
                </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700">
                                <th className="px-5 py-2.5 text-left font-medium text-slate-500 dark:text-slate-400 w-24">
                                    {t('dashboard.feedback.sourceColumn')}
                                </th>
                                <th className="px-5 py-2.5 text-left font-medium text-slate-500 dark:text-slate-400">
                                    {t('dashboard.analytics.queryColumn')}
                                </th>
                                <th className="px-5 py-2.5 text-left font-medium text-slate-500 dark:text-slate-400">
                                    {t('dashboard.feedback.answerColumn')}
                                </th>
                                <th className="px-5 py-2.5 text-right font-medium text-slate-500 dark:text-slate-400 w-32">
                                    {t('dashboard.feedback.dateColumn')}
                                </th>
                                <th className="px-5 py-2.5 text-right font-medium text-slate-500 dark:text-slate-400 w-36">
                                    {t('dashboard.feedback.actionsColumn')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {feedback.map((item, index) => (
                                <tr
                                    key={item.id}
                                    className={`
                                        border-b border-slate-100 dark:border-slate-800 last:border-0
                                        transition-colors duration-150
                                        hover:bg-slate-50 dark:hover:bg-slate-800/60
                                        ${index % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}
                                    `}
                                >
                                    {/* Source type badge with color coding */}
                                    <td className="px-5 py-3">
                                        {item.source ? (
                                            <Badge variant="outline" className={getSourceBadgeClasses(item.source)}>
                                                {item.source}
                                            </Badge>
                                        ) : (
                                            <span className="text-xs text-slate-400">-</span>
                                        )}
                                    </td>
                                    {/* Query text truncated to 100 characters */}
                                    <td className="px-5 py-3 text-slate-700 dark:text-slate-200 max-w-[250px]">
                                        {truncate(item.query, 100)}
                                    </td>
                                    {/* Answer preview text truncated to 100 characters */}
                                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300 max-w-[250px]">
                                        {truncate(item.answerPreview, 100)}
                                    </td>
                                    {/* Relative date using formatDistanceToNow */}
                                    <td className="px-5 py-3 text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                                    </td>
                                    {/* Actions -- Langfuse link or disabled text */}
                                    <td className="px-5 py-3 text-right">
                                        {item.traceId ? (
                                            <a
                                                href={buildLangfuseUrl(langfuseBaseUrl, item.traceId)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline text-xs font-medium"
                                            >
                                                {t('dashboard.feedback.viewInLangfuse')}
                                                <ExternalLink className="w-3 h-3" />
                                            </a>
                                        ) : (
                                            <span
                                                className="text-xs text-slate-400 dark:text-slate-500 cursor-default"
                                                title={t('dashboard.feedback.langfuseUnavailable')}
                                            >
                                                {t('dashboard.feedback.viewInLangfuse')}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}

                            {/* Empty state when no negative feedback */}
                            {feedback.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={5}
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
