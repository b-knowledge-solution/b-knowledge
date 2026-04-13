/**
 * @description Permission catalog for the `dashboard` module. Sourced from
 * `PERMISSION_INVENTORY.md` §7.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/** Permissions for dashboard summary tiles and admin metrics. */
export const DASHBOARD_PERMISSIONS = definePermissions('dashboard', {
  view: {
    action: 'read',
    subject: PermissionSubjects.Dashboard,
    label: 'View dashboard',
    description: 'View summary dashboard tiles and personal usage metrics',
  },
  admin: {
    action: 'read',
    subject: PermissionSubjects.Dashboard,
    label: 'View admin dashboard',
    description: 'View tenant-wide admin metrics and usage analytics',
  },
})
