/**
 * @description Permission catalog for the `users` module. Sourced from
 * `PERMISSION_INVENTORY.md` §22. Includes the new sensitive `view_ip`,
 * `view_sessions`, `assign_role`, and `assign_perms` actions which previously
 * lived under the catch-all `manage_users` legacy permission.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/** Permissions for user CRUD, sensitive lookups, and role/perm assignment. */
export const USERS_PERMISSIONS = definePermissions('users', {
  view: {
    action: 'read',
    subject: PermissionSubjects.User,
    label: 'View users',
    description: 'List users and view profile information',
  },
  create: {
    action: 'create',
    subject: PermissionSubjects.User,
    label: 'Create user',
    description: 'Create a new user account',
  },
  edit: {
    action: 'update',
    subject: PermissionSubjects.User,
    label: 'Edit user',
    description: 'Modify user profile, status, and metadata',
  },
  delete: {
    action: 'delete',
    subject: PermissionSubjects.User,
    label: 'Delete user',
    description: 'Remove a user account',
  },
  view_ip: {
    action: 'read',
    subject: PermissionSubjects.User,
    label: 'View user IP history',
    description: 'View IP addresses associated with a user’s sessions (sensitive)',
  },
  view_sessions: {
    action: 'read',
    subject: PermissionSubjects.User,
    label: 'View user sessions',
    description: 'View active and historical sessions for a user',
  },
  assign_role: {
    action: 'manage',
    subject: PermissionSubjects.User,
    label: 'Assign user role',
    description: 'Change a user’s role assignment',
  },
  assign_perms: {
    action: 'manage',
    subject: PermissionSubjects.User,
    label: 'Assign user permissions',
    description: 'Grant or revoke per-user permission overrides',
  },
})
