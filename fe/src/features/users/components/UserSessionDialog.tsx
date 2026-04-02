/**
 * @fileoverview Dialog for viewing user IP history and active sessions.
 * Shown from the user management table action menu.
 * @module features/users/components/UserSessionDialog
 */
import { useTranslation } from 'react-i18next'
import { Globe, Monitor, Loader2, Wifi, WifiOff } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { useUserIpHistory, useUserSessions } from '../api/userQueries'
import type { User } from '@/features/auth'

// ============================================================================
// Types
// ============================================================================

/** @description Props for UserSessionDialog */
interface UserSessionDialogProps {
    /** Whether the dialog is open */
    open: boolean
    /** Close the dialog */
    onClose: () => void
    /** User to view sessions for */
    user: User | null
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Format an ISO date string to a localized short date-time.
 * @param dateStr - ISO date string
 * @returns Formatted date string or fallback
 */
function formatDateTime(dateStr: string): string {
    try {
        return new Date(dateStr).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    } catch {
        return dateStr
    }
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Dialog showing a user's IP access history and active sessions.
 * Uses tabs to switch between IP History and Active Sessions views.
 * Data is fetched lazily when the dialog opens.
 *
 * @param props - Dialog state and target user
 * @returns Dialog element with two tabs
 */
export function UserSessionDialog({ open, onClose, user }: UserSessionDialogProps) {
    const { t } = useTranslation()

    // Fetch data only when dialog is open and user is set
    const ipHistoryQuery = useUserIpHistory(user?.id ?? '', open && !!user)
    const sessionsQuery = useUserSessions(user?.id ?? '', open && !!user)

    const ipHistory = ipHistoryQuery.data ?? []
    const sessions = sessionsQuery.data ?? []

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px] dark:bg-slate-800 dark:border-slate-700 max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-slate-900 dark:text-white">
                        {t('userManagement.ipAndSessions', 'IP & Sessions')}
                    </DialogTitle>
                    {user && (
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {user.displayName || user.email}
                        </p>
                    )}
                </DialogHeader>

                <Tabs defaultValue="ip-history" className="flex-1 min-h-0 flex flex-col">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="ip-history" className="flex items-center gap-1.5">
                            <Globe className="h-3.5 w-3.5" />
                            {t('userManagement.ipHistoryTab', 'IP History')}
                        </TabsTrigger>
                        <TabsTrigger value="sessions" className="flex items-center gap-1.5">
                            <Monitor className="h-3.5 w-3.5" />
                            {t('userManagement.activeSessionsTab', 'Active Sessions')}
                        </TabsTrigger>
                    </TabsList>

                    {/* IP History Tab */}
                    <TabsContent value="ip-history" className="flex-1 overflow-auto mt-4">
                        {ipHistoryQuery.isLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : ipHistory.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <WifiOff className="h-10 w-10 text-muted-foreground mb-3" />
                                <p className="text-sm text-muted-foreground">
                                    {t('userManagement.noIpHistory', 'No access history')}
                                </p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t('userManagement.ipAddress', 'IP Address')}</TableHead>
                                        <TableHead>{t('userManagement.lastAccess', 'Last Access')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {ipHistory.map((record) => (
                                        <TableRow key={record.id}>
                                            <TableCell>
                                                <span className="inline-flex items-center gap-1.5 font-mono text-sm text-slate-700 dark:text-slate-300">
                                                    <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                                                    {record.ip_address}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-sm text-slate-500 dark:text-slate-400">
                                                {formatDateTime(record.last_accessed_at)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </TabsContent>

                    {/* Active Sessions Tab */}
                    <TabsContent value="sessions" className="flex-1 overflow-auto mt-4">
                        {sessionsQuery.isLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : sessions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <Monitor className="h-10 w-10 text-muted-foreground mb-3" />
                                <p className="text-sm text-muted-foreground">
                                    {t('userManagement.noActiveSessions', 'No active sessions')}
                                </p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t('userManagement.sessionId', 'Session')}</TableHead>
                                        <TableHead>{t('userManagement.ipAddress', 'IP Address')}</TableHead>
                                        <TableHead>{t('userManagement.lastActivity', 'Last Activity')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sessions.map((session) => (
                                        <TableRow key={session.sid}>
                                            <TableCell>
                                                <span className="font-mono text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                                                    {session.sid}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="inline-flex items-center gap-1.5 font-mono text-sm text-slate-700 dark:text-slate-300">
                                                    <Wifi className="h-3.5 w-3.5 text-blue-500" />
                                                    {session.ip}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-sm text-slate-500 dark:text-slate-400">
                                                {formatDateTime(session.lastActivity)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}
