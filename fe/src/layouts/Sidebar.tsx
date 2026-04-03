/**
 * @fileoverview Sidebar navigation component.
 *
 * Renders the collapsible sidebar with:
 * - Data-driven navigation links (see `sidebarNav.ts`)
 * - Expandable sub-menus via `SidebarGroup`
 * - User profile dropdown (API Keys, Settings, Sign Out)
 *
 * @module layouts/Sidebar
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth, User } from '@/features/auth'
import { useSettings } from '@/app/contexts/SettingsContext'
import { config } from '@/config'
import { LogOut, ChevronLeft, ChevronRight, Settings, KeyRound } from 'lucide-react'
import logoDark from '@/assets/logo-dark.svg'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { SIDEBAR_NAV, isNavGroup } from './sidebarNav'
import { SidebarNavLink } from './SidebarNavLink'
import { SidebarGroup } from './SidebarGroup'

// ============================================================================
// Sub-components
// ============================================================================

/**
 * @description Renders a user avatar with image or initials fallback derived from the display name
 * @param {{ user: User; size?: 'sm' | 'md' }} props - User data and optional size variant
 * @returns {JSX.Element} Avatar image or initials circle
 */
function UserAvatar({ user, size = 'md' }: { user: User; size?: 'sm' | 'md' }) {
  const sizeClasses = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-base'

  // Use the user's avatar image if available
  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.displayName}
        className={`${sizeClasses} rounded-full object-cover`}
      />
    )
  }

  // Extract up to 2 initials from the user's display name for the fallback avatar
  const initials = user.displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className={`${sizeClasses} rounded-full bg-slate-600 dark:bg-slate-700 flex items-center justify-center text-white font-medium`}>
      {initials}
    </div>
  )
}

// ============================================================================
// Sidebar Component
// ============================================================================

/**
 * @description Renders the collapsible sidebar with data-driven navigation links and a user profile dropdown menu
 * @returns {JSX.Element} Sidebar navigation panel
 */
export function Sidebar() {
  const { t } = useTranslation()

  // Track whether the sidebar is in collapsed (icon-only) mode
  const [isCollapsed, setIsCollapsed] = useState(false)

  const { user } = useAuth()
  const { openSettings, openApiKeys } = useSettings()

  return (
    <aside className={`${isCollapsed ? 'w-16' : 'w-64'} bg-sidebar-bg dark:bg-slate-900 text-white flex flex-col transition-all duration-300 border-r border-white/10 dark:border-slate-700`}>
      {/* Logo / Collapse toggle */}
      <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} h-16 px-4 border-b border-white/10`}>
        {!isCollapsed && (
          <div className="flex items-center justify-start w-full transition-all duration-300">
            <img src={logoDark} alt="Knowledge Base" className="w-48 object-contain object-left" />
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-2 rounded-xl transition-all duration-200 ml-2 flex-shrink-0 hover:bg-white/10 text-slate-400 hover:text-white"
          title={isCollapsed ? t('nav.expandMenu') : t('nav.collapseMenu')}
        >
          {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      {/* Navigation — rendered from SIDEBAR_NAV config */}
      <nav className="flex flex-col gap-2 flex-1 mt-4 overflow-y-auto scrollbar-hide px-2">
        {SIDEBAR_NAV.map((entry) => {
          // ── Expandable group ──────────────────────────────────
          if (isNavGroup(entry)) {
            // Skip group if user lacks required role
            if (entry.roles && (!user?.role || !entry.roles.includes(user.role))) {
              return null
            }

            return (
              <SidebarGroup
                key={entry.labelKey}
                labelKey={entry.labelKey}
                icon={entry.icon}
                children={entry.children}
                isCollapsed={isCollapsed}
                userRole={user?.role}
              />
            )
          }

          // ── Standalone link ───────────────────────────────────
          // Skip if feature flag is disabled
          if (entry.featureFlag && !config.features[entry.featureFlag]) {
            return null
          }
          // Skip if user lacks required role
          if (entry.roles && (!user?.role || !entry.roles.includes(user.role))) {
            return null
          }

          return (
            <SidebarNavLink
              key={entry.path}
              path={entry.path}
              labelKey={entry.labelKey}
              icon={entry.icon}
              iconSize={entry.iconSize ?? 20}
              isCollapsed={isCollapsed}
            />
          )
        })}
      </nav>

      {/* User profile dropdown — API Keys, Settings, Sign Out */}
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
