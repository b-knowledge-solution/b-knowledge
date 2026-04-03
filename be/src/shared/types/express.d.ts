/**
 * @fileoverview Express and express-session type augmentations.
 *
 * Extends the default Express and express-session type definitions so that
 * `req.session.user`, `req.user`, and OAuth token fields are fully typed
 * throughout the application without manual casting.
 *
 * @module types/express
 */
import 'express-session';
import { User as DBUser } from '@/shared/models/types.js';

/**
 * @description Augment express-session's SessionData with application-specific fields.
 */
declare module 'express-session' {
  /**
   * @description Extended session data containing authenticated user info and OAuth tokens.
   */
  interface SessionData {
    /** Authenticated user record from the database */
    user: DBUser;
    /** OAuth 2.0 state parameter for CSRF protection during login flow */
    oauthState?: string;
    /** Azure AD access token for downstream API calls */
    accessToken?: string;
    /** Azure AD refresh token for token renewal */
    refreshToken?: string;
    /** Unix timestamp (ms) when the access token expires */
    tokenExpiresAt?: number;
    /** Unix timestamp (ms) of the last successful authentication */
    lastAuthAt?: number;
    /** Unix timestamp (ms) of the last re-authentication (for sensitive ops) */
    lastReauthAt?: number;
    /** Current active organization/tenant ID for multi-org support */
    currentOrgId?: string;
  }
}

declare global {
  namespace Express {
    /**
     * @description Express User interface mapped to the database User model.
     */
    interface User extends DBUser { }

    /**
     * @description Extended Express Request with optional typed user.
     */
    interface Request {
      /** Authenticated user attached by auth middleware */
      user?: User;
    }
  }
}
