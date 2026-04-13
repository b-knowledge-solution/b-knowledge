/**
 * @fileoverview Role-Based Access Control (RBAC) configuration.
 * 
 * This module defines the authorization system for the Knowledge Base application.
 * It implements a role-permission model where:
 * - Users are assigned one role (admin, manager, or user)
 * - Each role has a predefined set of permissions
 * - Permissions control access to specific features/actions
 * 
 * @module config/rbac
 * @example
 * import { hasPermission, Role, Permission } from './config/rbac.js';
 *
 * // Check if user can manage other users
 * if (hasPermission('manager', 'manage_users')) {
 *   // Allow user management
 * }
 */

import { UserRole } from '@/shared/constants/index.js'
import { rolePermissionCacheService } from '@/shared/services/role-permission-cache.service.js'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * @description Available user roles in the system.
 * Roles are hierarchical in terms of permissions:
 * - super-admin: Platform-level full access across all orgs
 * - admin: Full system access within their org
 * - leader: User management and content access (no system config)
 * - user: Basic content access only
 */
export type Role = 'super-admin' | 'admin' | 'leader' | 'user';

/**
 * @description Numeric hierarchy values for role comparison.
 * Higher values indicate more privileged roles.
 * Used by isAtLeastRole() for hierarchical authorization checks.
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
    'super-admin': 100,
    'admin': 75,
    'leader': 50,
    'user': 25,
};

/**
 * @description Available permissions that can be assigned to roles.
 * 
 * Permissions:
 * - view_chat: Access to AI Chat feature
 * - view_search: Access to AI Search feature
 * - view_history: Access to chat history
 * - manage_users: Ability to view and edit user accounts
 * - manage_system: Access to system configuration and tools
 * - view_analytics: Access to usage analytics and reports
 * - storage:read: Ability to read/download files from MinIO storage
 * - storage:write: Ability to upload files to MinIO storage
 * - storage:delete: Ability to delete files from MinIO storage
 */
export type Permission =
    | 'view_chat'
    | 'view_search'
    | 'view_history'
    | 'manage_users'
    | 'manage_system'
    | 'manage_knowledge_base'
    | 'view_analytics'
    | 'view_system_tools'
    | 'manage_storage'
    | 'manage_datasets'
    | 'manage_model_providers'
    | 'storage:read'
    | 'storage:write'
    | 'storage:delete';

// ============================================================================
// ROLE CONFIGURATION
// ============================================================================

/**
 * @description Default role assigned to new users.
 * New users from Azure AD get this role until an admin upgrades them.
 */
export const DEFAULT_ROLE: Role = 'user';

/**
 * @description Roles that have administrative privileges.
 * These roles can bypass certain ownership checks (IDOR prevention).
 * Used in authorization middleware for resource access decisions.
 */
// ADMIN_ROLES preserved per R-9 through milestone 1. This constant is a
// tenant-level metadata gate ("is this user a tenant operator?") and is
// intentionally NOT migrated to the registry-driven useHasPermission model
// yet. See .planning/codebase/ADMIN_ROLES-preservation.md for the full
// rationale and the milestone-2 migration plan.
export const ADMIN_ROLES: readonly Role[] = ['super-admin', 'admin', 'leader'] as const;

/**
 * @description Check if a role has administrative privileges.
 * @param {string} role - The role to check
 * @returns {boolean} True if the role is an admin role (admin or leader)
 */
export function isAdminRole(role: string): boolean {
    return ADMIN_ROLES.includes(role as Role);
}

/**
 * @description Permission mappings for each role.
 * Defines which permissions are granted to each role.
 * 
 * Role capabilities:
 * - admin: All permissions including system management
 * - leader: User management and content access (no system config)
 * - user: Basic content viewing only
 */
// LEGACY: kept for reference / fallback. Phase 6 removes this.
// The canonical source of truth for role→permission mappings is now the
// DB-backed `role_permissions` table, cached in memory at boot by
// `RolePermissionCacheService`. The `hasPermission` shim below reads from
// that cache; this map is retained only to keep historical context visible.
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
    /** Super-admin has platform-level access across all orgs */
    'super-admin': [
        'view_chat',
        'view_search',
        'view_history',
        'manage_users',
        'manage_system',
        'manage_knowledge_base',
        'manage_storage',
        'view_analytics',
        'view_system_tools',
        'manage_datasets',
        'manage_model_providers',
        'storage:read',
        'storage:write',
        'storage:delete',
    ],
    /** Admin has full system access within their org */
    admin: [
        'view_chat',
        'view_search',
        'view_history',
        'manage_users',
        'manage_system',
        'manage_knowledge_base',
        'manage_storage',
        'view_analytics',
        'view_system_tools',
        'manage_datasets',
        'manage_model_providers',
        'storage:read',
        'storage:write',
        'storage:delete',
    ],
    /** Leader can manage users and access content */
    leader: [
        'view_chat',
        'view_search',
        'view_history',
        'manage_users', // Leaders can view/edit users but maybe restricted (logic in service)
        'manage_datasets',
        'view_analytics',
        'view_system_tools',
    ],
    /** Regular user has basic content access */
    user: [
        'view_chat',
        'view_search',
        'view_history',
    ],
};

// ============================================================================
// PERMISSION CHECKING
// ============================================================================

/**
 * @description Checks if a role has a permission key. PHASE 3 SHIM:
 * this function previously consulted the static `ROLE_PERMISSIONS` map at
 * the bottom of this file. As of Phase 3 / P3.2a, it consults the
 * boot-cached snapshot of `role_permissions` from
 * `RolePermissionCacheService` — which IS the source of truth for
 * production permissions in the V2-default world.
 *
 * The function signature is preserved for backward compatibility with the
 * one remaining caller at `be/src/shared/middleware/auth.middleware.ts:13`
 * (the legacy `requirePermission`). Phase 6 will remove this shim entirely.
 *
 * Super-admin and admin short-circuit to `true` to preserve V1 semantics:
 * those roles were historically granted every permission regardless of the
 * underlying map, and the legacy middleware continues to rely on that.
 *
 * @deprecated Use `requirePermission` from `auth.middleware.ts` instead.
 * @param {string} userRole - The role to check (as string for flexibility)
 * @param {Permission} permission - The permission key to verify
 * @returns {boolean} True if the role has the permission in the global scope
 */
export const hasPermission = (userRole: string, permission: Permission): boolean => {
    // Super-admin and admin roles historically bypass the permission list —
    // preserve that contract so the legacy middleware behaves identically.
    if (userRole === UserRole.SUPER_ADMIN || userRole === UserRole.ADMIN) return true;
    // Consult the boot-cached snapshot of the DB-backed `role_permissions`
    // table. The cache is loaded during app startup after the catalog sync.
    return rolePermissionCacheService.has(userRole, permission as string);
};

/**
 * @description Checks if a user's role meets or exceeds a minimum required role.
 * Uses ROLE_HIERARCHY numeric values for comparison.
 * @param {string} userRole - The user's current role
 * @param {Role} minimumRole - The minimum role required
 * @returns {boolean} True if userRole is at least as privileged as minimumRole
 *
 * @example
 * isAtLeastRole('admin', 'leader'); // true (75 >= 50)
 * isAtLeastRole('user', 'leader');  // false (25 < 50)
 */
export function isAtLeastRole(userRole: string, minimumRole: Role): boolean {
    const userLevel = ROLE_HIERARCHY[userRole as Role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minimumRole] ?? 0;
    return userLevel >= requiredLevel;
}
