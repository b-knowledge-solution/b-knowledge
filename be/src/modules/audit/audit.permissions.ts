/**
 * @description Permission catalog for the `audit` module. Sourced from
 * `.planning/research/PERMISSION_INVENTORY.md` §2.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/** Permissions covering the admin-only audit log viewer and exporter. */
export const AUDIT_PERMISSIONS = definePermissions('audit', {
  view: {
    action: 'read',
    subject: PermissionSubjects.AuditLog,
    label: 'View audit log',
    description: 'Browse and search audit log entries',
  },
  export: {
    action: 'export',
    subject: PermissionSubjects.AuditLog,
    label: 'Export audit log',
    description: 'Download audit log entries as CSV/JSON',
  },
})
