/**
 * @fileoverview Permissions admin module HTTP controller (P3.4a-d).
 *
 * Thin Express layer over `permissionsService`. Strict layering: this file
 * never imports `ModelFactory` or `db` — it only translates HTTP request shape
 * into service calls, formats responses, and centralizes error handling.
 *
 * @module modules/permissions/controllers
 */
import { Request, Response } from 'express'
import { permissionsService } from '../services/permissions.service.js'
import { log } from '@/shared/services/logger.service.js'
import type { ResourceGranteeType } from '@/shared/models/resource-grant.model.js'
import type { UserPermissionOverrideEffect } from '@/shared/models/user-permission-override.model.js'

/**
 * @description Resolve the tenant id from the session, falling back to the
 * legacy `current_org_id` field on the user object. Returns an empty string
 * when neither is present so callers can decide whether to 403 or accept it.
 * @param {Request} req - Express request.
 * @returns {string} Active tenant id (may be empty).
 */
function getTenantId(req: Request): string {
  // Prefer session.currentOrgId — that's what the auth middleware already uses.
  return (
    req.session?.currentOrgId ||
    (req.session?.user as any)?.current_org_id ||
    ''
  )
}

/**
 * @description Resolve the actor id from the session for audit logging. Falls
 * back to an empty string when no user is attached (should be impossible
 * because every route is gated by `requireAuth`, but defensive).
 * @param {Request} req - Express request.
 * @returns {string} Acting user id.
 */
function getActorId(req: Request): string {
  return req.session?.user?.id || ''
}

/**
 * @description HTTP controller for the permissions admin module. Each method
 * delegates to `permissionsService`, never touches a model or the database.
 */
export class PermissionsController {
  /**
   * @description `GET /api/permissions/catalog` — return the full permission
   * catalog plus a deterministic version token for silent client refresh.
   * @param {Request} _req - Express request (unused).
   * @param {Response} res - Express response.
   * @returns {Promise<void>}
   */
  async getCatalog(_req: Request, res: Response): Promise<void> {
    try {
      const catalog = permissionsService.getVersionedCatalog()
      res.json(catalog)
    } catch (err) {
      log.error('[permissionsController] getCatalog failed', { err: String(err) })
      res.status(500).json({ error: 'failed_to_load_catalog' })
    }
  }

  /**
   * @description `GET /api/permissions/roles/:role` — return the permission
   * key set granted to the role within the caller's tenant. Falls back to the
   * global default scope when the tenant has no overlay rows.
   * @param {Request} req - Express request with `:role` path param.
   * @param {Response} res - Express response.
   * @returns {Promise<void>}
   */
  async getRolePermissions(req: Request, res: Response): Promise<void> {
    try {
      const role = req.params.role as string
      const tenantId = getTenantId(req)
      // Pass tenant scope so the response includes any tenant-specific overlays;
      // the caller's UI can diff against the global defaults if it wants.
      const keys = await permissionsService.getRolePermissions(role, tenantId || null)
      res.json({ role, permission_keys: keys })
    } catch (err) {
      log.error('[permissionsController] getRolePermissions failed', { err: String(err) })
      res.status(500).json({ error: 'failed_to_load_role_permissions' })
    }
  }

  /**
   * @description `PUT /api/permissions/roles/:role` — replace the role's full
   * permission key set. Body: `{ permission_keys: string[], tenant_id?: string|null }`.
   * Empty `permission_keys` is legal and revokes everything.
   * @param {Request} req - Express request with validated body.
   * @param {Response} res - Express response.
   * @returns {Promise<void>}
   */
  async replaceRolePermissions(req: Request, res: Response): Promise<void> {
    try {
      const role = req.params.role as string
      const { permission_keys, tenant_id } = req.body as {
        permission_keys: string[]
        tenant_id?: string | null
      }
      const actorId = getActorId(req)
      // When the body omits tenant_id we default to the caller's session
      // tenant; passing `null` explicitly targets the global default scope.
      const scopeTenant =
        tenant_id === null ? null : tenant_id ?? getTenantId(req) ?? null
      const result = await permissionsService.replaceRolePermissions(
        role,
        permission_keys,
        scopeTenant,
        actorId,
      )
      res.json({ role, ...result })
    } catch (err) {
      log.error('[permissionsController] replaceRolePermissions failed', {
        err: String(err),
      })
      res.status(500).json({ error: 'failed_to_replace_role_permissions' })
    }
  }

  /**
   * @description `GET /api/permissions/users/:userId/overrides` — list every
   * active override for the user in the caller's tenant.
   * @param {Request} req - Express request with `:userId` path param.
   * @param {Response} res - Express response.
   * @returns {Promise<void>}
   */
  async getUserOverrides(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.params.userId as string
      const tenantId = getTenantId(req)
      const overrides = await permissionsService.getUserOverrides(userId, tenantId)
      res.json({ user_id: userId, overrides })
    } catch (err) {
      log.error('[permissionsController] getUserOverrides failed', { err: String(err) })
      res.status(500).json({ error: 'failed_to_load_overrides' })
    }
  }

  /**
   * @description `POST /api/permissions/users/:userId/overrides` — create a
   * single allow/deny override for the user.
   * @param {Request} req - Express request with validated body.
   * @param {Response} res - Express response.
   * @returns {Promise<void>}
   */
  async createOverride(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.params.userId as string
      const { permission_key, effect, expires_at } = req.body as {
        permission_key: string
        effect: UserPermissionOverrideEffect
        expires_at?: string | null
      }
      const tenantId = getTenantId(req)
      const actorId = getActorId(req)
      const result = await permissionsService.createOverride(
        userId,
        permission_key,
        effect,
        expires_at ?? null,
        tenantId,
        actorId,
      )
      // 201 mirrors the convention used elsewhere in the backend for create endpoints.
      res.status(201).json({ user_id: userId, ...result })
    } catch (err) {
      log.error('[permissionsController] createOverride failed', { err: String(err) })
      res.status(500).json({ error: 'failed_to_create_override' })
    }
  }

  /**
   * @description `DELETE /api/permissions/overrides/:id` — delete a single
   * override row, gated on the caller's tenant.
   * @param {Request} req - Express request with `:id` path param.
   * @param {Response} res - Express response.
   * @returns {Promise<void>}
   */
  async deleteOverride(req: Request, res: Response): Promise<void> {
    try {
      const overrideId = req.params.id as string
      const tenantId = getTenantId(req)
      const actorId = getActorId(req)
      const deleted = await permissionsService.deleteOverride(
        overrideId,
        tenantId,
        actorId,
      )
      // 404 when the row doesn't exist OR belongs to a different tenant. We
      // intentionally do not distinguish the two so cross-tenant probing can't
      // enumerate ids.
      if (deleted === 0) {
        res.status(404).json({ error: 'override_not_found' })
        return
      }
      res.status(204).send()
    } catch (err) {
      log.error('[permissionsController] deleteOverride failed', { err: String(err) })
      res.status(500).json({ error: 'failed_to_delete_override' })
    }
  }

  /**
   * @description `GET /api/permissions/grants?resource_type=…&resource_id=…`
   * — list resource grants. Filters are optional; when both are supplied the
   * compound index serves the query.
   * @param {Request} req - Express request with query params.
   * @param {Response} res - Express response.
   * @returns {Promise<void>}
   */
  async listGrants(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req)
      // Build filters object dropping undefined keys to satisfy
      // exactOptionalPropertyTypes — the service signature treats missing keys
      // as "no filter on that column".
      const filters: { resource_type?: string; resource_id?: string } = {}
      if (typeof req.query.resource_type === 'string') filters.resource_type = req.query.resource_type
      if (typeof req.query.resource_id === 'string') filters.resource_id = req.query.resource_id
      const grants = await permissionsService.listGrants(filters, tenantId)
      res.json({ grants })
    } catch (err) {
      log.error('[permissionsController] listGrants failed', { err: String(err) })
      res.status(500).json({ error: 'failed_to_list_grants' })
    }
  }

  /**
   * @description `POST /api/permissions/grants` — create a row-scoped resource
   * grant. Currently only supports `resource_type === 'KnowledgeBase'`; other
   * types throw with a Phase 5 follow-up message.
   * @param {Request} req - Express request with validated body.
   * @param {Response} res - Express response.
   * @returns {Promise<void>}
   */
  async createGrant(req: Request, res: Response): Promise<void> {
    try {
      const {
        resource_type,
        resource_id,
        grantee_type,
        grantee_id,
        actions,
        expires_at,
      } = req.body as {
        resource_type: string
        resource_id: string
        grantee_type: ResourceGranteeType
        grantee_id: string
        actions: string[]
        expires_at?: string | null
      }
      const tenantId = getTenantId(req)
      const actorId = getActorId(req)
      const result = await permissionsService.createGrant(
        resource_type,
        resource_id,
        grantee_type,
        grantee_id,
        actions,
        expires_at ?? null,
        tenantId,
        actorId,
      )
      res.status(201).json(result)
    } catch (err) {
      log.error('[permissionsController] createGrant failed', { err: String(err) })
      // Surface the validation message for the Phase-5-only resource_type
      // restriction; other failures get the generic 500.
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('not yet supported')) {
        res.status(400).json({ error: 'unsupported_resource_type', message })
        return
      }
      res.status(500).json({ error: 'failed_to_create_grant' })
    }
  }

  /**
   * @description `DELETE /api/permissions/grants/:id` — delete a resource
   * grant, gated on the caller's tenant.
   * @param {Request} req - Express request with `:id` path param.
   * @param {Response} res - Express response.
   * @returns {Promise<void>}
   */
  async deleteGrant(req: Request, res: Response): Promise<void> {
    try {
      const grantId = req.params.id as string
      const tenantId = getTenantId(req)
      const actorId = getActorId(req)
      const deleted = await permissionsService.deleteGrant(grantId, tenantId, actorId)
      if (deleted === 0) {
        res.status(404).json({ error: 'grant_not_found' })
        return
      }
      res.status(204).send()
    } catch (err) {
      log.error('[permissionsController] deleteGrant failed', { err: String(err) })
      res.status(500).json({ error: 'failed_to_delete_grant' })
    }
  }

  /**
   * @description `GET /api/permissions/who-can-do?action=…&subject=…&resource_id=…`
   * — return every user in the caller's tenant who can perform the
   * `(action, subject)` pair, optionally narrowed to a specific resource.
   * @param {Request} req - Express request with validated query.
   * @param {Response} res - Express response.
   * @returns {Promise<void>}
   */
  async whoCanDo(req: Request, res: Response): Promise<void> {
    try {
      const action = req.query.action as string
      const subject = req.query.subject as string
      const resourceId = (req.query.resource_id as string | undefined) ?? null
      const tenantId = getTenantId(req)
      const users = await permissionsService.whoCanDo(
        action,
        subject,
        resourceId,
        tenantId,
      )
      res.json({ action, subject, resource_id: resourceId, users })
    } catch (err) {
      log.error('[permissionsController] whoCanDo failed', { err: String(err) })
      res.status(500).json({ error: 'failed_to_resolve_who_can_do' })
    }
  }
}
