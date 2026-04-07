/**
 * @description Permission catalog for the `glossary` module. Sourced from
 * `PERMISSION_INVENTORY.md` §10.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/** Permissions for the tenant glossary CRUD and bulk import surfaces. */
export const GLOSSARY_PERMISSIONS = definePermissions('glossary', {
  view: {
    action: 'read',
    subject: PermissionSubjects.Glossary,
    label: 'View glossary',
    description: 'Browse glossary terms and definitions',
  },
  create: {
    action: 'create',
    subject: PermissionSubjects.Glossary,
    label: 'Create glossary term',
    description: 'Add a new term to the glossary',
  },
  edit: {
    action: 'update',
    subject: PermissionSubjects.Glossary,
    label: 'Edit glossary term',
    description: 'Modify an existing glossary term',
  },
  delete: {
    action: 'delete',
    subject: PermissionSubjects.Glossary,
    label: 'Delete glossary term',
    description: 'Remove a glossary term',
  },
  import: {
    action: 'create',
    subject: PermissionSubjects.Glossary,
    label: 'Import glossary',
    description: 'Bulk import glossary terms from a file',
  },
})
