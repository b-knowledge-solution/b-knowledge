/**
 * @description Permission catalog for the `broadcast` module (system-wide
 * announcement messages). Sourced from `PERMISSION_INVENTORY.md` §4.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/** Permissions for managing broadcast announcement messages. */
export const BROADCAST_PERMISSIONS = definePermissions('broadcast', {
  view: {
    action: 'read',
    subject: PermissionSubjects.Broadcast,
    label: 'View broadcast messages',
    description: 'List active and scheduled broadcast announcements',
  },
  create: {
    action: 'create',
    subject: PermissionSubjects.Broadcast,
    label: 'Create broadcast message',
    description: 'Publish a new system-wide announcement',
  },
  edit: {
    action: 'update',
    subject: PermissionSubjects.Broadcast,
    label: 'Edit broadcast message',
    description: 'Modify the content or schedule of an existing announcement',
  },
  delete: {
    action: 'delete',
    subject: PermissionSubjects.Broadcast,
    label: 'Delete broadcast message',
    description: 'Remove a broadcast announcement',
  },
})
