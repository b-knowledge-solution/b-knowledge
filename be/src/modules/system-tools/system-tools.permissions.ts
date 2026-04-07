/**
 * @description Permission catalog for the `system-tools` module. Sourced from
 * `PERMISSION_INVENTORY.md` §19. Slug normalizes to `system_tools`.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/** Permissions for the admin system tools registry and runner. */
export const SYSTEM_TOOLS_PERMISSIONS = definePermissions('system-tools', {
  view: {
    action: 'read',
    subject: PermissionSubjects.SystemTool,
    label: 'View system tools',
    description: 'List available system tools and their health status',
  },
  run: {
    action: 'manage',
    subject: PermissionSubjects.SystemTool,
    label: 'Run system tool',
    description: 'Execute a system tool against the live environment',
  },
})
