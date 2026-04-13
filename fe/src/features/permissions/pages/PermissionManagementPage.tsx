/**
 * @fileoverview Admin permission management page for the principal matrix.
 *
 * Keeps the route-level page inside the permissions feature so both permission
 * admin screens share the same `features/permissions/pages` structure.
 *
 * @module features/permissions/pages/PermissionManagementPage
 */

import PrincipalPermissionMatrix from '@/features/permissions/components/PrincipalPermissionMatrix'

/**
 * @description Top-level admin page mounted at `/admin/iam/permissions`.
 * Renders the shared `PrincipalPermissionMatrix` and lets the current shell
 * container own the overall content width.
 * @returns {JSX.Element} Page wrapper rendering the principal permission matrix.
 */
export default function PermissionManagementPage() {
  return (
    <div className="h-full w-full p-6">
      <PrincipalPermissionMatrix />
    </div>
  )
}
