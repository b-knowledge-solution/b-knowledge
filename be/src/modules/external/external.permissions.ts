/**
 * @description Permission catalog for the `external` module which hosts API
 * key management and the public OpenAI-compatible API surface. Sourced from
 * `PERMISSION_INVENTORY.md` §8.
 *
 * The external API endpoints use API-key auth, not session perms — they don't
 * appear in this catalog. Only API-key administration is gated here.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/** Permissions for managing tenant-scoped API keys (`api_keys.*`). */
export const EXTERNAL_PERMISSIONS = definePermissions('api_keys', {
  view: {
    action: 'read',
    subject: PermissionSubjects.ApiKey,
    label: 'View API keys',
    description: 'List existing tenant API keys (values are masked)',
  },
  create: {
    action: 'create',
    subject: PermissionSubjects.ApiKey,
    label: 'Create API key',
    description: 'Mint a new API key for programmatic access',
  },
  edit: {
    action: 'update',
    subject: PermissionSubjects.ApiKey,
    label: 'Edit API key',
    description: 'Rename or modify scopes on an existing API key',
  },
  delete: {
    action: 'delete',
    subject: PermissionSubjects.ApiKey,
    label: 'Delete API key',
    description: 'Revoke and remove an API key',
  },
})
