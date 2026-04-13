/**
 * @fileoverview Admin permission management page — principal × feature matrix.
 *
 * Renders the Jenkins-style PrincipalPermissionMatrix inside a padded container.
 * The matrix owns its own card chrome and sticky save footer.
 *
 * @module features/users/pages/PermissionManagementPage
 */
import PrincipalPermissionMatrix from '@/features/permissions/components/PrincipalPermissionMatrix'

/**
 * @description Top-level admin page mounted at `/iam/permissions`. Renders the
 *   shared `PrincipalPermissionMatrix` inside a padded container; the matrix
 *   owns its own card chrome and sticky save footer.
 * @returns {JSX.Element} Page wrapper rendering the principal permission matrix.
 */
export default function PermissionManagementPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto h-full overflow-auto">
      <PrincipalPermissionMatrix />
    </div>
  )
}
