/**
 * @description Permission catalog for the `preview` module. Sourced from
 * `PERMISSION_INVENTORY.md` §14.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/** Permission for the document preview viewer. */
export const PREVIEW_PERMISSIONS = definePermissions('preview', {
  view: {
    action: 'read',
    subject: PermissionSubjects.Preview,
    label: 'View document previews',
    description: 'Render inline previews of documents and chunks',
  },
})
