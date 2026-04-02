/**
 * @fileoverview Role badge component for displaying user roles with color-coded styling.
 *
 * Each role has a distinct color scheme following the UI-SPEC role badge colors:
 * - super-admin: red
 * - admin: purple
 * - leader: blue
 * - user: slate/neutral
 *
 * Supports both light and dark mode.
 *
 * @module components/ui/role-badge
 */

import { Badge } from '@/components/ui/badge'
import { useTranslation } from 'react-i18next'
import { UserRole } from '@/constants'

// ============================================================================
// Constants
// ============================================================================

/**
 * @description Tailwind class mappings for each role's badge color scheme,
 * supporting both light and dark mode variants
 */
const ROLE_STYLES: Record<string, string> = {
  [UserRole.SUPER_ADMIN]: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  [UserRole.ADMIN]: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  [UserRole.LEADER]: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  [UserRole.USER]: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Props for the RoleBadge component
 */
interface RoleBadgeProps {
  /** Role identifier (e.g., 'admin', 'leader', 'super-admin', 'user') */
  role: string
  /** Optional additional CSS classes */
  className?: string
}

/**
 * @description Displays a color-coded badge indicating the user's role.
 * Uses the accessControl.roles i18n namespace for translated role labels.
 * Falls back to the 'user' style for unrecognized roles.
 *
 * @param {RoleBadgeProps} props - Role identifier and optional className
 * @returns {JSX.Element} Rendered badge with role-specific colors and translated label
 */
export function RoleBadge({ role, className }: RoleBadgeProps) {
  const { t } = useTranslation()

  // Normalize role to lowercase for consistent lookup
  const roleKey = role.toLowerCase()

  // Fall back to user style for unrecognized roles
  const style = ROLE_STYLES[roleKey] || ROLE_STYLES[UserRole.USER]

  // Map role key to i18n translation key (super-admin -> superAdmin)
  const i18nKey = roleKey === UserRole.SUPER_ADMIN ? 'superAdmin' : roleKey
  const label = t(`accessControl.roles.${i18nKey}`)

  return (
    <Badge
      variant="secondary"
      className={`${style} ${className || ''}`}
      role="status"
      aria-label={`Role: ${label}`}
    >
      {label}
    </Badge>
  )
}
