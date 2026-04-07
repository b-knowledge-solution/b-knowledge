/**
 * Authentication controller: handles Azure AD OAuth, root login, token refresh, and session lifecycle.
 * Keeps responses minimal to avoid leaking auth details; relies on session cookies for state.
 */
import { Request, Response } from 'express'
import { authService } from '@/modules/auth/auth.service.js'
import { userService } from '@/modules/users/index.js'
import { log } from '@/shared/services/logger.service.js'
import { getClientIp } from '@/shared/utils/ip.js'
import { config } from '@/shared/config/index.js'
import { updateAuthTimestamp, getCurrentUser } from '@/shared/middleware/auth.middleware.js'
import { abilityService } from '@/shared/services/ability.service.js'
import { getUuid } from '@/shared/utils/uuid.js'

/**
 * @description Handles Azure AD OAuth, root/local login, token refresh, and session lifecycle management
 */
export class AuthController {

    /**
     * @description Resolve the user's org membership and build + cache CASL ability on login.
     * Queries user_tenant to find the user's orgs, sets session.currentOrgId to the first org,
     * and builds/caches the CASL ability for the session.
     * @param {Request} req - Express request with session.user already set
     * @returns {Promise<void>}
     */
    private async wireAbilityOnLogin(req: Request): Promise<void> {
      const user = req.session.user
      if (!user) return

      try {
        // Query user_tenant to get the user's org memberships
        const memberships = await authService.findMembershipsByUserId(user.id)

        // If user has no user_tenant entry, create one with role='user' and system tenant
        if (memberships.length === 0) {
          const systemTenantId = config.opensearch.systemTenantId
          const now = Date.now()
          const nowDate = new Date().toISOString().replace('T', ' ').slice(0, 19)
          await authService.createMembership({
            id: getUuid(),
            user_id: user.id,
            tenant_id: systemTenantId,
            role: user.role || 'user',
            invited_by: systemTenantId,
            status: '1',
            create_time: now,
            create_date: nowDate,
            update_time: now,
            update_date: nowDate,
          })
          memberships.push({ tenant_id: systemTenantId, role: user.role || 'user' })
        }

        // Set session org context to the first membership (guaranteed non-empty after insert above)
        const primaryMembership = memberships[0]!
        req.session.currentOrgId = primaryMembership.tenant_id

        // Update session user role to match the org-level role from user_tenant
        if (req.session.user) {
          req.session.user.role = primaryMembership.role
        }

        // Build and cache CASL ability for this session
        const ability = await abilityService.buildAbilityFor({
          id: user.id,
          role: primaryMembership.role,
          is_superuser: user.is_superuser ?? null,
          current_org_id: primaryMembership.tenant_id,
          department: user.department ?? null,
        })
        await abilityService.cacheAbility(req.sessionID, ability)

        log.debug('Wired ability on login', {
          userId: user.id,
          orgId: primaryMembership.tenant_id,
          role: primaryMembership.role,
          ruleCount: ability.rules.length,
        })
      } catch (error) {
        // Non-fatal: ability will be built on-demand if not cached
        log.error('Failed to wire ability on login', {
          error: error instanceof Error ? error.message : String(error),
          userId: user.id,
        })
      }
    }

    /**
     * @description Return public authentication configuration for frontend MSAL initialization
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async getAuthConfig(req: Request, res: Response): Promise<void> {
        res.json({
            enableLocalLogin: config.enableLocalLogin,
            azureAd: {
                clientId: config.azureAd.clientId,
                tenantId: config.azureAd.tenantId,
                redirectUri: config.azureAd.redirectUri
            }
        });
    }

    /**
     * @description Return current authenticated user from session, verifying user still exists in DB
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async getMe(req: Request, res: Response): Promise<void> {
        if (req.session?.user) {
            try {
                // Verify user still exists in database (in case of DB reset/deletion)
                const dbUser = await userService.getUserById(req.session.user.id);

                if (!dbUser) {
                    log.warn('Session valid but user not found in DB (cleanup)', { userId: req.session.user.id });
                    // Destroy invalid session
                    req.session.destroy((err) => {
                        if (err) log.error('Failed to destroy invalid session', { error: err.message });
                        res.status(401).json({ error: 'User not found' });
                    });
                    return;
                }

                // Opportunistic IP recording so audit/IP alerts see resumed sessions
                const ipAddress = getClientIp(req)
                if (ipAddress) {
                    try {
                        await userService.recordUserIp(req.session.user.id, ipAddress)
                    } catch (ipError) {
                        // Log but don't fail the entire request
                        log.warn('Failed to record user IP', { userId: req.session.user.id, error: String(ipError) })
                    }
                }

                // Optional: update session with fresh DB data
                // req.session.user = { ...req.session.user, ...dbUser };

                res.json(req.session.user)
            } catch (error) {
                log.warn('Error verifying session user', { error: String(error) })
                res.status(500).json({ error: 'Internal server error' })
            }
        } else {
            res.status(401).json({ error: 'Unauthorized' })
        }
    }

    /**
     * @description Initiate Azure AD OAuth login flow by generating state token and redirecting to authorization URL
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async loginAzureAd(req: Request, res: Response): Promise<void> {
        // CSRF-style state guard per OAuth best practices
        const state = authService.generateState()
        req.session.oauthState = state
        // Redirect to Azure AD authorization URL
        res.redirect(authService.getAuthorizationUrl(state))
    }

    /**
     * @description Handle Azure AD OAuth callback: validate state, exchange code for tokens, upsert user, and create session
     * @param {Request} req - Express request object containing code, state, and error query parameters
     * @param {Response} res - Express response object (redirects to frontend)
     * @returns {Promise<void>}
     */
    async handleCallback(req: Request, res: Response): Promise<void> {
        const { code, state, error } = req.query;

        // Handle error from provider
        if (error) {
            log.error('Azure AD login error', { error })
            res.redirect(`${config.frontendUrl}/login?error=auth_failed`)
            return
        }

        // Validate code presence
        if (!code || typeof code !== 'string') {
            res.redirect(`${config.frontendUrl}/login?error=no_code`)
            return
        }

        // Validate state to prevent CSRF
        if (state !== req.session.oauthState) {
            log.warn('State mismatch in OAuth callback')
            res.redirect(`${config.frontendUrl}/login?error=invalid_state`)
            return
        }

        try {
            // Exchange auth code → tokens, then upsert local user record
            const tokens = await authService.exchangeCodeForTokens(code)
            const adUser = await authService.getUserProfile(tokens.access_token)
            const ipAddress = getClientIp(req)

            // Find or create user in local DB
            const user = await userService.findOrCreateUser(adUser, ipAddress)

            // Setup session user
            req.session.user = {
                ...user,
                displayName: user.display_name as string,
                permissions: typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions
            }

            // Explicitly set optional properties if they exist, cast to any to bypass strict type checks
            if (adUser.avatar) {
                (req.session.user as any).avatar = adUser.avatar
            }

            // Store tokens in session
            req.session.accessToken = tokens.access_token as any
            req.session.refreshToken = tokens.refresh_token as any
            req.session.tokenExpiresAt = (Date.now() + (tokens.expires_in * 1000)) as any

            updateAuthTimestamp(req, false)

            // Resolve org membership and build/cache CASL ability
            await this.wireAbilityOnLogin(req)

            // Save session and redirect
            req.session.save((err) => {
                if (err) {
                    log.error('Session save failed in OAuth callback', {
                        error: err.message,
                        userId: user.id,
                        email: user.email
                    })
                    res.redirect(`${config.frontendUrl}/login?error=session_error`)
                    return
                }
                log.info('Successful Azure AD login', { userId: user.id, email: user.email })
                res.redirect(config.frontendUrl)
            })
        } catch (err: any) {
            // detailed logging for debugging
            log.error('Authentication failed', { error: err.message })
            res.redirect(`${config.frontendUrl}/login?error=auth_failed`)
        }
    }

    /**
     * @description Destroy the current user session to log them out
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async logout(req: Request, res: Response): Promise<void> {
        // Destroy session
        req.session.destroy((err) => {
            if (err) {
                log.error('Logout failed', { error: err.message });
                res.status(500).json({ error: 'Logout failed' });
                return;
            }
            res.json({ message: 'Logged out successfully' })
        })
    }

    /**
     * @description Re-authenticate user by verifying password for sensitive operations (supports root, test, and local accounts)
     * @param {Request} req - Express request object with password in body
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async reauth(req: Request, res: Response): Promise<void> {
        const user = getCurrentUser(req)
        if (!user) {
            res.status(401).json({ error: 'Not authenticated' })
            return
        }

        const { password } = req.body
        const crypto = await import('crypto')

        // For root user, check against root password
        if (user.id === 'root-user') {
            const rootPass = config.rootPassword

            // Constant-time comparison to prevent timing attacks
            const passwordMatch = crypto.timingSafeEqual(
                Buffer.from(password.padEnd(256, '\0')),
                Buffer.from(rootPass.padEnd(256, '\0'))
            )

            if (!passwordMatch) {
                log.warn('Failed root re-authentication attempt', { userId: user.id })
                res.status(401).json({ error: 'Invalid password' })
                return
            }
        } else if (config.testPassword) {
            // For test users (from seed data), check against TEST_PASSWORD first
            const testPass = config.testPassword

            // Constant-time comparison to prevent timing attacks
            const testPasswordMatch = crypto.timingSafeEqual(
                Buffer.from(password.padEnd(256, '\0')),
                Buffer.from(testPass.padEnd(256, '\0'))
            )

            if (!testPasswordMatch) {
                // If test password doesn't match, try bcrypt for local accounts
                const dbUser = await authService.findUserById(user.id)

                if (dbUser?.password_hash) {
                    // Verify with bcrypt for local account users
                    const isValid = await authService.verifyPassword(password, dbUser.password_hash)
                    if (!isValid) {
                        log.warn('Failed local user re-authentication attempt', { userId: user.id })
                        res.status(401).json({ error: 'Invalid password' })
                        return
                    }
                } else {
                    log.warn('Failed test user re-authentication attempt', { userId: user.id })
                    res.status(401).json({ error: 'Invalid password' })
                    return
                }
            }
        } else {
            // For local DB users without TEST_PASSWORD, check bcrypt hash
            const dbUser = await authService.findUserById(user.id)

            if (dbUser?.password_hash) {
                const isValid = await authService.verifyPassword(password, dbUser.password_hash)
                if (!isValid) {
                    log.warn('Failed local user re-authentication attempt', { userId: user.id })
                    res.status(401).json({ error: 'Invalid password' })
                    return
                }
            }
            // If no password_hash, allow pass-through (Azure AD users cannot reauth with password)
        }

        // For other users, assume session is enough or extend logic
        updateAuthTimestamp(req, true)
        res.json({ success: true })
    }

    /**
     * @description Refresh the Azure AD access token using the stored refresh token in session
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async refreshToken(req: Request, res: Response): Promise<void> {
        const user = getCurrentUser(req)
        if (!user) {
            res.status(401).json({ error: 'Not authenticated' })
            return
        }

        // Root user does not use tokens
        if (user.id === 'root-user') {
            res.json({ success: true, message: 'Root user does not use tokens' })
            return
        }

        const refreshToken = req.session.refreshToken
        if (!refreshToken) {
            res.status(401).json({ error: 'NO_REFRESH_TOKEN' })
            return
        }

        try {
            // Exchange refresh token for new access token
            const newTokens = await authService.refreshAccessToken(refreshToken)
            req.session.accessToken = newTokens.access_token as any
            req.session.tokenExpiresAt = (Date.now() + (newTokens.expires_in * 1000)) as any
            if (newTokens.refresh_token) req.session.refreshToken = newTokens.refresh_token as any

            // Save new tokens to session
            req.session.save(() => {
                res.json({ success: true, expiresIn: newTokens.expires_in })
            })
        } catch (e) {
            res.status(401).json({ error: 'TOKEN_REFRESH_FAILED' })
        }
    }

    /**
     * @description Report whether the session contains a valid access token for client-side expiry decisions
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async getTokenStatus(req: Request, res: Response): Promise<void> {
        // Check if access token exists in session
        const user = getCurrentUser(req)
        res.json({ hasToken: !!req.session.accessToken })
    }

    /**
     * @description Authenticate using local root credentials and create a session with admin privileges
     * @param {Request} req - Express request object with username and password in body
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async loginRoot(req: Request, res: Response): Promise<void> {
        try {
            const { username, password } = req.body
            // Authenticate with service
            const result = await authService.login(username, password, getClientIp(req))
            // Setup session user
            req.session.user = {
                ...result.user,
                permissions: result.user.permissions || ['*'],
                display_name: result.user.displayName,
                displayName: result.user.displayName, // Map for compatibility
                created_at: new Date(),
                updated_at: new Date()
            }
            updateAuthTimestamp(req, false)

            // Resolve org membership and build/cache CASL ability
            await this.wireAbilityOnLogin(req)

            // Save session
            req.session.save(() => {
                res.json(result)
            })
        } catch (e) {
            res.status(401).json({ error: 'Invalid credentials' })
        }
    }

    /**
     * @description Generic login handler, currently delegates to loginRoot
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async login(req: Request, res: Response): Promise<void> {
        await this.loginRoot(req, res);
    }

    /**
     * @description Callback alias that delegates to handleCallback for route flexibility
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async callback(req: Request, res: Response): Promise<void> {
        await this.handleCallback(req, res);
    }

    /**
     * @description Return serialized CASL rules for the current session.
     * Loads from Valkey cache or builds fresh if cache misses.
     * Called by the frontend AbilityProvider on app load.
     * @route GET /api/auth/abilities
     * @access Private (requireAuth)
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async getAbilities(req: Request, res: Response): Promise<void> {
        const user = getCurrentUser(req)
        if (!user) {
            res.status(401).json({ error: 'Not authenticated' })
            return
        }

        try {
            // Try cached ability first for performance
            let ability = await abilityService.loadCachedAbility(req.sessionID)

            if (!ability) {
                // Cache miss — build fresh ability and cache it
                ability = await abilityService.buildAbilityFor({
                    id: user.id,
                    role: user.role,
                    is_superuser: user.is_superuser ?? null,
                    current_org_id: req.session.currentOrgId || '',
                    department: user.department ?? null,
                })
                await abilityService.cacheAbility(req.sessionID, ability)
            }

            res.json({ rules: ability.rules })
        } catch (error) {
            log.error('Failed to get abilities', {
                error: error instanceof Error ? error.message : String(error),
                userId: user.id,
            })
            res.status(500).json({ error: 'Internal server error' })
        }
    }

    /**
     * @description Return the user's organization memberships with roles.
     * Joins user_tenant with tenant to include org display names.
     * @route GET /api/auth/orgs
     * @access Private (requireAuth)
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async getOrgs(req: Request, res: Response): Promise<void> {
        const user = getCurrentUser(req)
        if (!user) {
            res.status(401).json({ error: 'Not authenticated' })
            return
        }

        try {
            // Query user_tenant joined with tenant for display names
            const memberships = await authService.findMembershipsWithOrgNames(user.id)

            res.json({
                orgs: memberships,
                currentOrgId: req.session.currentOrgId || null,
            })
        } catch (error) {
            log.error('Failed to get orgs', {
                error: error instanceof Error ? error.message : String(error),
                userId: user.id,
            })
            res.status(500).json({ error: 'Internal server error' })
        }
    }

    /**
     * @description Switch the user's active organization and recompute CASL abilities.
     * Verifies the user has a membership in the requested org before switching.
     * @route POST /api/auth/switch-org
     * @access Private (requireAuth)
     * @param {Request} req - Express request object with { orgId } in body
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async switchOrg(req: Request, res: Response): Promise<void> {
        const user = getCurrentUser(req)
        if (!user) {
            res.status(401).json({ error: 'Not authenticated' })
            return
        }

        const { orgId } = req.body
        if (!orgId || typeof orgId !== 'string') {
            res.status(400).json({ error: 'orgId is required' })
            return
        }

        try {
            // Verify user has a membership in the requested org
            const membership = await authService.findMembership(user.id, orgId)

            if (!membership) {
                res.status(403).json({ error: 'You are not a member of this organization' })
                return
            }

            // Update session with new org context
            req.session.currentOrgId = orgId
            if (req.session.user) {
                req.session.user.role = membership.role
            }

            // Invalidate old ability and build/cache fresh one with new org context
            await abilityService.invalidateAbility(req.sessionID)
            const ability = await abilityService.buildAbilityFor({
                id: user.id,
                role: membership.role,
                is_superuser: user.is_superuser ?? null,
                current_org_id: orgId,
                department: user.department ?? null,
            })
            await abilityService.cacheAbility(req.sessionID, ability)

            log.info('User switched org', {
                userId: user.id,
                newOrgId: orgId,
                newRole: membership.role,
            })

            res.json({ success: true, currentOrgId: orgId })
        } catch (error) {
            log.error('Failed to switch org', {
                error: error instanceof Error ? error.message : String(error),
                userId: user.id,
                orgId,
            })
            res.status(500).json({ error: 'Internal server error' })
        }
    }
}
