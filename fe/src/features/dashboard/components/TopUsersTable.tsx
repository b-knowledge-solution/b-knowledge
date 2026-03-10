/**
 * @fileoverview Top users table for the admin dashboard.
 * @module features/dashboard/components/TopUsersTable
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import type { TopUser } from '../types/dashboard.types'

interface TopUsersTableProps {
    /** Array of top user data */
    topUsers: TopUser[]
    /** Current display limit */
    limit: number
    /** Callback to change display limit */
    onLimitChange: (limit: number) => void
}

/**
 * @description Table showing top active users with a limit selector.
 * @param props - Top user data, limit, and change handler.
 * @returns Table card element.
 */
export function TopUsersTable({ topUsers, limit, onLimitChange }: TopUsersTableProps) {
    const { t } = useTranslation()

    /** Sliced and ranked table data */
    const tableData = useMemo(() =>
        topUsers.slice(0, limit).map((user, index) => ({
            rank: index + 1,
            email: user.email,
            sessionCount: user.sessionCount,
        })),
        [topUsers, limit]
    )

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle>{t('dashboard.charts.topUsers')}</CardTitle>
                <Select
                    value={String(limit)}
                    onValueChange={(val: string) => onLimitChange(Number(val))}
                >
                    <SelectTrigger className="w-[100px] h-8">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="5">Top 5</SelectItem>
                        <SelectItem value="10">Top 10</SelectItem>
                        <SelectItem value="20">Top 20</SelectItem>
                        <SelectItem value="50">Top 50</SelectItem>
                    </SelectContent>
                </Select>
            </CardHeader>
            <CardContent>
                {tableData.length === 0 ? (
                    <EmptyState title={t('common.noData')} />
                ) : (
                    <div className="max-h-[260px] overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">#</TableHead>
                                    <TableHead>{t('common.email')}</TableHead>
                                    <TableHead className="w-[100px] text-right">
                                        {t('dashboard.charts.sessions')}
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tableData.map((row) => (
                                    <TableRow key={row.email}>
                                        <TableCell>{row.rank}</TableCell>
                                        <TableCell className="truncate max-w-[200px]">
                                            {row.email}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {row.sessionCount}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
