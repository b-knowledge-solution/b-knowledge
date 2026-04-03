/**
 * @fileoverview IP access history dialog component.
 * @module features/users/components/IpHistoryDialog
 */
import { useTranslation } from 'react-i18next'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import type { User } from '@/features/auth'
import type { UserIpHistory } from '../types/user.types'

interface IpHistoryDialogProps {
    /** Whether the dialog is open */
    open: boolean
    /** Close the dialog */
    onClose: () => void
    /** User whose history is being displayed */
    user: User | null
    /** IP history records for this user */
    ipHistory: UserIpHistory[]
}

/**
 * @description Dialog displaying a user's IP access history in a table.
 * @param props - Dialog state and data.
 * @returns Dialog element.
 */
export function IpHistoryDialog({ open, onClose, user, ipHistory }: IpHistoryDialogProps) {
    const { t } = useTranslation()

    /** Format a date string to locale string */
    const formatDate = (dateString: string) => new Date(dateString).toLocaleString()

    return (
        <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{t('userManagement.ipHistoryTitle')}</DialogTitle>
                </DialogHeader>
            <div className="py-4">
                {/* User info header */}
                {user && (
                    <div className="flex items-center gap-3 p-3 mb-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-medium">
                            {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div className="font-medium text-slate-900 dark:text-white">{user.displayName || user.email}</div>
                            <div className="text-sm text-slate-500 dark:text-slate-400">{user.email}</div>
                        </div>
                    </div>
                )}

                {/* IP History Table */}
                {ipHistory.length > 0 ? (
                    <div className="overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('userManagement.ipAddress')}</TableHead>
                                    <TableHead>{t('userManagement.lastAccess')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {ipHistory.map((record) => (
                                    <TableRow key={record.id}>
                                        <TableCell>
                                            <span className="font-mono">{record.ip_address}</span>
                                        </TableCell>
                                        <TableCell>{formatDate(record.last_accessed_at)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <div className="text-center text-slate-500 dark:text-slate-400 py-8">
                        {t('userManagement.noIpHistory')}
                    </div>
                )}
            </div>
                <DialogFooter>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        {t('common.close')}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
