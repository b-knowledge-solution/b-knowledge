/**
 * @fileoverview User management page for administrators.
 * Composes from useUserManagement hook and extracted dialog/toolbar components.
 * @module features/users/pages/UserManagementPage
 */
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Mail, ShieldCheck, Globe, Pencil, Trash2 } from 'lucide-react'
import { useAuth, User } from '@/features/auth'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Pagination } from '@/components/ui/pagination'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { useConfirm } from '@/components/ConfirmDialog'
import { useFirstVisit, GuidelineDialog } from '@/features/guideline'
import { useUserManagement, useDeleteUser } from '../api/userQueries'
import { UserToolbar } from '../components/UserToolbar'
import { EditRoleDialog } from '../components/EditRoleDialog'
import { IpHistoryDialog } from '../components/IpHistoryDialog'
import { GrantPermissionsDialog } from '../components/GrantPermissionsDialog'
import { CreateUserDialog } from '../components/CreateUserDialog'
import { EditUserDialog } from '../components/EditUserDialog'

/**
 * @description User management page composing hook + components. Admin-only.
 * @returns {JSX.Element} The rendered page.
 */
export default function UserManagementPage() {
    const { t } = useTranslation()
    const { user: currentUser } = useAuth()
    const confirm = useConfirm()

    // Guideline dialog
    const { isFirstVisit } = useFirstVisit('users')
    const [showGuide, setShowGuide] = useState(false)
    useEffect(() => {
        if (isFirstVisit) setShowGuide(true)
    }, [isFirstVisit])

    // Hook
    const mgmt = useUserManagement()

    // Delete mutation
    const deleteUser = useDeleteUser()

    // Dialog state
    const [selectedUser, setSelectedUser] = useState<User | null>(null)
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [isEditUserOpen, setIsEditUserOpen] = useState(false)
    const [isEditRoleOpen, setIsEditRoleOpen] = useState(false)
    const [isIpHistoryOpen, setIsIpHistoryOpen] = useState(false)
    const [isPermissionsOpen, setIsPermissionsOpen] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    // Loading / error early returns
    if (mgmt.isLoading) {
        return (
            <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-600"></div>
            </div>
        )
    }
    if (mgmt.error) {
        return <div className="text-center text-red-600 p-4">{mgmt.error}</div>
    }
    if (currentUser?.role !== 'admin') {
        return <div className="text-center text-slate-600 dark:text-slate-400 p-8">{t('userManagement.noPermission')}</div>
    }

    /** Role color helper */
    const roleBadgeVariant = (role: string) => {
        if (role === 'admin') return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
        if (role === 'leader') return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
        return ''
    }

    /** Role labels */
    const roleLabels: Record<string, string> = {
        admin: t('userManagement.admin'),
        leader: t('userManagement.leader'),
        user: t('userManagement.userRole'),
    }

    /** Handle delete with confirmation dialog */
    const handleDelete = async (record: User) => {
        const name = record.displayName || record.email || ''
        const confirmed = await confirm({
            title: t('userManagement.deleteUser', 'Delete User'),
            message: t('userManagement.confirmDeleteUserMessage', 'Are you sure you want to delete {{name}}? This action cannot be undone.', { name }),
            confirmText: t('common.delete', 'Delete'),
            variant: 'danger',
        })
        if (confirmed) {
            deleteUser.mutate(record.id)
        }
    }

    return (
        <>
            <div className="w-full h-full flex flex-col p-6">
                <Card className="dark:bg-slate-800 dark:border-slate-700 flex-1 min-h-0 overflow-hidden">
                    <CardContent className="p-0 h-full flex flex-col">
                        <UserToolbar
                            searchQuery={mgmt.searchQuery}
                            onSearchChange={mgmt.setSearchQuery}
                            roleFilter={mgmt.roleFilter}
                            onRoleFilterChange={mgmt.setRoleFilter}
                            departmentFilter={mgmt.departmentFilter}
                            onDepartmentFilterChange={mgmt.setDepartmentFilter}
                            departments={mgmt.departments}
                            onCreateUser={() => setIsCreateOpen(true)}
                        />

                        <div className="flex-1 overflow-auto p-4">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t('userManagement.user')}</TableHead>
                                        <TableHead>{t('userManagement.email')}</TableHead>
                                        <TableHead>{t('userManagement.department')}</TableHead>
                                        <TableHead>{t('userManagement.role')}</TableHead>
                                        <TableHead className="text-right">{t('userManagement.actions')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {mgmt.paginatedUsers.map((record) => {
                                        const hasIpHistory = (mgmt.ipHistoryMap[record.id] || []).length > 0
                                        return (
                                            <TableRow key={record.id}>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Avatar className="h-8 w-8">
                                                            <AvatarFallback className="bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 font-medium text-sm">
                                                                {(record.displayName || record.email || '?').charAt(0).toUpperCase()}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <span className="font-medium text-slate-900 dark:text-white">{record.displayName || record.email}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Mail className="w-4 h-4 text-slate-400" />
                                                        <span className="text-slate-600 dark:text-slate-300">{record.email}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-slate-600 dark:text-slate-300">{record.department || '-'}</span>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant={record.role === 'admin' || record.role === 'leader' ? 'default' : 'secondary'}
                                                        className={`capitalize ${roleBadgeVariant(record.role || '')}`}
                                                    >
                                                        {roleLabels[record.role || ''] || record.role}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {/* IP History */}
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={() => { setSelectedUser(record); setIsIpHistoryOpen(true) }}
                                                                        disabled={!hasIpHistory}
                                                                        className={hasIpHistory ? 'text-slate-400 hover:text-primary-600' : ''}
                                                                    >
                                                                        <Globe className="w-4 h-4" />
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>{t('userManagement.viewIpHistory')}</TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>

                                                        {/* Edit Profile */}
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={() => { setSelectedUser(record); setIsEditUserOpen(true) }}
                                                                        className="text-slate-400 hover:text-blue-600"
                                                                    >
                                                                        <Pencil className="w-4 h-4" />
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>{t('userManagement.editUser', 'Edit User')}</TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>

                                                        {/* Edit Role */}
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={() => { setSelectedUser(record); setSaveError(null); setIsEditRoleOpen(true) }}
                                                                        className="text-slate-400 hover:text-primary-600"
                                                                    >
                                                                        <ShieldCheck className="w-4 h-4" />
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>{t('userManagement.editRole')}</TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>

                                                        {/* Delete User — prevent self-deletion */}
                                                        {record.id !== currentUser?.id && (
                                                            <TooltipProvider>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={() => handleDelete(record)}
                                                                            className="text-slate-400 hover:text-red-600"
                                                                        >
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </Button>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>{t('userManagement.deleteUser', 'Delete User')}</TooltipContent>
                                                                </Tooltip>
                                                            </TooltipProvider>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>

                        {mgmt.filteredCount > mgmt.pageSize && (
                            <div className="flex justify-end p-4 border-t border-slate-200 dark:border-slate-700">
                                <Pagination
                                    currentPage={mgmt.currentPage}
                                    totalPages={Math.ceil(mgmt.filteredCount / mgmt.pageSize)}
                                    onPageChange={(page) => mgmt.handlePaginationChange(page, mgmt.pageSize)}
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Dialogs */}
            <CreateUserDialog
                open={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
            />

            <EditUserDialog
                open={isEditUserOpen}
                onClose={() => setIsEditUserOpen(false)}
                user={selectedUser}
            />

            <IpHistoryDialog
                open={isIpHistoryOpen}
                onClose={() => setIsIpHistoryOpen(false)}
                user={selectedUser}
                ipHistory={selectedUser ? (mgmt.ipHistoryMap[selectedUser.id] || []) : []}
            />

            <EditRoleDialog
                open={isEditRoleOpen}
                onClose={() => setIsEditRoleOpen(false)}
                user={selectedUser}
                onSave={(userId, role) => {
                    mgmt.updateRole(userId, role)
                    setIsEditRoleOpen(false)
                }}
                saveError={saveError}
            />

            <GrantPermissionsDialog
                open={isPermissionsOpen}
                onClose={() => setIsPermissionsOpen(false)}
                user={selectedUser}
                onSave={(userId, permissions) => {
                    mgmt.updatePermissions(userId, permissions)
                    setIsPermissionsOpen(false)
                }}
            />

            <GuidelineDialog
                open={showGuide}
                onClose={() => setShowGuide(false)}
                featureId="users"
            />
        </>
    )
}
