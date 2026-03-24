/**
 * @fileoverview Tenant (organization) extraction middleware for multi-org support.
 *
 * Extracts the current tenant/org context from the user session and attaches
 * it to the request for downstream handlers. Used to scope database queries
 * and authorization checks to the user's active organization.
 *
 * @module middleware/tenant
 */
import { Request, Response, NextFunction } from 'express'
import { log } from '@/shared/services/logger.service.js'

/**
 * @description Middleware that requires a valid tenant (organization) context on the session.
 * Extracts tenant_id from session.currentOrgId and attaches it to the request.
 * Returns 401 if no user session, 403 if no organization is selected.
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Next middleware function
 * @returns {void}
 */
export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  // Session must have an authenticated user
  if (!req.session?.user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  // Extract the active org from session (set during login or org switch)
  const tenantId = req.session.currentOrgId
  if (!tenantId) {
    log.warn('No organization selected in session', { userId: req.session.user.id })
    res.status(403).json({ error: 'No organization selected' })
    return
  }

  // Attach tenant ID to request for downstream handlers
  ;(req as any).tenantId = tenantId
  next()
}

/**
 * @description Utility to extract the tenant ID from a request.
 * Checks the request-level tenantId first (set by requireTenant), then falls back to session.
 * @param {Request} req - Express request object
 * @returns {string | null} The tenant ID or null if not available
 */
export function getTenantId(req: Request): string | null {
  // Prefer request-level tenantId set by requireTenant middleware
  return (req as any).tenantId || req.session?.currentOrgId || null
}
