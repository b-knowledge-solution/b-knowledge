/**
 * @fileoverview API key validation middleware for trace endpoints.
 *
 * Verifies that incoming requests carry a valid X-API-Key header
 * matching the configured external trace API key.
 *
 * @module modules/trace/middleware/auth-trace
 */
import { Request, Response, NextFunction } from 'express'
import { config } from '@/shared/config/index.js'
import { log } from '@/shared/services/logger.service.js'

/**
 * Middleware to require an API key for trace/history routes.
 * @param req - Express request object.
 * @param res - Express response object.
 * @param next - Express next function.
 * @description Checks x-api-key header against configured external trace API key.
 *   In development, allows requests if no API key is configured.
 */
export function requireTraceApiKey(req: Request, res: Response, next: NextFunction): void {
  // Read API key from request header
  const apiKey = req.headers['x-api-key']

  if (!config.externalTrace.apiKey) {
    // In production, deny if API key is not configured
    if (config.isProduction) {
      log.error('External API Key is not configured in production.')
      res.status(500).json({ error: 'Server configuration error' })
      return
    }
    // In development, allow if no key configured
    next()
    return
  }

  // Compare provided key against configured key
  if (apiKey !== config.externalTrace.apiKey) {
    log.warn('Invalid External API Key attempt', {
      ip: req.ip,
      path: req.path,
    })
    res.status(401).json({ error: 'Invalid API Key' })
    return
  }

  // Key is valid
  next()
}
