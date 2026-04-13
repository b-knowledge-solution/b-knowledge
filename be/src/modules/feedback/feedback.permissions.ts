/**
 * @description Permission catalog for the `feedback` module. Sourced from
 * `PERMISSION_INVENTORY.md` §9.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/** Permissions for the user feedback collector. */
export const FEEDBACK_PERMISSIONS = definePermissions('feedback', {
  view: {
    action: 'read',
    subject: PermissionSubjects.Feedback,
    label: 'View feedback',
    description: 'Browse user feedback submissions',
  },
  edit: {
    action: 'update',
    subject: PermissionSubjects.Feedback,
    label: 'Edit feedback status',
    description: 'Triage and update the status of feedback entries',
  },
  delete: {
    action: 'delete',
    subject: PermissionSubjects.Feedback,
    label: 'Delete feedback',
    description: 'Remove feedback submissions',
  },
  submit: {
    action: 'create',
    subject: PermissionSubjects.Feedback,
    label: 'Submit feedback',
    description: 'Submit a feedback entry as an authenticated user',
  },
})
