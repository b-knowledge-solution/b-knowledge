/**
 * @fileoverview Unit tests for RBAC configuration.
 * 
 * Tests role-based access control functions and permission mappings.
 */

import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  isAdminRole,
  isAtLeastRole,
  DEFAULT_ROLE,
  ADMIN_ROLES,
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS,
  type Role,
} from '../../../src/shared/config/rbac.js';

describe('RBAC Configuration', () => {
  describe('DEFAULT_ROLE', () => {
    it('should be "user"', () => {
      expect(DEFAULT_ROLE).toBe('user');
    });
  });

  describe('ROLE_HIERARCHY', () => {
    it('should assign super-admin the highest privilege level', () => {
      expect(ROLE_HIERARCHY['super-admin']).toBe(100);
    });

    it('should assign admin a higher level than leader', () => {
      expect(ROLE_HIERARCHY['admin']).toBeGreaterThan(ROLE_HIERARCHY['leader']);
    });

    it('should assign leader a higher level than user', () => {
      expect(ROLE_HIERARCHY['leader']).toBeGreaterThan(ROLE_HIERARCHY['user']);
    });

    it('should assign user the lowest privilege level', () => {
      expect(ROLE_HIERARCHY['user']).toBe(25);
    });
  });

  describe('ADMIN_ROLES', () => {
    it('includes super-admin, admin, and leader', () => {
      expect(ADMIN_ROLES).toContain('super-admin');
      expect(ADMIN_ROLES).toContain('admin');
      expect(ADMIN_ROLES).toContain('leader');
      expect(ADMIN_ROLES).toHaveLength(3);
    });

    it('excludes non-admin roles', () => {
      expect(ADMIN_ROLES).not.toContain('user');
      expect(ADMIN_ROLES).not.toContain('guest' as Role);
    });
  });

  describe('ROLE_PERMISSIONS', () => {
    it('admin should have broad permissions', () => {
      const adminPermissions = ROLE_PERMISSIONS.admin;
      expect(adminPermissions).toContain('view_chat');
      expect(adminPermissions).toContain('view_search');
      expect(adminPermissions).toContain('view_history');
      expect(adminPermissions).toContain('manage_users');
      expect(adminPermissions).toContain('manage_system');
      expect(adminPermissions).toContain('manage_knowledge_base');
      expect(adminPermissions).toContain('manage_storage');
      expect(adminPermissions).toContain('view_analytics');
      expect(adminPermissions).toContain('view_system_tools');
      expect(adminPermissions).toContain('storage:read');
      expect(adminPermissions).toContain('storage:write');
      expect(adminPermissions).toContain('storage:delete');
    });

    it('leader should allow user management but not system management', () => {
      const leaderPermissions = ROLE_PERMISSIONS.leader;
      expect(leaderPermissions).toContain('manage_users');
      expect(leaderPermissions).not.toContain('manage_system');
      expect(leaderPermissions).toContain('view_analytics');
      expect(leaderPermissions).toContain('view_system_tools');
      expect(leaderPermissions).not.toContain('manage_storage');
      expect(leaderPermissions).not.toContain('storage:write');
      expect(leaderPermissions).not.toContain('storage:delete');
    });

    it('user should have basic permissions only', () => {
      const userPermissions = ROLE_PERMISSIONS.user;
      expect(userPermissions).toContain('view_chat');
      expect(userPermissions).toContain('view_search');
      expect(userPermissions).toContain('view_history');
      expect(userPermissions).not.toContain('manage_users');
      expect(userPermissions).not.toContain('manage_system');
      expect(userPermissions).not.toContain('view_analytics');
      expect(userPermissions).not.toContain('manage_storage');
      expect(userPermissions).not.toContain('storage:read');
      expect(userPermissions).not.toContain('storage:write');
      expect(userPermissions).not.toContain('storage:delete');
    });
  });

  describe('isAdminRole', () => {
    it('should return true for admin', () => {
      expect(isAdminRole('admin')).toBe(true);
    });

    it('should return false for user', () => {
      expect(isAdminRole('user')).toBe(false);
    });

    it('should return false for unknown role', () => {
      expect(isAdminRole('unknown')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isAdminRole('')).toBe(false);
    });
  });

  describe('hasPermission', () => {
    describe('admin role', () => {
      it('should have view_chat permission', () => {
        expect(hasPermission('admin', 'view_chat')).toBe(true);
      });

      it('should have manage_system permission', () => {
        expect(hasPermission('admin', 'manage_system')).toBe(true);
      });

      it('should have manage_users permission', () => {
        expect(hasPermission('admin', 'manage_users')).toBe(true);
      });

      it('should have all storage permissions', () => {
        expect(hasPermission('admin', 'storage:read')).toBe(true);
        expect(hasPermission('admin', 'storage:write')).toBe(true);
        expect(hasPermission('admin', 'storage:delete')).toBe(true);
      });
    });

    describe('leader role', () => {
      it('should have view_chat permission', () => {
        expect(hasPermission('leader', 'view_chat')).toBe(true);
      });

      it('should NOT have manage_system permission', () => {
        expect(hasPermission('leader', 'manage_system')).toBe(false);
      });

      it('should have manage_users permission', () => {
        expect(hasPermission('leader', 'manage_users')).toBe(true);
      });

      it('should not have storage modification permissions', () => {
        expect(hasPermission('leader', 'manage_storage')).toBe(false);
        expect(hasPermission('leader', 'storage:write')).toBe(false);
        expect(hasPermission('leader', 'storage:delete')).toBe(false);
      });
    });

    describe('user role', () => {
      it('should have view_chat permission', () => {
        expect(hasPermission('user', 'view_chat')).toBe(true);
      });

      it('should have view_search permission', () => {
        expect(hasPermission('user', 'view_search')).toBe(true);
      });

      it('should have view_history permission', () => {
        expect(hasPermission('user', 'view_history')).toBe(true);
      });

      it('should NOT have manage_users permission', () => {
        expect(hasPermission('user', 'manage_users')).toBe(false);
      });

      it('should NOT have manage_system permission', () => {
        expect(hasPermission('user', 'manage_system')).toBe(false);
      });

      it('should NOT have storage:write permission', () => {
        expect(hasPermission('user', 'storage:write')).toBe(false);
      });

      it('should NOT have storage:delete permission', () => {
        expect(hasPermission('user', 'storage:delete')).toBe(false);
      });
    });

    describe('unknown role', () => {
      it('should return false for any permission', () => {
        expect(hasPermission('unknown', 'view_chat')).toBe(false);
        expect(hasPermission('unknown', 'manage_system')).toBe(false);
      });
    });

    describe('empty role', () => {
      it('should return false for any permission', () => {
        expect(hasPermission('', 'view_chat')).toBe(false);
      });
    });

    describe('super-admin role', () => {
      it('should have all permissions (short-circuit)', () => {
        expect(hasPermission('super-admin', 'view_chat')).toBe(true);
        expect(hasPermission('super-admin', 'manage_system')).toBe(true);
        expect(hasPermission('super-admin', 'storage:delete')).toBe(true);
      });
    });
  });

  describe('isAtLeastRole', () => {
    it('should return true when user role matches minimum role', () => {
      expect(isAtLeastRole('admin', 'admin')).toBe(true);
    });

    it('should return true when user role exceeds minimum role', () => {
      expect(isAtLeastRole('admin', 'leader')).toBe(true);
      expect(isAtLeastRole('super-admin', 'admin')).toBe(true);
    });

    it('should return false when user role is below minimum role', () => {
      expect(isAtLeastRole('user', 'leader')).toBe(false);
      expect(isAtLeastRole('leader', 'admin')).toBe(false);
    });

    it('should return false for unknown role', () => {
      expect(isAtLeastRole('unknown', 'user')).toBe(false);
    });
  });
});
