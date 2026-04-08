/**
 * @fileoverview Per-user admin detail page with Profile + Permissions tabs.
 * Implements D-03 (persistent URL surface for per-user permission management).
 * @module features/users/pages/UserDetailPage
 */
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { OverrideEditor } from '@/features/permissions/components/OverrideEditor'
import { useUser } from '../api/userQueries'
import { UserProfileTab } from '../components/UserProfileTab'

// Tab value constants — never compared as bare strings (CLAUDE.md no-hardcoded-strings rule).
/** @description Tab value for the read-only profile pane. */
const TAB_PROFILE = 'profile' as const
/** @description Tab value for the allow/deny override editor pane. */
const TAB_PERMISSIONS = 'permissions' as const

/**
 * @description Per-user admin detail page. Shows a tabbed surface with the
 * user's profile on one tab and their permission overrides + effective
 * permissions on another. The active tab is mirrored to the `?tab=` query
 * param so admins can deep-link directly into either view.
 *
 * @returns {JSX.Element} The rendered detail page.
 */
export default function UserDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  // Resolve the active tab from the URL — fall back to the profile tab.
  const tabParam = searchParams.get('tab')
  const activeTab = tabParam === TAB_PERMISSIONS ? TAB_PERMISSIONS : TAB_PROFILE

  // Look up the target user via the cached list query.
  const userId = id ?? ''
  const { data: user, isLoading } = useUser(userId)

  // Loading skeleton — match the management page spinner pattern.
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-600" />
      </div>
    )
  }

  // Missing user — render an empty state with a back link.
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <h3 className="text-lg font-semibold text-foreground">
          {t('users.detail.notFound')}
        </h3>
        <Link
          to="/iam/users"
          className="mt-2 text-sm text-primary-600 hover:underline dark:text-primary-400"
        >
          {t('users.detail.backToList')}
        </Link>
      </div>
    )
  }

  /**
   * @description Sync the active tab into the URL search params on user click.
   * @param {string} value - The tab the user navigated to.
   */
  const handleTabChange = (value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('tab', value)
      return next
    })
  }

  // The user.id is a string in the FE User type, but the BE override APIs
  // take a numeric user id — convert here so consumers stay in sync with
  // the BE Zod schemas. Falls back to 0 (a guaranteed-no-match id) when the
  // route param can't be parsed, so the override hooks short-circuit.
  const numericUserId = Number(user.id)

  return (
    <div className="p-6 space-y-4">
      <div>
        <Link
          to="/iam/users"
          className="text-xs text-slate-500 hover:underline dark:text-slate-400"
        >
          {t('users.detail.backToList')}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {user.displayName || user.email}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value={TAB_PROFILE}>
            {t('users.detail.tabs.profile')}
          </TabsTrigger>
          <TabsTrigger value={TAB_PERMISSIONS}>
            {t('users.detail.tabs.permissions')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={TAB_PROFILE}>
          <UserProfileTab user={user} />
        </TabsContent>

        <TabsContent value={TAB_PERMISSIONS}>
          <OverrideEditor userId={numericUserId} userRole={user.role} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
