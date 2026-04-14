/**
 * @fileoverview Shell-aware sidebar navigation component.
 *
 * Renders a collapsible sidebar from the injected nav registry and exposes the
 * authenticated user dropdown actions, including the admin-shell shortcut.
 *
 * @module layouts/Sidebar
 */

import { ChevronLeft, ChevronRight, KeyRound, LogOut, Settings, Shield } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ADMIN_HOME_PATH } from '@/app/adminRoutes'
import { useSettings } from '@/app/contexts/SettingsContext'
import logoDark from '@/assets/logo-dark.svg'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { config } from '@/config'
import { canAccessAdminShell } from '@/features/auth/components/AdminRoute'
import { useAuth, type User } from '@/features/auth/hooks/useAuth'
import { useHasPermission } from '@/lib/permissions'
import { SidebarGroup } from './SidebarGroup'
import { SidebarNavLink } from './SidebarNavLink'
import type { SidebarNavEntry, SidebarNavGroup, SidebarNavItem } from './sidebarNav'
import { isNavGroup } from './sidebarNav'

/**
 * @description Props for the shell-aware sidebar
 */
interface SidebarProps {
  /** Navigation registry for the current authenticated shell */
  navEntries: SidebarNavEntry[]
}

/**
 * @description Renders a user avatar with the profile image or display-name initials
 * @param {{ user: User; size?: 'sm' | 'md' }} props - User profile and avatar size variant
 * @returns {JSX.Element} Avatar image or initials fallback
 */
function UserAvatar({ user, size = 'md' }: { user: User; size?: 'sm' | 'md' }) {
  const sizeClasses = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-base'

  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.displayName}
        className={`${sizeClasses} rounded-full object-cover`}
      />
    )
  }

  const initials = user.displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className={`${sizeClasses} rounded-full bg-slate-600 dark:bg-slate-700 flex items-center justify-center text-white font-medium`}>
      {initials}
    </div>
  )
}

/**
 * @description Renders an unrestricted standalone nav link
 * @param {{ entry: SidebarNavItem; isCollapsed: boolean }} props - Nav entry and sidebar collapse state
 * @returns {JSX.Element} Sidebar link component
 */
function RenderNavLink({ entry, isCollapsed }: { entry: SidebarNavItem; isCollapsed: boolean }) {
  return (
    <SidebarNavLink
      path={entry.path}
      labelKey={entry.labelKey}
      icon={entry.icon}
      iconSize={entry.iconSize ?? 20}
      isCollapsed={isCollapsed}
    />
  )
}

function PermissionGatedNavLink({
  entry,
  isCollapsed,
}: {
  entry: SidebarNavItem & { requiredPermission: NonNullable<SidebarNavItem['requiredPermission']> }
  isCollapsed: boolean
}) {
  const allowed = useHasPermission(entry.requiredPermission)
  if (!allowed) {
    return null
  }

  return <RenderNavLink entry={entry} isCollapsed={isCollapsed} />
}

function GatedNavLink({ entry, isCollapsed }: { entry: SidebarNavItem; isCollapsed: boolean }) {
  if (!entry.requiredPermission) {
    return <RenderNavLink entry={entry} isCollapsed={isCollapsed} />
  }

  return (
    <PermissionGatedNavLink
      entry={entry as SidebarNavItem & { requiredPermission: NonNullable<SidebarNavItem['requiredPermission']> }}
      isCollapsed={isCollapsed}
    />
  )
}

/**
 * @description Renders an unrestricted expandable nav group
 * @param {{ entry: SidebarNavGroup; isCollapsed: boolean }} props - Group entry and sidebar collapse state
 * @returns {JSX.Element} Sidebar group component
 */
function RenderNavGroup({ entry, isCollapsed }: { entry: SidebarNavGroup; isCollapsed: boolean }) {
  return (
    <SidebarGroup
      labelKey={entry.labelKey}
      icon={entry.icon}
      children={entry.children}
      isCollapsed={isCollapsed}
    />
  )
}

function PermissionGatedNavGroup({
  entry,
  isCollapsed,
}: {
  entry: SidebarNavGroup & { requiredPermission: NonNullable<SidebarNavGroup['requiredPermission']> }
  isCollapsed: boolean
}) {
  const allowed = useHasPermission(entry.requiredPermission)
  if (!allowed) {
    return null
  }

  return <RenderNavGroup entry={entry} isCollapsed={isCollapsed} />
}

function GatedNavGroup({ entry, isCollapsed }: { entry: SidebarNavGroup; isCollapsed: boolean }) {
  if (!entry.requiredPermission) {
    return <RenderNavGroup entry={entry} isCollapsed={isCollapsed} />
  }

  return (
    <PermissionGatedNavGroup
      entry={entry as SidebarNavGroup & { requiredPermission: NonNullable<SidebarNavGroup['requiredPermission']> }}
      isCollapsed={isCollapsed}
    />
  )
}

/**
 * @description Renders the authenticated sidebar for the provided shell nav registry
 * @param {SidebarProps} props - Sidebar configuration including the active shell nav entries
 * @returns {JSX.Element} Sidebar navigation panel with user actions
 */
export function Sidebar({ navEntries }: SidebarProps) {
  const { t } = useTranslation()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { user } = useAuth()
  const { openSettings, openApiKeys } = useSettings()

  return (
    <aside className={`${isCollapsed ? 'w-16' : 'w-64'} bg-sidebar-bg dark:bg-slate-900 text-white flex flex-col transition-all duration-300 border-r border-white/10 dark:border-slate-700`}>
      <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} h-16 px-4 border-b border-white/10`}>
        {!isCollapsed && (
          <Link to="/chat" className="flex items-center justify-start w-full transition-all duration-300">
            <img src={logoDark} alt="Knowledge Base" className="w-48 object-contain object-left" />
          </Link>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-2 rounded-xl transition-all duration-200 ml-2 flex-shrink-0 hover:bg-white/10 text-slate-400 hover:text-white"
          title={isCollapsed ? t('nav.expandMenu') : t('nav.collapseMenu')}
        >
          {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <nav className="flex flex-col gap-2 flex-1 mt-4 overflow-y-auto scrollbar-hide px-2">
        {navEntries.map((entry) => {
          if (isNavGroup(entry)) {
            return <GatedNavGroup key={entry.labelKey} entry={entry} isCollapsed={isCollapsed} />
          }

          if (entry.featureFlag && !config.features[entry.featureFlag]) {
            return null
          }

          return <GatedNavLink key={entry.path} entry={entry} isCollapsed={isCollapsed} />
        })}
      </nav>

      <div className="mt-auto pt-4 border-t border-white/10 pb-4 px-2">
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex items-center w-full rounded-lg transition-colors hover:bg-white/10 cursor-pointer ${isCollapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2'}`}
                title={isCollapsed ? user.displayName : undefined}
              >
                <UserAvatar user={user} size={isCollapsed ? 'sm' : 'md'} />
                {!isCollapsed && (
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium truncate text-white">{user.displayName}</div>
                    <div className="text-xs truncate text-slate-400">{user.email}</div>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuItem onClick={() => openApiKeys()} className="cursor-pointer">
                <KeyRound className="mr-2 h-4 w-4" />
                {t('nav.apiKeys')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openSettings()} className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                {t('settings.title')}
              </DropdownMenuItem>
              {canAccessAdminShell(user.role) && (
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link to={ADMIN_HOME_PATH}>
                    <Shield className="mr-2 h-4 w-4" />
                    {t('nav.administrator')}
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer text-destructive focus:text-destructive">
                <Link to="/logout">
                  <LogOut className="mr-2 h-4 w-4" />
                  {t('nav.signOut')}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </aside>
  )
}

export default Sidebar
