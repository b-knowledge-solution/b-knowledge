
/**
 * @fileoverview User management routes.
 * 
 * This module provides API endpoints for managing users in the system.
 * All routes require registry-backed `users.*` permissions.
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
router.get('/', requireAuth, requirePermission('users.view'), controller.getUsers.bind(controller));

/**
 * POST /api/users
 * Create a new local user (with optional password).
 * @requires users.create permission
 */
router.post(
  '/',
  requirePermission('users.create'),
  validate({ body: createUserSchema }),
  controller.createUser.bind(controller)
);

/**
 * GET /api/users/ip-history
 * Get IP access history for all users.
 * @requires users.view_ip permission
 */
router.get('/ip-history', requirePermission('users.view_ip'), controller.getAllIpHistory.bind(controller));

/**
 * GET /api/users/:id/ip-history
 * Get IP access history for a specific user.
 * @requires users.view_ip permission
 */
router.get('/:id/ip-history', requirePermission('users.view_ip'), controller.getUserIpHistory.bind(controller));

/**
 * GET /api/users/:id/sessions
 * Get active sessions for a specific user from the session store.
 * @requires users.view_sessions permission
 */
router.get('/:id/sessions', requirePermission('users.view_sessions'), controller.getUserSessions.bind(controller));

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
 * @requires users.assign_perms permission
 */
router.put(
  '/:id/permissions',
  requirePermission('users.assign_perms'),
  validate({ params: uuidParamSchema, body: updatePermissionsSchema }),
  controller.updateUserPermissions.bind(controller)
);

/**
 * PUT /api/users/:id
 * Update user profile fields (display_name, department, job_title, mobile_phone).
 * @requires users.edit permission
 */
router.put(
  '/:id',
  requirePermission('users.edit'),
  validate({ params: uuidParamSchema, body: updateUserSchema }),
  controller.updateUser.bind(controller)
);

/**
 * DELETE /api/users/:id
 * Delete a user from the system.
 * @requires users.delete permission + recent auth
 */
router.delete(
  '/:id',
  requirePermission('users.delete'),
  requireRecentAuth(15),
  validate({ params: uuidParamSchema }),
  controller.deleteUser.bind(controller)
);

export default router;
