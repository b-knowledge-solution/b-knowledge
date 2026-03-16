/**
 * @fileoverview Audit log page for administrators.
 * Composes from useAuditLogs hook, AuditFilterContext, and reusable components.
 *
 * @module features/audit/pages/AuditLogPage
 */
import { useState, useEffect } from 'react'
import { useAuth } from '@/features/auth'
import { useTranslation } from 'react-i18next'
import {
    Search,
    Filter,
    RefreshCw,
    User,
    Clock,
    Globe,
    FileText,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Pagination } from '@/components/ui/pagination'
import { Spinner } from '@/components/ui/spinner'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { useFirstVisit, GuidelineDialog } from '@/features/guideline'
import { AuditFilterProvider, useAuditFilters } from '../hooks/useAuditFilterContext'
import { useAuditLogs } from '../hooks/useAuditLogs'
import { AuditFilterPanel } from '../components/AuditFilterPanel'
import {
    AuditActionBadge,
    formatResourceType,
    formatDateTime,
    formatDetails,
} from '../components/AuditActionBadge'

// ============================================================================
// Inner Page (wrapped by provider)
// ============================================================================

/**
 * @description Inner page component — has access to AuditFilterContext.
 * @returns {JSX.Element} The audit log table and controls.
 */
function AuditLogPageContent() {
    const { t } = useTranslation()
    const { user: currentUser } = useAuth()
    const { filters, setFilter, showFilters, toggleFilters, hasActiveFilters } = useAuditFilters()
    const {
        logs,
        pagination,
        isLoading,
        actionTypes,
        resourceTypes,
        handlePageChange,
        refresh,
    } = useAuditLogs()

    // Guideline dialog — shows onboarding guide on user's first visit
    const { isFirstVisit } = useFirstVisit('audit')
    const [showGuide, setShowGuide] = useState(false)
    useEffect(() => {
        // Trigger guide dialog when first-visit flag is detected
        if (isFirstVisit) setShowGuide(true)
    }, [isFirstVisit])

    // Admin-only guard
    if (currentUser?.role !== 'admin') {
        return (
            <div className="text-center text-slate-600 dark:text-slate-400 p-8">
                {t('auditLog.noPermission')}
            </div>
        )
    }

    return (
        <div className="w-full h-full flex flex-col p-6">
            {/* Header: Search + Filter Toggle + Refresh */}
            <div className="mb-4 space-y-4">
                <div className="flex items-center gap-4">
                    {/* Search Input */}
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder={t('auditLog.searchPlaceholder')}
                            value={filters.search}
                            onChange={(e) => setFilter('search', e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                    </div>

                    {/* Filter Toggle */}
                    <button
                        onClick={toggleFilters}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${showFilters || hasActiveFilters
                            ? 'bg-primary-50 border-primary-300 text-primary-700 dark:bg-primary-900/30 dark:border-primary-700 dark:text-primary-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                    >
                        <Filter className="w-4 h-4" />
                        {t('auditLog.filters')}
                        {hasActiveFilters && (
                            <span className="ml-1 w-2 h-2 rounded-full bg-primary-500" />
                        )}
                    </button>

                    {/* Refresh */}
                    <button
                        onClick={refresh}
                        disabled={isLoading}
                        className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                        title={t('auditLog.refresh')}
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {/* Filter Panel */}
                <AuditFilterPanel actionTypes={actionTypes} resourceTypes={resourceTypes} />
            </div>

            {/* Data Table */}
            <Card className="dark:bg-slate-800 dark:border-slate-700 flex-1 min-h-0 overflow-hidden">
                <CardContent className="p-0 h-full flex flex-col">
                    <div className="flex-1 overflow-auto p-4">
                        {isLoading ? (
                            <div className="flex justify-center items-center h-32">
                                <Spinner />
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[200px]">
                                            <div className="flex items-center gap-1 whitespace-nowrap">
                                                <Clock className="w-3 h-3" />
                                                {t('auditLog.timestamp')}
                                            </div>
                                        </TableHead>
                                        <TableHead>
                                            <div className="flex items-center gap-1 whitespace-nowrap">
                                                <User className="w-3 h-3" />
                                                {t('auditLog.user')}
                                            </div>
                                        </TableHead>
                                        <TableHead className="w-[160px]">
                                            <span className="whitespace-nowrap">{t('auditLog.action')}</span>
                                        </TableHead>
                                        <TableHead className="w-[180px]">
                                            <span className="whitespace-nowrap">{t('auditLog.resourceType')}</span>
                                        </TableHead>
                                        <TableHead className="w-[400px]">
                                            <div className="flex items-center gap-1 whitespace-nowrap">
                                                <FileText className="w-3 h-3" />
                                                {t('auditLog.details')}
                                            </div>
                                        </TableHead>
                                        <TableHead>
                                            <div className="flex items-center gap-1 whitespace-nowrap">
                                                <Globe className="w-3 h-3" />
                                                {t('auditLog.ipAddress')}
                                            </div>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {logs.map((log) => (
                                        <TableRow key={log.id}>
                                            <TableCell>
                                                <span className="whitespace-nowrap">{formatDateTime(log.created_at)}</span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-6 w-6">
                                                        <AvatarFallback className="bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-xs">
                                                            {(log.user_email || '?').charAt(0).toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <span className="truncate max-w-[200px]" title={log.user_email}>
                                                        {log.user_email}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <AuditActionBadge action={log.action} />
                                            </TableCell>
                                            <TableCell>
                                                <div className="whitespace-nowrap">{formatResourceType(log.resource_type, t)}</div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="whitespace-nowrap truncate max-w-[400px]" title={formatDetails(log.details)}>
                                                    {formatDetails(log.details)}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{log.ip_address || '-'}</span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                    {/* Only show pagination controls when results exceed page size */}
                    {pagination.total > pagination.limit && (
                        <div className="flex justify-end p-4 border-t border-slate-200 dark:border-slate-700">
                            <Pagination
                                currentPage={pagination.page}
                                totalPages={Math.ceil(pagination.total / pagination.limit)}
                                onPageChange={(page) => handlePageChange(page, pagination.limit)}
                            />
                        </div>
                    )}
                </CardContent>
            </Card>

            <GuidelineDialog
                open={showGuide}
                onClose={() => setShowGuide(false)}
                featureId="audit"
            />
        </div>
    )
}

// ============================================================================
// Export — wraps content in provider
// ============================================================================

/**
 * @description Audit Log Page with filter context provider.
 * @returns {JSX.Element} The rendered Audit Log page.
 */
export default function AuditLogPage() {
    return (
        <AuditFilterProvider>
            <AuditLogPageContent />
        </AuditFilterProvider>
    )
}
