/**
 * @fileoverview Admin shell route guard.
 *
 * Restricts `/admin` shell access to the explicit admin-shell role set defined
 * for this phase.
 *
 * @module features/auth/components/AdminRoute
 */

import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { isElevatedRole } from '@/constants/roles'
import { useAuth } from '../hooks/useAuth'

/**
 * @description Props for the admin shell guard
 */
interface AdminRouteProps {
  /** Child routes to render when the user belongs to the admin shell role set */
  children: ReactNode
}

/**
 * @description Determines whether a role may enter the admin shell
 * @param {string | undefined} role - Current user role
 * @returns {boolean} True when the role is `leader`, `admin`, or `super-admin`
 */
export function canAccessAdminShell(role: string | undefined): boolean {
  if (!role) {
    return false
  }

  return isElevatedRole(role)
}

/**
 * @description Route wrapper that redirects non-admin-shell users to `/403`
 * @param {AdminRouteProps} props - Guard configuration
 * @returns {JSX.Element | null} Child content when authorized, otherwise a redirect
 */
function AdminRoute({ children }: AdminRouteProps) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return null
  }

  // Reject authenticated users outside the locked admin-shell role set.
  if (!user || !canAccessAdminShell(user.role)) {
    return <Navigate to="/403" replace />
  }

  return <>{children}</>
}

export default AdminRoute
