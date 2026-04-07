/**
 * @description Permission catalog for the `memory` module. Sourced from
 * `PERMISSION_INVENTORY.md` §13.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/** Permissions for the long-term assistant memory store. */
export const MEMORY_PERMISSIONS = definePermissions('memory', {
  view: {
    action: 'read',
    subject: PermissionSubjects.Memory,
    label: 'View memory entries',
    description: 'Browse stored memory entries',
  },
  create: {
    action: 'create',
    subject: PermissionSubjects.Memory,
    label: 'Create memory entry',
    description: 'Add a new memory entry',
  },
  edit: {
    action: 'update',
    subject: PermissionSubjects.Memory,
    label: 'Edit memory entry',
    description: 'Modify an existing memory entry',
  },
  delete: {
    action: 'delete',
    subject: PermissionSubjects.Memory,
    label: 'Delete memory entry',
    description: 'Remove a memory entry',
  },
})
