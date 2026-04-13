/**
 * @fileoverview Admin role × permission matrix page (rewritten in Phase 5 P5.1).
 *
 * Replaces the legacy 175-line static reference table with a registry-driven
 * matrix that wires the Phase 3 permissions admin endpoints. Layout per D-01,
 * batch save model per D-02, R-10 toast per D-09.
 *
 * @module features/users/pages/PermissionManagementPage
 */
import PermissionMatrix from '@/features/permissions/components/PermissionMatrix'

/**
 * @description Top-level admin page mounted at `/iam/permissions`. Renders the
 *   shared `PermissionMatrix` inside a padded container; the matrix owns its
 *   own card chrome and sticky save footer.
 * @returns {JSX.Element} Page wrapper rendering the permission matrix.
 */
export default function PermissionManagementPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto h-full overflow-auto">
      <PermissionMatrix />
    </div>
  )
}
