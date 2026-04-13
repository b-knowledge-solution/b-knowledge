/**
 * @description Permission catalog for the `sync` module. Sourced from
 * `PERMISSION_INVENTORY.md` §17. Slug normalizes to `sync_connectors`.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/** Permissions for sync connector configuration and runs. */
export const SYNC_PERMISSIONS = definePermissions('sync_connectors', {
  view: {
    action: 'read',
    subject: PermissionSubjects.SyncConnector,
    label: 'View sync connectors',
    description: 'List configured sync connectors and their last run status',
  },
  create: {
    action: 'create',
    subject: PermissionSubjects.SyncConnector,
    label: 'Create sync connector',
    description: 'Add a new sync connector configuration',
  },
  edit: {
    action: 'update',
    subject: PermissionSubjects.SyncConnector,
    label: 'Edit sync connector',
    description: 'Modify sync connector schedule, source, or credentials',
  },
  delete: {
    action: 'delete',
    subject: PermissionSubjects.SyncConnector,
    label: 'Delete sync connector',
    description: 'Remove a sync connector',
  },
  run: {
    action: 'manage',
    subject: PermissionSubjects.SyncConnector,
    label: 'Run sync connector',
    description: 'Trigger an on-demand sync run',
  },
})
