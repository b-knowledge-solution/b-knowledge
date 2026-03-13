/**
 * @fileoverview Table showing the most active users on the dashboard.
 * Features rank badges (gold/silver/bronze), alternating rows,
 * hover highlights, and proportional progress bars for session counts.
 * @module features/dashboard/components/TopUsersTable
 */
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import type { TopUser } from '../types/dashboard.types'

// ============================================================================
// Types
// ============================================================================

interface TopUsersTableProps {
    /** Array of top user entries */
    topUsers: TopUser[]
    /** Current limit of users to display */
    limit: number
    /** Callback when limit changes */
    onLimitChange: (limit: number) => void
}

// ============================================================================
// Constants
// ============================================================================

/** Badge colours for top-3 ranked users */
const RANK_STYLES: Record<number, { bg: string; text: string; ring: string }> = {
    1: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', ring: 'ring-amber-300/50' },
    2: { bg: 'bg-slate-100 dark:bg-slate-700/40', text: 'text-slate-600 dark:text-slate-300', ring: 'ring-slate-300/50' },
    3: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', ring: 'ring-orange-300/50' },
}

/** Available limit options */
const LIMIT_OPTIONS = [5, 10, 20]

// ============================================================================
// Component
// ============================================================================

/**
 * @description Premium table rendering the top users by session count.
 * Includes rank badges for the top 3, alternating row backgrounds,
 * and proportional mini-progress bars for visual comparison.
 * @param {TopUsersTableProps} props - Component props.
 * @returns {JSX.Element} Top users table card.
 */
export function TopUsersTable({ topUsers, limit, onLimitChange }: TopUsersTableProps) {
    const { t } = useTranslation()

    // Calculate max sessions for progress bar proportions
    const maxSessions = topUsers.length > 0
        ? Math.max(...topUsers.map((u) => u.sessionCount))
        : 1

    return (
        <Card className="border border-slate-200 dark:border-slate-700 shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-semibold text-slate-800 dark:text-slate-100">
                    {t('dashboard.topUsers')}
                </CardTitle>
                {/* Limit selector */}
                <Select
                    value={String(limit)}
                    onValueChange={(v: string) => onLimitChange(Number(v))}
                >
                    <SelectTrigger className="w-20 h-8 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {LIMIT_OPTIONS.map((n) => (
                            <SelectItem key={n} value={String(n)}>
                                Top {n}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </CardHeader>
            <CardContent className="px-0 pb-0">
                {/* Scrollable container for small screens */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700">
                                <th className="px-5 py-2.5 text-left font-medium text-slate-500 dark:text-slate-400 w-12">
                                    #
                                </th>
                                <th className="px-5 py-2.5 text-left font-medium text-slate-500 dark:text-slate-400">
                                    {t('dashboard.user')}
                                </th>
                                <th className="px-5 py-2.5 text-right font-medium text-slate-500 dark:text-slate-400">
                                    {t('dashboard.sessions')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {topUsers.map((user, index) => {
                                const rank = index + 1
                                const style = RANK_STYLES[rank]
                                // Progress width as percentage of max
                                const pct = Math.round(
                                    (user.sessionCount / maxSessions) * 100,
                                )

                                return (
                                    <tr
                                        key={user.email}
                                        className={`
                                            border-b border-slate-100 dark:border-slate-800 last:border-0
                                            transition-colors duration-150
                                            hover:bg-slate-50 dark:hover:bg-slate-800/60
                                            ${index % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}
                                        `}
                                    >
                                        {/* Rank badge */}
                                        <td className="px-5 py-3">
                                            {style ? (
                                                <span
                                                    className={`
                                                        inline-flex items-center justify-center
                                                        w-7 h-7 rounded-full text-xs font-bold
                                                        ring-1 ${style.bg} ${style.text} ${style.ring}
                                                    `}
                                                >
                                                    {rank}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center justify-center w-7 h-7 text-xs text-slate-400 dark:text-slate-500">
                                                    {rank}
                                                </span>
                                            )}
                                        </td>

                                        {/* User email */}
                                        <td className="px-5 py-3 text-slate-700 dark:text-slate-200 font-medium truncate max-w-[200px]">
                                            {user.email}
                                        </td>

                                        {/* Sessions count + mini bar */}
                                        <td className="px-5 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2.5">
                                                {/* Mini progress bar */}
                                                <div className="w-20 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-blue-500 dark:bg-blue-400 transition-all duration-500"
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                                <span className="text-slate-700 dark:text-slate-200 font-semibold tabular-nums min-w-[2rem] text-right">
                                                    {user.sessionCount}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}

                            {/* Empty state */}
                            {topUsers.length === 0 && (
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

export default TopUsersTable
