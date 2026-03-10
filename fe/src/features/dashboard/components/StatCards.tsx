/**
 * @fileoverview Summary statistic cards for the admin dashboard.
 * @module features/dashboard/components/StatCards
 */
import { useTranslation } from 'react-i18next'
import { MessageSquare, Search, Users, BarChart3 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { DashboardStats } from '../types/dashboard.types'

interface StatCardsProps {
    /** Dashboard statistics (null while loading) */
    stats: DashboardStats | null
}

interface StatItemProps {
    icon: React.ReactNode
    label: string
    value: number | string
}

function StatItem({ icon, label, value }: StatItemProps) {
    return (
        <Card>
            <CardContent className="p-5">
                <div className="flex items-center gap-3">
                    {icon}
                    <div>
                        <p className="text-sm text-muted-foreground">{label}</p>
                        <p className="text-2xl font-semibold">{value}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

/**
 * @description Row of 4 summary stat cards displaying key dashboard metrics.
 * @param props - Dashboard stats data.
 * @returns Stat cards row element.
 */
export function StatCards({ stats }: StatCardsProps) {
    const { t } = useTranslation()

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatItem
                icon={<MessageSquare size={18} className="text-blue-500" />}
                label={t('dashboard.stats.totalSessions')}
                value={stats?.totalSessions || 0}
            />
            <StatItem
                icon={<BarChart3 size={18} className="text-green-500" />}
                label={t('dashboard.stats.totalMessages')}
                value={stats?.totalMessages || 0}
            />
            <StatItem
                icon={<Users size={18} className="text-purple-500" />}
                label={t('dashboard.stats.uniqueUsers')}
                value={stats?.uniqueUsers || 0}
            />
            <StatItem
                icon={<Search size={18} className="text-orange-500" />}
                label={t('dashboard.stats.avgMessagesPerSession')}
                value={stats?.avgMessagesPerSession?.toFixed(1) || '0'}
            />
        </div>
    )
}
