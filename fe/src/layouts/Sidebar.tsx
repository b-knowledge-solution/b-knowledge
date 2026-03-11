/**
 * @fileoverview Sidebar navigation component.
 *
 * Renders the collapsible sidebar with:
 * - Data-driven navigation links (see `sidebarNav.ts`)
 * - Expandable sub-menus via `SidebarGroup`
 * - User profile section
 * - Logout action
 *
 * @module layouts/Sidebar
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth, User } from '@/features/auth'
import { useSettings } from '@/app/contexts/SettingsContext'
import { config } from '@/config'
import { LogOut, ChevronLeft, ChevronRight } from 'lucide-react'
import logo from '@/assets/logo.png'
import logoDark from '@/assets/logo-dark.png'

import { SIDEBAR_NAV, isNavGroup } from './sidebarNav'
import { SidebarNavLink } from './SidebarNavLink'
import { SidebarGroup } from './SidebarGroup'

// ============================================================================
// Sub-components
// ============================================================================

/**
 * User avatar component with image or initials fallback.
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

export function Sidebar() {
  const { t } = useTranslation()

  const [isCollapsed, setIsCollapsed] = useState(false)

  const { user } = useAuth()
  const { resolvedTheme } = useSettings()

  const logoSrc = resolvedTheme === 'dark' ? logoDark : logo

  return (
    <aside className={`${isCollapsed ? 'w-16' : 'w-64'} bg-sidebar-bg dark:bg-slate-950 text-sidebar-text flex flex-col transition-all duration-300`}>
      {/* Logo / Collapse toggle */}
      <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} h-16 px-4 border-b border-white/10 ${resolvedTheme === 'dark' ? '' : 'bg-white'}`}>
        {!isCollapsed && (
          <div className="flex items-center justify-start w-full transition-all duration-300">
            <img src={logoSrc} alt="Knowledge Base" className="w-48 object-contain object-left" />
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`p-2 rounded-lg transition-colors ml-2 flex-shrink-0 ${resolvedTheme === 'dark' ? 'hover:bg-white/10 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'}`}
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

      {/* User profile / Logout */}
      <div className={`mt-auto pt-4 border-t border-white/10 space-y-3 pb-4 ${resolvedTheme === 'dark' ? '' : 'bg-white'}`}>
        {user && (
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'}`} title={isCollapsed ? user.displayName : undefined}>
            <UserAvatar user={user} size={isCollapsed ? 'sm' : 'md'} />
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${resolvedTheme === 'dark' ? 'text-white' : 'text-slate-800'}`}>{user.displayName}</div>
                <div className={`text-xs truncate ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>{user.email}</div>
              </div>
            )}
          </div>
        )}
        <Link to="/logout" className={`sidebar-link w-full ${isCollapsed ? 'justify-center px-2' : ''} ${resolvedTheme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`} title={t('nav.signOut')}>
          <LogOut size={20} />
          {!isCollapsed && <span>{t('nav.signOut')}</span>}
        </Link>
      </div>
    </aside>
  )
}

export default Sidebar
