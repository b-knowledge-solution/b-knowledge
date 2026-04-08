/**
 * @fileoverview Permissions admin module routes (P3.4a-d).
 *
 * Mounts the admin CRUD endpoints for roles, user overrides, and resource
 * grants under `/api/permissions`. Every mutation is gated by `requireAuth`
 * + `validate(...)` + `requirePermission('permissions.manage')`; every read
 * is gated by `requireAuth` + `requirePermission('permissions.view')`.
 *
 * The two permission keys (`permissions.view` / `permissions.manage`) are
 * registered in `permissions.permissions.ts` (P3.0a) and seeded into
 * `role_permissions` for `super-admin` and `admin` only.
 *
 * @module modules/permissions/routes
 */
import { Router } from 'express'
import { PermissionsController } from '../controllers/permissions.controller.js'
import {
  requireAuth,
  requirePermission,
} from '@/shared/middleware/auth.middleware.js'
import { validate } from '@/shared/middleware/validate.middleware.js'
import {
  roleParamSchema,
  replaceRolePermissionsSchema,
  userIdParamSchema,
  createOverrideSchema,
  uuidParamSchema,
  createGrantSchema,
  listGrantsQuerySchema,
  whoCanDoQuerySchema,
} from '../schemas/permissions.schemas.js'

const router = Router()
const controller = new PermissionsController()

/**
 * @route GET /api/permissions/catalog
 * @description Returns every registered permission key (the registry catalog).
 * @access Authenticated, requires `permissions.view`.
 */
router.get(
  '/catalog',
  requireAuth,
  requirePermission('permissions.view'),
  controller.getCatalog.bind(controller),
)

/**
 * @route GET /api/permissions/who-can-do
 * @description Lists every user in the caller's tenant who can perform the
 * `(action, subject)` pair, optionally narrowed to a specific resource id.
 * @access Authenticated, requires `permissions.view`.
 */
router.get(
  '/who-can-do',
  requireAuth,
  requirePermission('permissions.view'),
  validate({ query: whoCanDoQuerySchema }),
  controller.whoCanDo.bind(controller),
)

/**
 * @route GET /api/permissions/roles/:role
 * @description Returns the permission keys granted to the given role within
 * the caller's tenant.
 * @access Authenticated, requires `permissions.view`.
 */
router.get(
  '/roles/:role',
  requireAuth,
  requirePermission('permissions.view'),
  validate({ params: roleParamSchema }),
  controller.getRolePermissions.bind(controller),
)

/**
 * @route PUT /api/permissions/roles/:role
 * @description Replaces the role's full permission key set. Empty array
 * revokes all keys for the role in this scope.
 * @access Authenticated, requires `permissions.manage`.
 */
router.put(
  '/roles/:role',
  requireAuth,
  requirePermission('permissions.manage'),
  validate({ params: roleParamSchema, body: replaceRolePermissionsSchema }),
  controller.replaceRolePermissions.bind(controller),
)

/**
 * @route GET /api/permissions/users/:userId/overrides
 * @description Lists every active override row for the user in the caller's
 * tenant. Expired rows are excluded by the model.
 * @access Authenticated, requires `permissions.view`.
 */
router.get(
  '/users/:userId/overrides',
  requireAuth,
  requirePermission('permissions.view'),
  validate({ params: userIdParamSchema }),
  controller.getUserOverrides.bind(controller),
)

/**
 * @route POST /api/permissions/users/:userId/overrides
 * @description Creates an allow/deny override on a single permission key.
 * @access Authenticated, requires `permissions.manage`.
 */
router.post(
  '/users/:userId/overrides',
  requireAuth,
  requirePermission('permissions.manage'),
  validate({ params: userIdParamSchema, body: createOverrideSchema }),
  controller.createOverride.bind(controller),
)

/**
 * @route DELETE /api/permissions/overrides/:id
 * @description Deletes an override row by id, scoped to the caller's tenant.
 * @access Authenticated, requires `permissions.manage`.
 */
router.delete(
  '/overrides/:id',
  requireAuth,
  requirePermission('permissions.manage'),
  validate({ params: uuidParamSchema }),
  controller.deleteOverride.bind(controller),
)

/**
 * @route GET /api/permissions/grants
 * @description Lists resource grants. Filter by `(resource_type, resource_id)`
 * via query string for the indexed lookup; omit both for a tenant-wide scan.
 * @access Authenticated, requires `permissions.view`.
 */
router.get(
  '/grants',
  requireAuth,
  requirePermission('permissions.view'),
  validate({ query: listGrantsQuerySchema }),
  controller.listGrants.bind(controller),
)

/**
 * @route POST /api/permissions/grants
 * @description Creates a row-scoped resource grant.
 * @access Authenticated, requires `permissions.manage`.
 */
router.post(
  '/grants',
  requireAuth,
  requirePermission('permissions.manage'),
  validate({ body: createGrantSchema }),
  controller.createGrant.bind(controller),
)

/**
 * @route DELETE /api/permissions/grants/:id
 * @description Deletes a resource grant by id, scoped to the caller's tenant.
 * @access Authenticated, requires `permissions.manage`.
 */
router.delete(
  '/grants/:id',
  requireAuth,
  requirePermission('permissions.manage'),
  validate({ params: uuidParamSchema }),
  controller.deleteGrant.bind(controller),
)

export default router
