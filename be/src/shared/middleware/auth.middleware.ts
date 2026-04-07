/**
 * @fileoverview Authentication and authorization middleware for Express routes.
 *
 * Provides middleware factories for session-based authentication, role-based
 * access control, permission checking, ownership verification, and
 * re-authentication enforcement for sensitive operations.
 *
 * @module middleware/auth
 */
import { Request, Response, NextFunction, RequestHandler } from 'express'
import { subject as toCaslSubject } from '@casl/ability'
import { log } from '@/shared/services/logger.service.js'
import { User } from '@/shared/models/types.js'
import { hasPermission, Role, Permission, ADMIN_ROLES } from '@/shared/config/rbac.js'
import { abilityService, AppAbility, buildAbilityFor } from '@/shared/services/ability.service.js'
import { getAllPermissions } from '@/shared/permissions/index.js'
import { config } from '@/shared/config/index.js'
// Deep import (not through the module barrel) to avoid a circular dependency:
// audit/index.ts re-exports audit.routes.ts, which itself imports this
// middleware file. Importing the service file directly breaks the cycle.
import { auditService } from '@/modules/audit/services/audit.service.js'

/** Session error code used by frontend to trigger re-auth flows */
export const REAUTH_REQUIRED_ERROR = 'REAUTH_REQUIRED'

/**
 * @description Refreshes session timestamps whenever a user authenticates or reauthenticates.
 * Downstream middleware uses these timestamps to enforce recent-auth checks.
 * @param {Request} req - Express request object with session
 * @param {boolean} isReauth - If true, updates both lastAuthAt and lastReauthAt timestamps
 * @returns {void}
 */
export function updateAuthTimestamp(req: Request, isReauth: boolean = false): void {
  // Only update timestamps if session exists
  if (req.session) {
    // Always update last authentication time
    req.session.lastAuthAt = Date.now()

    // If this is a re-authentication, also update reauth timestamp
    if (isReauth) {
      req.session.lastReauthAt = Date.now()
    }
  }
}

/**
 * @description Middleware that requires a valid user session to proceed.
 * Attaches user to request object if authenticated, returns 401 otherwise.
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Next middleware function
 * @returns {void}
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Check if session contains authenticated user
  if (req.session?.user) {
    // Attach user to request for downstream handlers
    req.user = req.session.user
    next()
  } else {
    // No valid session - return 401 Unauthorized
    res.status(401).json({ error: 'Unauthorized' })
  }
}

/**
 * @description Middleware factory that requires authentication within a time window.
 * Returns REAUTH_REQUIRED error if auth is too old, prompting frontend re-auth flow.
 * @param {number} maxAgeMinutes - Maximum age in minutes for valid auth (default: 15)
 * @returns {Function} Express middleware function
 */
export function requireRecentAuth(maxAgeMinutes: number = 15) {
  return (req: Request, res: Response, next: NextFunction) => {
    // First check if user is authenticated at all
    if (!req.session?.user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    // Get most recent auth timestamp (prefer reauth over initial auth)
    const lastAuth = req.session.lastReauthAt || req.session.lastAuthAt

    // If no auth timestamp exists, require re-authentication
    if (!lastAuth) {
      res.status(401).json({
        error: REAUTH_REQUIRED_ERROR,
        message: 'Re-authentication required'
      })
      return
    }

    // Calculate how old the authentication is in minutes
    const ageMinutes = (Date.now() - lastAuth) / (1000 * 60)

    // If auth is older than allowed window, require re-authentication
    if (ageMinutes > maxAgeMinutes) {
      res.status(401).json({
        error: REAUTH_REQUIRED_ERROR,
        message: `Authentication too old (max ${maxAgeMinutes}m). Please re-authenticate.`
      })
      return
    }

    // Auth is fresh enough - proceed
    next()
  }
}

/**
 * @description Middleware that optionally attaches session user to request.
 * Does not enforce authentication - allows requests to proceed regardless.
 * @param {Request} req - Express request object
 * @param {Response} _res - Express response object (unused)
 * @param {NextFunction} next - Next middleware function
 * @returns {void}
 */
export function checkSession(req: Request, _res: Response, next: NextFunction): void {
  // If session has user, attach to request for convenience
  if (req.session?.user) {
    req.user = req.session.user
  }
  // Always proceed regardless of auth status
  next()
}

/**
 * @description Utility function to get the current authenticated user from request.
 * Checks session first (source of truth), then falls back to request.user.
 * @param {Request} req - Express request object
 * @returns {User | undefined} User object if authenticated, undefined otherwise
 */
export function getCurrentUser(req: Request): User | undefined {
  // Prefer session user (source of truth)
  if (req.session?.user) {
    return req.session.user
  }
  // Fall back to request user (may be set by other middleware)
  return req.user
}

/**
 * @description Legacy role-based permission check. Retained under a
 * `legacy*` name during the Phase 3 middleware sweep so routes that still
 * pass a legacy `Permission` enum value keep working while Wave 3 migrates
 * them one-by-one. Checks both role-based permissions (via RBAC config) and
 * explicit user permissions.
 * @deprecated Use the new `requirePermission(key: string)` that reads the V2
 *   ability via the permission registry. This function will be removed in
 *   P3.5c once every route has been migrated.
 * @param {Permission} permission - The legacy permission enum required to access the route
 * @returns {Function} Express middleware function
 */
// TODO(P3.5c): remove after route sweep is green
export function legacyRequirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Get user from session
    const user = req.session?.user

    // No user - return 401 Unauthorized
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    // Ensure user is attached to request for downstream use
    if (!req.user) {
      req.user = user
    }

    // Check if user's role grants the required permission
    if (user.role && hasPermission(user.role, permission)) {
      next()
      return
    }

    // Check explicit user permissions (may be string or array)
    if (user.permissions) {
      let perms: string[] = []

      // Parse permissions if stored as JSON string
      if (typeof user.permissions === 'string') {
        try {
          perms = JSON.parse(user.permissions)
        } catch { perms = [] }
      } else if (Array.isArray(user.permissions)) {
        perms = user.permissions
      }

      // Check if user has the required permission explicitly
      if (perms.includes(permission)) {
        next()
        return
      }
    }

    // Permission not found - log and return 403 Forbidden
    log.warn('Access denied: missing permission', {
      userId: user.id,
      role: user.role,
      requiredPermission: permission
    })
    res.status(403).json({ error: 'Access Denied' })
  }
}

/**
 * @description Express middleware that asserts the current user holds the
 * given permission key in their tenant. Reads the user's V2 ability
 * (cached via the existing `buildAbilityFor` pipeline) and checks the
 * `(action, subject)` tuple resolved from the registry for the key.
 *
 * **Dual-mode routing for the P3 sweep**: during Wave 3 some routes still
 * pass a legacy `Permission` enum value whose string is NOT a registry key.
 * To avoid a flag-day breakage, this function detects whether the input is
 * a registry key. If it is, the new V2 path runs. If not, it falls through
 * to `legacyRequirePermission` so existing routes keep working unchanged.
 * This dual mode goes away in P3.5c when the last legacy call site is gone.
 *
 * Returns 403 with `{error: 'permission_denied', key}` on deny. Fires a
 * best-effort audit log on mutation denies only (POST/PUT/PATCH/DELETE) —
 * read denies are intentionally not logged to keep the audit volume sane.
 *
 * Fails closed in production: if the ability build throws, deny with 500.
 * Fails open in non-production with a loud warning so local dev isn't
 * blocked by transient infra flakes.
 *
 * @param {string | Permission} key - Permission key from the registry (e.g. `knowledge_base.view`) OR a legacy `Permission` enum value
 * @returns {RequestHandler} Express request handler
 *
 * @example
 *   router.post('/api/kb', requirePermission('knowledge_base.create'), createKbHandler)
 */
export function requirePermission(key: string | Permission): RequestHandler {
  return async (req, res, next) => {
    // Validate the user/session context first
    const user = req.session?.user
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (!req.user) req.user = user

    // Look up the action+subject from the registry for this key.
    // If no registry match, fall through to the legacy RBAC middleware so
    // Wave 3's in-progress route sweep isn't blocked.
    const all = getAllPermissions()
    const perm = all.find(p => p.key === key)
    if (!perm) {
      // Not a V2 registry key — delegate to the legacy handler
      legacyRequirePermission(key as Permission)(req, res, next)
      return
    }

    try {
      // Build (or load cached) V2 ability through the existing dispatcher.
      const ability = await buildAbilityFor({
        id: user.id,
        role: user.role,
        is_superuser: user.is_superuser ?? null,
        current_org_id: req.session.currentOrgId || (user as any).current_org_id || '',
      })

      // CASL check — class-level because requirePermission is key-indexed,
      // not instance-indexed. Row-scoped checks use `requireAbility` instead.
      if (ability.can(perm.action as any, perm.subject as any)) {
        next()
        return
      }

      // Deny path — audit log only on mutations to avoid read noise
      const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
      if (isMutation) {
        // Fire-and-forget; never block the response on a logging failure
        auditService
          .logPermissionDeny({
            actor: user.id,
            tenantId: req.session.currentOrgId || (user as any).current_org_id || '',
            permissionKey: perm.key,
            action: perm.action,
            subject: perm.subject,
            method: req.method,
            path: req.path,
          })
          .catch(err => log.warn('[requirePermission] audit log failed', { err }))
      }
      res.status(403).json({ error: 'permission_denied', key: perm.key })
      return
    } catch (err) {
      // Fail closed in production; fail open with warning in dev/test
      if (config.nodeEnv === 'production') {
        log.error('[requirePermission] check failed', {
          err: err instanceof Error ? err.message : String(err),
          key: perm.key,
        })
        res.status(500).json({ error: 'permission_check_failed' })
        return
      } else {
        log.warn('[requirePermission] check failed in non-prod — failing OPEN', {
          err: err instanceof Error ? err.message : String(err),
          key: perm.key,
        })
        next()
        return
      }
    }
  }
}

/**
 * @description Middleware factory that requires one of the specified roles to access route.
 * Returns 403 if the user's role is not in the allowed list.
 * @param {...Role} roles - Allowed roles (variadic parameter)
 * @returns {Function} Express middleware function
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Get user from session
    const user = req.session?.user

    // No user - return 401 Unauthorized
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    // Ensure user is attached to request for downstream use
    if (!req.user) {
      req.user = user
    }

    // Check if user's role is in the allowed roles list
    if (user.role && roles.includes(user.role as Role)) {
      next()
      return
    }

    // Role not allowed - log and return 403 Forbidden
    log.warn('Access denied: incorrect role', {
      userId: user.id,
      userRole: user.role,
      requiredRoles: roles
    })
    res.status(403).json({ error: 'You don\'t have permission to access this resource' })
  }
}

/**
 * @description Middleware factory that requires the authenticated user to own the resource.
 * Ownership is determined by matching user ID with a URL parameter.
 * Admin roles can optionally bypass the ownership check (IDOR prevention).
 * @param {string} userIdParam - Name of the URL parameter containing the owner's user ID
 * @param {object} options - Configuration options
 * @param {boolean} options.allowAdminBypass - If true, admin roles bypass ownership check (default: true)
 * @returns {Function} Express middleware function
 */
export function requireOwnership(
  userIdParam: string,
  options: { allowAdminBypass?: boolean } = { allowAdminBypass: true }
) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Get user from session
    const user = req.session?.user

    // No user - return 401 Unauthorized
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    // Ensure user is attached to request for downstream use
    if (!req.user) {
      req.user = user
    }

    // Extract resource owner ID from URL parameter
    const resourceOwnerId = req.params[userIdParam]

    // Parameter missing - return 400 Bad Request
    if (!resourceOwnerId) {
      res.status(400).json({ error: 'Bad Request: Missing resource identifier' })
      return
    }

    // Check if current user is the resource owner
    if (user.id === resourceOwnerId) {
      next()
      return
    }

    // Check if admin bypass is enabled and user is admin
    if (options.allowAdminBypass && user.role && ADMIN_ROLES.includes(user.role as Role)) {
      next()
      return
    }

    // Not owner and not admin - return 403 Forbidden
    res.status(403).json({ error: 'Forbidden: You do not have access to this resource' })
  }
}

/**
 * @description Middleware factory with custom ownership resolution logic.
 * Allows flexible ownership checks using a custom getter function to
 * extract the owner ID from the request (e.g. from body or query).
 * @param {Function} getOwnerId - Function to extract owner ID from request
 * @param {object} options - Configuration options
 * @param {boolean} options.allowAdminBypass - If true, admin roles bypass ownership check (default: true)
 * @returns {Function} Express middleware function
 */
export function requireOwnershipCustom(
  getOwnerId: (req: Request) => string | undefined,
  options: { allowAdminBypass?: boolean } = { allowAdminBypass: true }
) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Get user from session
    const user = req.session?.user

    // No user - return 401 Unauthorized
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    // Ensure user is attached to request for downstream use
    if (!req.user) {
      req.user = user
    }

    // Use custom function to extract resource owner ID
    const resourceOwnerId = getOwnerId(req)

    // Owner ID not found - return 400 Bad Request
    if (!resourceOwnerId) {
      res.status(400).json({ error: 'Bad Request: Missing resource identifier' })
      return
    }

    // Check if current user is the resource owner
    if (user.id === resourceOwnerId) {
      next()
      return
    }

    // Check if admin bypass is enabled and user is admin
    if (options.allowAdminBypass && user.role && ADMIN_ROLES.includes(user.role as Role)) {
      next()
      return
    }

    // Not owner and not admin - return 403 Forbidden
    res.status(403).json({ error: 'Forbidden: You do not have access to this resource' })
  }
}

/**
 * @description Express middleware that asserts the current user holds the
 * given `(action, subject)` ability. When `idParam` is provided, the check
 * is INSTANCE-LEVEL: the subject is wrapped via CASL's `subject(name, instance)`
 * helper with `id` (and `tenant_id`) set from the request, so row-scoped
 * grants in `resource_grants` (which V2 emits with `{tenant_id, id}`
 * conditions) actually match.
 *
 * **Bug fix history (P3.1b)**: the previous `requireAbility` at this file's
 * old ~line 377 called `ability.can(action, subject)` with a bare string
 * subject. CASL's class-level semantics treat that as "does the user have
 * ANY rule on this subject class?" and return true even when the only
 * matching rule is row-scoped to a DIFFERENT id. Concretely: a user holding
 * a single row-scoped grant on KB `X` was silently allowed through for KB
 * `Y`, `Z`, etc. — a cross-row over-allow that turned every V2 row-scoped
 * grant into a de-facto class-level grant at the middleware layer.
 * The fix is to wrap the subject + id via `toCaslSubject(subjectName, {id,
 * tenant_id})` so the conditions object reaches the rule matcher. The old
 * line read:
 *
 *   if (!ability.can(action as any, subject as any)) { ... }
 *
 * and the new line reads:
 *
 *   const instance = toCaslSubject(subjectName, { id, tenant_id: ... })
 *   allowed = ability.can(action as any, instance)
 *
 * When `idParam` is omitted, the check stays CLASS-LEVEL (`ability.can(action,
 * subjectName)` with a bare string), which preserves the 2-argument
 * signature for every existing Wave-3-pending call site.
 *
 * Fail-closed in production, fail-open in non-prod, mutation-only audit
 * logging — same semantics as `requirePermission`.
 *
 * @param {string} action      CASL action ('read', 'create', 'update', 'delete', 'manage', ...)
 * @param {string} subjectName CASL subject ('KnowledgeBase', 'User', ...)
 * @param {string} [idParam]   Optional Express param name for row-scoped checks (e.g. 'id')
 * @returns {RequestHandler} Express request handler
 *
 * @example
 *   // Class-level
 *   router.post('/api/kb', requireAbility('create', 'KnowledgeBase'), createKbHandler)
 *
 *   // Row-scoped (the case the bug fix enables)
 *   router.put('/api/kb/:id', requireAbility('update', 'KnowledgeBase', 'id'), updateKbHandler)
 */
export function requireAbility(
  action: string,
  subjectName: string,
  idParam?: string,
): RequestHandler {
  return async (req, res, next) => {
    // Session guards
    const user = req.session?.user
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (!req.user) req.user = user

    const tenantId = req.session.currentOrgId || (user as any).current_org_id || ''

    try {
      // Load cached ability first, build fresh on cache miss.
      let ability: AppAbility | null = await abilityService.loadCachedAbility(req.sessionID)
      if (!ability) {
        ability = await buildAbilityFor({
          id: user.id,
          role: user.role,
          is_superuser: user.is_superuser ?? null,
          current_org_id: tenantId,
        })
        await abilityService.cacheAbility(req.sessionID, ability)
      }

      // ── Row-scoped check (the P3.1b bug fix) ──────────────────────
      // When idParam is provided, build a CASL subject instance so the
      // ability matcher considers row-scoped rules whose conditions contain
      // `{id}` (and `{tenant_id, id}`). The OLD code called
      //   `ability.can(action, subject)`
      // with a bare string, which never matched any rule whose conditions
      // included an `id` clause — silently bypassing every row-scoped grant.
      let allowed: boolean
      if (idParam) {
        const id = req.params[idParam]
        if (id == null) {
          // Route declared an idParam but the request did not provide it.
          // Developer error — fail closed.
          log.error('[requireAbility] idParam not found in req.params', {
            action,
            subject: subjectName,
            idParam,
            paramKeys: Object.keys(req.params ?? {}),
          })
          res.status(500).json({ error: 'permission_check_misconfigured' })
          return
        }
        // Canonical CASL instance wrapper. Carries both tenant and id so
        // rules with `{tenant_id, id}` (V2 resource_grants shape) match.
        const instance = toCaslSubject(subjectName as any, {
          id,
          tenant_id: tenantId,
        }) as any
        allowed = ability.can(action as any, instance)
      } else {
        // ── Class-level check (original 2-arg semantics preserved) ──
        allowed = ability.can(action as any, subjectName as any)
      }

      if (allowed) {
        // Attach ability for downstream handlers that want to re-check
        ;(req as any).ability = ability
        next()
        return
      }

      // Deny path — audit log on mutations only
      const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
      if (isMutation) {
        auditService
          .logPermissionDeny({
            actor: user.id,
            tenantId,
            permissionKey: `${subjectName}.${action}`,
            action,
            subject: subjectName,
            method: req.method,
            path: req.path,
          })
          .catch(err => log.warn('[requireAbility] audit log failed', { err }))
      }
      log.warn('CASL access denied', {
        userId: user.id,
        action,
        subject: subjectName,
        role: user.role,
        idParam: idParam ?? null,
      })
      res.status(403).json({ error: 'permission_denied', action, subject: subjectName })
      return
    } catch (error) {
      // Fail closed in production; fail open in non-prod with a loud warning
      if (config.nodeEnv === 'production') {
        log.error('[requireAbility] check failed', {
          error: error instanceof Error ? error.message : String(error),
          userId: user.id,
          action,
          subject: subjectName,
        })
        res.status(500).json({ error: 'permission_check_failed' })
        return
      } else {
        log.warn('[requireAbility] check failed in non-prod — failing OPEN', {
          error: error instanceof Error ? error.message : String(error),
          userId: user.id,
          action,
          subject: subjectName,
        })
        next()
        return
      }
    }
  }
}

/**
 * @description Centralized helper for authorization errors.
 * Logs a warning with details and sends a consistent JSON error response.
 * @param {Response} res - Express response object
 * @param {401 | 403} statusCode - HTTP status code (401 for unauthenticated, 403 for unauthorized)
 * @param {string} logMessage - Message to log for debugging
 * @param {Record<string, unknown>} logDetails - Additional details for structured logging
 * @returns {void}
 */
export function authorizationError(
  res: Response,
  statusCode: 401 | 403,
  logMessage: string,
  logDetails: Record<string, unknown>
): void {
  // Log the authorization failure with details
  log.warn(logMessage, logDetails)

  // Determine user-facing message based on status code
  const message = statusCode === 401
    ? 'Authentication required'
    : 'Access denied'

  // Send consistent error response
  res.status(statusCode).json({ error: message })
}
