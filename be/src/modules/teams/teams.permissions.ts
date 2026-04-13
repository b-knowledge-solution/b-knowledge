/**
 * @description Permission catalog for the `teams` module. Sourced from
 * `PERMISSION_INVENTORY.md` §20.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/** Permissions for team CRUD, member assignment, and permission grants. */
export const TEAMS_PERMISSIONS = definePermissions('teams', {
  view: {
    action: 'read',
    subject: PermissionSubjects.Team,
    label: 'View teams',
    description: 'List teams and their members',
  },
  create: {
    action: 'create',
    subject: PermissionSubjects.Team,
    label: 'Create team',
    description: 'Create a new team',
  },
  edit: {
    action: 'update',
    subject: PermissionSubjects.Team,
    label: 'Edit team',
    description: 'Rename a team or modify its metadata',
  },
  delete: {
    action: 'delete',
    subject: PermissionSubjects.Team,
    label: 'Delete team',
    description: 'Remove a team',
  },
  members: {
    action: 'manage',
    subject: PermissionSubjects.Team,
    label: 'Manage team members',
    description: 'Add or remove members from a team',
  },
  permissions: {
    action: 'manage',
    subject: PermissionSubjects.Team,
    label: 'Manage team permissions',
    description: 'Grant or revoke permissions on a team',
  },
})
