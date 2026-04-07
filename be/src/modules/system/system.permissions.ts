/**
 * @description Permission catalog for the `system` module. Sourced from
 * `PERMISSION_INVENTORY.md` §18. The module ships two surfaces:
 *
 *   - `system` — system info and configuration view
 *   - `system_history` — admin-wide chat/search/agent history viewer
 *
 * The conventional `SYSTEM_PERMISSIONS` export aliases the primary `system`
 * sub-feature; `SYSTEM_HISTORY_PERMISSIONS` is exported as a named constant.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/** Primary system info / config permissions. */
export const SYSTEM_PERMISSIONS = definePermissions('system', {
  view: {
    action: 'read',
    subject: PermissionSubjects.System,
    label: 'View system info',
    description: 'View system configuration and runtime information',
  },
  parsing_config: {
    action: 'manage',
    subject: PermissionSubjects.System,
    label: 'Manage parsing scheduler',
    description: 'Configure the document parsing scheduler and concurrency limits',
  },
})

/** Admin-wide history viewer (chat/search/agent activity across all users). */
export const SYSTEM_HISTORY_PERMISSIONS = definePermissions('system_history', {
  view: {
    action: 'read',
    subject: PermissionSubjects.SystemHistory,
    label: 'View system history',
    description: 'Browse admin-wide chat, search, and agent history',
  },
})
