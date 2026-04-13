/**
 * @description Permission catalog for the new `permissions` admin module
 * (Phase 3 / P3.0a). These keys gate the future CRUD endpoints in
 * `be/src/modules/permissions/` that allow admins to manage role assignments,
 * user overrides, and resource grants. Only `admin` and `super-admin` roles
 * receive these keys (see the matching seed migration
 * `20260407100000_phase03_seed_permissions_admin_keys.ts`).
 *
 * The rest of the module (controller/service/model/routes/schemas/index) is
 * created in Phase 3 Wave 4 (P3.4a). P3.0a only ships these registry keys so
 * the eventual middleware has stable identifiers to gate against.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 * @see .planning/phase-03-middleware-cutover/PLAN.md (P3.0a)
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/**
 * @description Permissions covering the admin-only permissions catalog
 * management UI. `view` is read-only browsing of roles/permissions/overrides
 * /grants; `manage` is the full CRUD verb for the same data.
 */
export const PERMISSIONS_PERMISSIONS = definePermissions('permissions', {
  view: {
    action: 'read',
    subject: PermissionSubjects.PermissionCatalog,
    label: 'View permissions catalog',
    description:
      'Allow listing all roles, permissions, overrides, and resource grants in the admin UI',
  },
  manage: {
    action: 'manage',
    subject: PermissionSubjects.PermissionCatalog,
    label: 'Manage permissions catalog',
    description:
      'Allow creating/updating/deleting role assignments, user overrides, and resource grants',
  },
})
