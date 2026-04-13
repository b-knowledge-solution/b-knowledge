/**
 * @fileoverview Read-only profile display tab for the user detail page.
 * @module features/users/components/UserProfileTab
 */
import { useTranslation } from 'react-i18next'
import type { User } from '@/features/auth'

/**
 * @description Props for {@link UserProfileTab}.
 */
export interface UserProfileTabProps {
  /** The user whose profile fields are being displayed. */
  user: User
}

/**
 * @description Renders a labelled key/value list summarising a user's profile.
 * Read-only — editing happens elsewhere via {@link useUpdateUser} mutations.
 *
 * @param {UserProfileTabProps} props - The user to render.
 * @returns {JSX.Element} A two-column profile card with dark-mode support.
 */
export function UserProfileTab({ user }: UserProfileTabProps) {
  const { t } = useTranslation()

  // Render the profile as a static definition list. No editing surface here.
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
            {t('users.detail.fields.displayName')}
          </dt>
          <dd className="mt-1 text-sm text-slate-900 dark:text-white">
            {user.displayName || user.name || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
            {t('users.detail.fields.email')}
          </dt>
          <dd className="mt-1 text-sm text-slate-900 dark:text-white">
            {user.email || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
            {t('users.detail.fields.role')}
          </dt>
          <dd className="mt-1 text-sm text-slate-900 dark:text-white">
            {user.role || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
            {t('users.detail.fields.department')}
          </dt>
          <dd className="mt-1 text-sm text-slate-900 dark:text-white">
            {user.department || '—'}
          </dd>
        </div>
      </dl>
    </div>
  )
}

export default UserProfileTab
