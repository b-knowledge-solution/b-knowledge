
/**
 * Authentication Routes
 * Handles user login (Azure AD & Root), logout, token management, and session checks.
 */
import { Router } from 'express'
import { AuthController } from '@/modules/auth/auth.controller.js'
import { requireAuth } from '@/shared/middleware/auth.middleware.js'
import { markPublicRoute } from '@/shared/middleware/markPublicRoute.js'

const router = Router()
const controller = new AuthController()

/**
 * @route GET /api/auth/config
 * @description Public endpoint exposing frontend auth configuration (client IDs, flags).
 * @access Public
 */
// Return public auth config to frontend (e.g. for MSAL initialization)
router.get('/config', controller.getAuthConfig.bind(controller));

/**
 * @route GET /api/auth/me
 * @description Returns the current authenticated user (session-backed).
 * @access Public (Returns null or 401 if not authenticated)
 */
// Check and return current user session
router.get('/me', controller.getMe.bind(controller));

/**
 * @route GET /api/auth/login
 * @description Initiates Azure AD OAuth login flow.
 * @access Public
 */
// Start OAuth flow redirect
router.get('/login', controller.loginAzureAd.bind(controller));

/**
 * @route GET /api/auth/callback
 * @description OAuth callback handler; completes session creation.
 * @access Public
 */
// Handle OAuth redirect response and create session
router.get('/callback', controller.handleCallback.bind(controller));

/**
 * @route POST /api/auth/logout
 * @description Session logout; requires existing auth.
 * @access Private
 */
// Destroy user session
// markPublicRoute: gated by requireAuth; self-service session operation
// (any authenticated user can log themselves out — no permission key needed).
router.post('/logout', markPublicRoute(), requireAuth, controller.logout.bind(controller));

/**
 * @route POST /api/auth/reauth
 * @description Prompts user to re-enter credentials (refreshes auth timestamps).
 * @access Private
 */
// Refresh session validity timestamp
// markPublicRoute: gated by requireAuth; self-service session refresh.
router.post('/reauth', markPublicRoute(), requireAuth, controller.reauth.bind(controller));

/**
 * @route POST /api/auth/refresh-token
 * @description Refresh access token using stored refresh token.
 * @access Private
 */
// External provider token refresh
// markPublicRoute: gated by requireAuth; self-service refresh of the
// caller's own OAuth provider token — no permission key applies.
router.post('/refresh-token', markPublicRoute(), requireAuth, controller.refreshToken.bind(controller));

/**
 * @route GET /api/auth/token-status
 * @description Reports token freshness/expiry for client-side decisions.
 * @access Private
 */
// Check if token is nearing expiry
router.get('/token-status', requireAuth, controller.getTokenStatus.bind(controller));

/**
 * @route POST /api/auth/login/root
 * @description Root user (local) login path for bootstrap/admin emergency access.
 * @access Public
 */
// Authenticate using local root credentials config
// Intentionally public: this IS the login endpoint — the point is that no
// session/permission exists yet when the caller hits it.
router.post('/login/root', markPublicRoute(), controller.loginRoot.bind(controller));

/**
 * @route GET /api/auth/abilities
 * @description Returns serialized CASL rules for the current session (used by frontend AbilityProvider).
 * @access Private
 */
router.get('/abilities', requireAuth, controller.getAbilities.bind(controller));

/**
 * @route GET /api/auth/orgs
 * @description Returns the user's organization memberships with roles.
 * @access Private
 */
router.get('/orgs', requireAuth, controller.getOrgs.bind(controller));

/**
 * @route POST /api/auth/switch-org
 * @description Switches the user's active organization and recomputes CASL abilities.
 * @access Private
 */
// markPublicRoute: gated by requireAuth; self-service org switch — the
// switchOrg handler itself enforces R-12 membership (verified Wave 0 P3.0c),
// so no separate permission key applies here.
router.post('/switch-org', markPublicRoute(), requireAuth, controller.switchOrg.bind(controller));

export default router;
