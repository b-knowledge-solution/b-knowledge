/**
 * @fileoverview Expandable sidebar group component.
 *
 * Renders a collapsible section with a header button (icon + label + chevron)
 * and child `SidebarNavLink` items. Auto-expands when one of its children
 * matches the current route.
 *
 * @module layouts/SidebarGroup
 */

import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { SidebarNavLink } from './SidebarNavLink'
import type { SidebarNavItem } from './sidebarNav'
import type { LucideIcon } from 'lucide-react'

// ============================================================================
// Props
// ============================================================================

interface SidebarGroupProps {
  /** i18n key for the group header */
  labelKey: string
  /** Lucide icon for the header */
  icon: LucideIcon
  /** Child links to render inside the collapsible body */
  children: SidebarNavItem[]
  /** Whether the sidebar is collapsed (icon-only mode) */
  isCollapsed?: boolean | undefined
  /** Current user role — used to filter child items with `roles` guards */
  userRole?: string | undefined
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Renders a collapsible sidebar group that auto-expands when a child route is active
 * @param {SidebarGroupProps} props - Group configuration including label, icon, children, and role guards
 * @returns {JSX.Element} Expandable sidebar menu section
 */
export function SidebarGroup({
  labelKey,
  icon: Icon,
  children,
  isCollapsed = false,
  userRole,
}: SidebarGroupProps) {
  const { t } = useTranslation()
  const location = useLocation()

  // Manual toggle state
  const [isExpanded, setIsExpanded] = useState(false)

  // Compute which children are visible (respecting per-child role guards)
  const visibleChildren = children.filter(
    (child) => !child.roles || (userRole && child.roles.includes(userRole)),
  )

  // Auto-expand when a child's route is active
  const isChildActive = visibleChildren.some(
    (child) =>
      location.pathname === child.path ||
      location.pathname.startsWith(`${child.path}/`),
  )

  // The group is open when either manually expanded or a child is active
  const shouldExpand = isExpanded || isChildActive

  return (
    <div className="flex flex-col gap-1">
      {/* Group header toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`sidebar-link w-full ${isCollapsed ? 'justify-center px-2' : ''}`}
        title={t(labelKey)}
      >
        <Icon size={20} />
        {!isCollapsed && (
          <>
            <span className="flex-1 text-left">{t(labelKey)}</span>
            {shouldExpand ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
          </>
        )}
      </button>

      {/* Collapsible child links */}
      {!isCollapsed && shouldExpand && (
        <div className="pl-3 ml-3 border-l border-white/20 flex flex-col gap-1">
          {visibleChildren.map((child) => (
            <SidebarNavLink
              key={child.path}
              path={child.path}
              labelKey={child.labelKey}
              icon={child.icon}
              iconSize={child.iconSize ?? 18}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default SidebarGroup
