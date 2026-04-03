/**
 * @fileoverview Edit User dialog for updating a user's profile fields.
 * @module features/users/components/EditUserDialog
 */
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useUpdateUser } from '../api/userQueries'
import type { User } from '@/features/auth'
import type { UpdateUserDto } from '../types/user.types'

interface EditUserDialogProps {
    /** Whether the dialog is open */
    open: boolean
    /** Close the dialog */
    onClose: () => void
    /** User being edited */
    user: User | null
}

/**
 * @description Dialog for editing a user's profile (display name, department, job title, mobile phone).
 * Excludes email and password — those require separate admin flows.
 * @param props - Dialog state and user.
 * @returns Dialog element.
 */
export function EditUserDialog({ open, onClose, user }: EditUserDialogProps) {
    const { t } = useTranslation()
    const [form, setForm] = useState<UpdateUserDto>({
        display_name: '',
        department: '',
        job_title: '',
        mobile_phone: '',
    })

    // Mutation hook
    const updateUser = useUpdateUser()

    // Pre-fill form when user or open state changes
    useEffect(() => {
        if (user) {
            setForm({
                // User type uses displayName (camelCase), snake_case used only in DTO
                display_name: user.displayName || user.name || '',
                department: user.department || '',
                job_title: user.job_title || '',
                mobile_phone: user.mobile_phone || '',
            })
        }
    }, [user, open])

    /** Update a single form field */
    const setField = <K extends keyof UpdateUserDto>(key: K, value: UpdateUserDto[K]) => {
        setForm(prev => ({ ...prev, [key]: value }))
    }

    /** Handle form submission */
    const handleSubmit = () => {
        if (!user) return

        // Build payload with only non-empty values; omit undefined to satisfy exactOptionalPropertyTypes
        const payload: UpdateUserDto = {
            ...(form.display_name?.trim() ? { display_name: form.display_name.trim() } : {}),
            department: form.department?.trim() || null,
            job_title: form.job_title?.trim() || null,
            mobile_phone: form.mobile_phone?.trim() || null,
        }

        updateUser.mutate({ userId: user.id, data: payload }, {
            onSuccess: () => {
                onClose()
            },
        })
    }

    /** Close and reset error */
    const handleClose = () => {
        updateUser.reset()
        onClose()
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[500px] dark:bg-slate-800 dark:border-slate-700">
                <DialogHeader>
                    <DialogTitle className="text-slate-900 dark:text-white">
                        {t('userManagement.editUser', 'Edit User')}
                    </DialogTitle>
                    {user && (
                        <p className="text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
                    )}
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Display Name */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            {t('userManagement.displayName', 'Display Name')}
                        </label>
                        <input
                            type="text"
                            value={form.display_name ?? ''}
                            onChange={e => setField('display_name', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                    </div>

                    {/* Department */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            {t('userManagement.department', 'Department')}
                        </label>
                        <input
                            type="text"
                            value={form.department ?? ''}
                            onChange={e => setField('department', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                    </div>

                    {/* Job Title */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            {t('userManagement.jobTitle', 'Job Title')}
                        </label>
                        <input
                            type="text"
                            value={form.job_title ?? ''}
                            onChange={e => setField('job_title', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                    </div>

                    {/* Mobile Phone */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            {t('userManagement.mobilePhone', 'Mobile Phone')}
                        </label>
                        <input
                            type="text"
                            value={form.mobile_phone ?? ''}
                            onChange={e => setField('mobile_phone', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                    </div>

                    {/* Server-side error */}
                    {updateUser.isError && (
                        <div className="flex items-center gap-2 text-red-500 text-sm p-2 rounded-md bg-red-50 dark:bg-red-900/20">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {(updateUser.error as any)?.message || t('userManagement.updateUserError', 'Failed to update user')}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>
                        {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button onClick={handleSubmit} disabled={updateUser.isPending || !user}>
                        {updateUser.isPending
                            ? t('common.saving', 'Saving...')
                            : t('common.save', 'Save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
