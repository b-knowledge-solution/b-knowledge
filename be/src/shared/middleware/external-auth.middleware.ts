/**
 * @fileoverview Middleware for authenticating external API requests via Bearer API keys.
 *
 * Extracts the key from the Authorization header, validates it via the ApiKeyService,
 * and attaches the user context and key metadata to the request object.
 *
 * @module middleware/external-auth
 */

import { Request, Response, NextFunction } from 'express'
import { apiKeyService } from '@/modules/external/services/api-key.service.js'
import type { ApiKey } from '@/modules/external/models/api-key.model.js'

// ---------------------------------------------------------------------------
// Type augmentation
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      /** Populated by external auth middleware with the validated API key record */
      apiKey?: ApiKey
    }
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * @description Middleware that authenticates requests using a Bearer API key.
 *   Extracts the token from the Authorization header, validates it via the
 *   ApiKeyService (with in-memory caching), and attaches the key record to req.apiKey.
 *   Returns 401 with OpenAI-compatible error format if authentication fails.
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Next middleware function
 * @returns {Promise<void>}
 */
export async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization

  // Require Bearer token format
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: {
        message: 'Missing API key. Provide a Bearer token in the Authorization header.',
        type: 'invalid_request_error',
        code: 'invalid_api_key',
      },
    })
    return
  }

  const rawKey = authHeader.slice(7)

  // Validate the API key
  const apiKey = await apiKeyService.validateApiKey(rawKey)
  if (!apiKey) {
    res.status(401).json({
      error: {
        message: 'Invalid or expired API key.',
        type: 'authentication_error',
        code: 'invalid_api_key',
      },
    })
    return
  }

  // Attach key record to request for downstream use
  req.apiKey = apiKey
  next()
}

/**
 * @description Factory that creates scope-checking middleware. Verifies that the
 *   API key has the required scope before allowing the request to proceed.
 * @param {string} requiredScope - The scope to check (e.g. 'chat', 'search', 'retrieval')
 * @returns {(req: Request, res: Response, next: NextFunction) => void} Express middleware
 */
export function requireScope(requiredScope: string) {
  /**
   * @description Scope validation middleware — checks if the API key includes the required scope
   * @param {Request} req - Express request with apiKey attached
   * @param {Response} res - Express response
   * @param {NextFunction} next - Next middleware
   */
  return (req: Request, res: Response, next: NextFunction): void => {
    const scopes = req.apiKey?.scopes ?? []

    // Check if the key has the required scope
    if (!scopes.includes(requiredScope)) {
      res.status(403).json({
        error: {
          message: `API key does not have the '${requiredScope}' scope.`,
          type: 'permission_error',
          code: 'insufficient_scope',
        },
      })
      return
    }

    next()
  }
}
