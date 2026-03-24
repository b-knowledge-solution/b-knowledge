/**
 * @fileoverview Create User dialog for admin-only local user provisioning.
 * @module features/users/components/CreateUserDialog
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useCreateUser } from '../api/userQueries'
import type { CreateUserDto } from '../types/user.types'

interface CreateUserDialogProps {
    /** Whether the dialog is open */
    open: boolean
    /** Close the dialog */
    onClose: () => void
}

/** Initial empty form state */
const INITIAL_FORM: CreateUserDto = {
    email: '',
    display_name: '',
    password: '',
    role: 'user',
    department: '',
    job_title: '',
    mobile_phone: '',
}

/**
 * @description Dialog for creating a new local user with optional password.
 * @param props - Dialog open state and close handler.
 * @returns Dialog element.
 */
export function CreateUserDialog({ open, onClose }: CreateUserDialogProps) {
    const { t } = useTranslation()
    const [form, setForm] = useState<CreateUserDto>(INITIAL_FORM)
    const [showPassword, setShowPassword] = useState(false)
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CreateUserDto, string>>>({})

    // Mutation hook
    const createUser = useCreateUser()

    /** Update a single form field */
    const setField = <K extends keyof CreateUserDto>(key: K, value: CreateUserDto[K]) => {
        setForm(prev => ({ ...prev, [key]: value }))
        // Clear field error on change
        setFieldErrors(prev => ({ ...prev, [key]: undefined }))
    }

    /** Validate the form and return whether it's valid */
    const validate = (): boolean => {
        const errors: Partial<Record<keyof CreateUserDto, string>> = {}
        // Email is required
        if (!form.email?.trim()) {
            errors.email = t('userManagement.emailRequired', 'Email is required')
        } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) {
            errors.email = t('userManagement.invalidEmail', 'Invalid email address')
        }
        // Password must be at least 6 characters if provided
        if (form.password && form.password.length < 6) {
            errors.password = t('userManagement.passwordMinLength', 'Password must be at least 6 characters')
        }
        setFieldErrors(errors)
        return Object.keys(errors).length === 0
    }

    /** Handle form submission */
    const handleSubmit = () => {
        if (!validate()) return

        // Strip empty optional fields
        const payload: CreateUserDto = {
            email: form.email.trim(),
            role: form.role || 'user',
            ...(form.display_name?.trim() && { display_name: form.display_name.trim() }),
            ...(form.password && { password: form.password }),
            ...(form.department?.trim() && { department: form.department.trim() }),
            ...(form.job_title?.trim() && { job_title: form.job_title.trim() }),
            ...(form.mobile_phone?.trim() && { mobile_phone: form.mobile_phone.trim() }),
        }

        createUser.mutate(payload, {
            onSuccess: () => {
                // Reset form and close on success
                setForm(INITIAL_FORM)
                setFieldErrors({})
                onClose()
            },
        })
    }

    /** Reset and close */
    const handleClose = () => {
        setForm(INITIAL_FORM)
        setFieldErrors({})
        createUser.reset()
        onClose()
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[500px] dark:bg-slate-800 dark:border-slate-700">
                <DialogHeader>
                    <DialogTitle className="text-slate-900 dark:text-white">
                        {t('userManagement.createUser', 'Create User')}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Email (required) */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            {t('userManagement.email', 'Email')} *
                        </label>
                        <input
                            type="email"
                            value={form.email}
                            onChange={e => setField('email', e.target.value)}
                            placeholder={t('userManagement.emailPlaceholder', 'user@example.com')}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                        {fieldErrors.email && (
                            <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {fieldErrors.email}
                            </p>
                        )}
                    </div>

                    {/* Display Name */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            {t('userManagement.displayName', 'Display Name')}
                        </label>
                        <input
                            type="text"
                            value={form.display_name}
                            onChange={e => setField('display_name', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                    </div>

                    {/* Password (optional) */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            {t('userManagement.passwordOptional', 'Password (optional)')}
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={form.password}
                                onChange={e => setField('password', e.target.value)}
                                placeholder={t('userManagement.passwordMinLength', 'At least 6 characters')}
                                className="w-full px-3 py-2 pr-10 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                            {/* Toggle password visibility */}
                            <button
                                type="button"
                                onClick={() => setShowPassword(v => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {fieldErrors.password && (
                            <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {fieldErrors.password}
                            </p>
                        )}
                    </div>

                    {/* Role */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            {t('userManagement.role', 'Role')}
                        </label>
                        <select
                            value={form.role}
                            onChange={e => setField('role', e.target.value as any)}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                        >
                            <option value="user">{t('userManagement.userRole', 'User')}</option>
                            <option value="leader">{t('userManagement.leader', 'Leader')}</option>
                            <option value="admin">{t('userManagement.admin', 'Admin')}</option>
                        </select>
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
                    {createUser.isError && (
                        <div className="flex items-center gap-2 text-red-500 text-sm p-2 rounded-md bg-red-50 dark:bg-red-900/20">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {(createUser.error as any)?.message || t('userManagement.createUserError', 'Failed to create user')}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>
                        {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button onClick={handleSubmit} disabled={createUser.isPending}>
                        {createUser.isPending
                            ? t('common.saving', 'Saving...')
                            : t('userManagement.createUser', 'Create User')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
