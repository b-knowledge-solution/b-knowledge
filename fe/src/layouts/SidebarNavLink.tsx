/**
 * @fileoverview Reusable sidebar navigation link.
 *
 * Wraps React Router's `NavLink` with sidebar-specific styling,
 * collapsed-mode support, and the navigation loader integration.
 *
 * @module layouts/SidebarNavLink
 */

import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@/components/NavigationLoader'
import type { LucideIcon } from 'lucide-react'

// ============================================================================
// Props
// ============================================================================

interface SidebarNavLinkProps {
  /** Route path to navigate to */
  path: string
  /** i18n key for the link label */
  labelKey: string
  /** Lucide icon component */
  icon: LucideIcon
  /** Icon size in pixels */
  iconSize?: number
  /** Whether the sidebar is collapsed (icon-only mode) */
  isCollapsed?: boolean
}

// ============================================================================
// Component
// ============================================================================

/**
 * Renders a single sidebar link with active-state highlighting,
 * a navigation-loader trigger, and collapsed-mode support.
 *
 * @param props - Link configuration
 * @returns Sidebar NavLink element
 */
export function SidebarNavLink({
  path,
  labelKey,
  icon: Icon,
  iconSize = 18,
  isCollapsed = false,
}: SidebarNavLinkProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const { startNavigation } = useNavigation()

  /** Trigger the top-bar navigation loader when navigating away */
  const handleClick = (_e: React.MouseEvent) => {
    if (location.pathname !== path) {
      startNavigation()
    }
  }

  return (
    <NavLink
      to={path}
      onClick={handleClick}
      className={({ isActive }: { isActive: boolean }) =>
        `sidebar-link w-full ${isActive ? 'active' : ''} ${isCollapsed ? 'justify-center px-2' : ''}`
      }
      title={t(labelKey)}
    >
      <Icon size={iconSize} />
      {!isCollapsed && <span className="flex-1 text-left">{t(labelKey)}</span>}
    </NavLink>
  )
}

export default SidebarNavLink
