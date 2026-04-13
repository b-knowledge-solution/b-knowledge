/**
 * @description Permission catalog for the `user-history` module. Sourced from
 * `PERMISSION_INVENTORY.md` §21. This is a self-scoped read permission —
 * default-allow for any authenticated user — but is still registered so that
 * the day-one seed can grant it explicitly and the override mechanism can
 * revoke it for restricted accounts.
 *
 * @see {@link file://./../../shared/permissions/registry.ts}
 */

import { definePermissions } from '@/shared/permissions/registry.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/** Permission for viewing one's own activity history. */
export const USER_HISTORY_PERMISSIONS = definePermissions('user_history', {
  view: {
    action: 'read',
    subject: PermissionSubjects.UserHistory,
    label: 'View own history',
    description: 'Browse the current user’s own chat, search, and agent history',
  },
})
