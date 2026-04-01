/**
 * @description User and team role constants used across the frontend
 */

/** User roles for permission checks and UI rendering */
export const UserRole = {
  SUPER_ADMIN: 'super-admin',
  ADMIN: 'admin',
  LEADER: 'leader',
  MEMBER: 'member',
  USER: 'user',
} as const

export type UserRoleType = (typeof UserRole)[keyof typeof UserRole]

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
