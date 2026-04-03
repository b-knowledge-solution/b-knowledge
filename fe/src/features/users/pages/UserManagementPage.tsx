/**
 * @fileoverview User management page for administrators.
 * Composes from useUserManagement hook and extracted dialog/toolbar components.
 * @module features/users/pages/UserManagementPage
 */
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppAbility } from '@/lib/ability'
import { Card, CardContent } from '@/components/ui/card'
import { Pagination } from '@/components/ui/pagination'
import { useFirstVisit, GuidelineDialog } from '@/features/guideline'
import { useUserManagement } from '../api/userQueries'
import { UserToolbar } from '../components/UserToolbar'
import { RoleManagementTable } from '../components/RoleManagementTable'
import { CreateUserDialog } from '../components/CreateUserDialog'

/**
 * @description User management page composing hook + components. Admin-only.
 * @returns {JSX.Element} The rendered page.
 */
export default function UserManagementPage() {
    const { t } = useTranslation()
    const ability = useAppAbility()

    // Guideline dialog
    const { isFirstVisit } = useFirstVisit('users')
    const [showGuide, setShowGuide] = useState(false)
    useEffect(() => {
        if (isFirstVisit) setShowGuide(true)
    }, [isFirstVisit])

    // Hook for user management with filtering, pagination, and role mutation
    const mgmt = useUserManagement()

    // Dialog state for create user
    const [isCreateOpen, setIsCreateOpen] = useState(false)

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
    // Guard with CASL ability -- only admins and super-admins can manage users
    if (!ability.can('manage', 'User')) {
        return (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                <h3 className="text-lg font-semibold text-foreground">{t('accessControl.accessDenied.title')}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t('accessControl.accessDenied.message')}</p>
            </div>
        )
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
                            sourceFilter={mgmt.sourceFilter}
                            onSourceFilterChange={mgmt.setSourceFilter}
                            onCreateUser={() => setIsCreateOpen(true)}
                        />

                        {/* Role management table with inline role assignment dropdowns */}
                        <div className="flex-1 overflow-auto p-4">
                            <RoleManagementTable
                                members={mgmt.paginatedUsers}
                                isLoading={mgmt.isLoading}
                                onRoleChange={(userId, role) => mgmt.updateRole(userId, role)}
                            />
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

            <GuidelineDialog
                open={showGuide}
                onClose={() => setShowGuide(false)}
                featureId="users"
            />
        </>
    )
}
