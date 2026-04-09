/**
 * @description User and team role constants used across the application.
 */

/**
 * @description Canonical UserRole enum. Legacy keys SUPERADMIN (value
 * `'superadmin'`) and MEMBER (value `'member'`) were removed in Phase 6 per
 * D-04 - their values were data-migrated to `'super-admin'` and `'user'`
 * respectively by the phase06_legacy_role_cleanup migration. TeamRole.MEMBER
 * is a separate domain and is preserved.
 */
export const UserRole = {
  SUPER_ADMIN: 'super-admin',
  ADMIN: 'admin',
  LEADER: 'leader',
  USER: 'user',
} as const

export type UserRoleType = (typeof UserRole)[keyof typeof UserRole]

/** Team member roles */
export const TeamRole = {
  LEADER: 'leader',
  MEMBER: 'member',
} as const

export type TeamRoleType = (typeof TeamRole)[keyof typeof TeamRole]

/**
 * @description Check if a role has admin-level privileges
 * @param {string} role - The role to check
 * @returns {boolean} True if the role is admin or super-admin
 */
export function isAdminRole(role: string): boolean {
  return role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN
}

/**
 * @description Check if a role has elevated privileges (admin or leader)
 * @param {string} role - The role to check
 * @returns {boolean} True if the role is admin, super-admin, or leader
 */
export function isElevatedRole(role: string): boolean {
  return isAdminRole(role) || role === UserRole.LEADER
}
