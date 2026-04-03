
/**
 * @fileoverview User management routes.
 * 
 * This module provides API endpoints for managing users in the system.
 * All routes require 'manage_users' permission (admin/manager roles).
 * 
 * Security: Implements OWASP Authorization Cheat Sheet:
 * - Deny by default (middleware chain)
 * - Role and permission-based access control
 * - Input validation with UUID format checking
 * - Audit logging for all sensitive operations
 * - IDOR prevention for user-specific endpoints
 * 
 * Features:
 * - List all users
 * - Create local users
 * - Update user profile / role / permissions
 * - Delete users
 * 
 * @module routes/user
 */

import { Router } from 'express';
import { UserController } from '../controllers/users.controller.js';
import { requireAuth, requirePermission, requireRecentAuth, requireAbility } from '@/shared/middleware/auth.middleware.js';
import { requireTenant } from '@/shared/middleware/tenant.middleware.js';
import { validate } from '@/shared/middleware/validate.middleware.js';
import {
  updateRoleSchema,
  updatePermissionsSchema,
  uuidParamSchema,
  createUserSchema,
  updateUserSchema,
} from '../schemas/users.schemas.js';

const router = Router();
const controller = new UserController();

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/users
 * List all users in the system.
 * @requires requireAuth
 */
router.get('/', requireAuth, requirePermission('manage_users'), controller.getUsers.bind(controller));

/**
 * POST /api/users
 * Create a new local user (with optional password).
 * @requires manage_users permission
 */
router.post(
  '/',
  requirePermission('manage_users'),
  validate({ body: createUserSchema }),
  controller.createUser.bind(controller)
);

/**
 * GET /api/users/ip-history
 * Get IP access history for all users.
 * @requires manage_users permission
 */
router.get('/ip-history', requirePermission('manage_users'), controller.getAllIpHistory.bind(controller));

/**
 * GET /api/users/:id/ip-history
 * Get IP access history for a specific user.
 * @requires manage_users permission
 */
router.get('/:id/ip-history', requirePermission('manage_users'), controller.getUserIpHistory.bind(controller));

/**
 * GET /api/users/:id/sessions
 * Get active sessions for a specific user from the session store.
 * @requires manage_users permission
 */
router.get('/:id/sessions', requirePermission('manage_users'), controller.getUserSessions.bind(controller));

/**
 * PUT /api/users/:id/role
 * Update a user's role within the current tenant.
 * @requires authentication + tenant context + CASL manage User ability + recent auth
 */
router.put(
  '/:id/role',
  requireAuth,
  requireTenant,
  requireAbility('manage', 'User'),
  requireRecentAuth(15),
  validate({ params: uuidParamSchema, body: updateRoleSchema }),
  controller.updateUserRole.bind(controller)
);

/**
 * PUT /api/users/:id/permissions
 * Update user permissions.
 * @requires manage_users permission
 */
router.put(
  '/:id/permissions',
  requirePermission('manage_users'),
  validate({ params: uuidParamSchema, body: updatePermissionsSchema }),
  controller.updateUserPermissions.bind(controller)
);

/**
 * PUT /api/users/:id
 * Update user profile fields (display_name, department, job_title, mobile_phone).
 * @requires manage_users permission
 */
router.put(
  '/:id',
  requirePermission('manage_users'),
  validate({ params: uuidParamSchema, body: updateUserSchema }),
  controller.updateUser.bind(controller)
);

/**
 * DELETE /api/users/:id
 * Delete a user from the system.
 * @requires manage_users permission + recent auth
 */
router.delete(
  '/:id',
  requirePermission('manage_users'),
  requireRecentAuth(15),
  validate({ params: uuidParamSchema }),
  controller.deleteUser.bind(controller)
);

export default router;
