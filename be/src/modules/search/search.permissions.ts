/**
 * @description Permission catalog for the `search` module. Sourced from
 * `PERMISSION_INVENTORY.md` §16. Slug normalizes to `search_apps`.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/** Permissions for search app configuration, embeds, and the public API. */
export const SEARCH_PERMISSIONS = definePermissions('search_apps', {
  view: {
    action: 'read',
    subject: PermissionSubjects.SearchApp,
    label: 'View search apps',
    description: 'List configured search apps',
  },
  create: {
    action: 'create',
    subject: PermissionSubjects.SearchApp,
    label: 'Create search app',
    description: 'Create a new search app',
  },
  edit: {
    action: 'update',
    subject: PermissionSubjects.SearchApp,
    label: 'Edit search app',
    description: 'Modify search app configuration',
  },
  delete: {
    action: 'delete',
    subject: PermissionSubjects.SearchApp,
    label: 'Delete search app',
    description: 'Remove a search app',
  },
  embed: {
    action: 'manage',
    subject: PermissionSubjects.SearchApp,
    label: 'Manage search embeds',
    description: 'Configure publicly embeddable search surfaces',
  },
  api: {
    action: 'manage',
    subject: PermissionSubjects.SearchApp,
    label: 'Use OpenAI-compatible search API',
    description: 'Call the OpenAI-compatible search endpoints with an API key',
  },
})
