/**
 * @description User and team role constants used across the application
 */

/** User roles for RBAC checks */
export const UserRole = {
  SUPER_ADMIN: 'super-admin',
  /** @description Legacy alias without hyphen — used in some older code paths */
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  LEADER: 'leader',
  MEMBER: 'member',
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
