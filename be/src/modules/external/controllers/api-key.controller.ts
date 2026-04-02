/**
 * @fileoverview Controller for API key CRUD operations.
 *   All endpoints require session-based authentication (requireAuth).
 *   Users can only manage their own API keys.
 * @module controllers/api-key
 */

import { Request, Response } from 'express'
import { apiKeyService } from '../services/api-key.service.js'
import { log } from '@/shared/services/logger.service.js'

/**
 * @description Controller handling API key create, list, update, and delete operations.
 *   All operations are scoped to the authenticated user's own keys.
 */
export class ApiKeyController {
  /**
   * @description POST /api/external/api-keys — Create a new API key.
   *   Returns the full plaintext key exactly once in the response.
   * @param {Request} req - Express request with validated body (name, scopes, expires_at)
   * @param {Response} res - Express response with 201 and the created key
   * @returns {Promise<void>}
   */
  async create(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.session?.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' })
        return
      }

      const { name, scopes, expires_at } = req.body
      const expiresAt = expires_at ? new Date(expires_at) : null

      const result = await apiKeyService.createApiKey(userId, name, scopes, expiresAt)

      // Return the key record plus the plaintext key (shown only once)
      res.status(201).json({
        ...result.apiKey,
        plaintext_key: result.plaintextKey,
      })
    } catch (error) {
      log.error('Error creating API key', { error: (error as Error).message })
      res.status(500).json({ error: 'Failed to create API key' })
    }
  }

  /**
   * @description GET /api/external/api-keys — List all API keys for the authenticated user.
   *   Key hashes are excluded from the response for security.
   * @param {Request} req - Express request with authenticated session
   * @param {Response} res - Express response with array of API key records
   * @returns {Promise<void>}
   */
  async list(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.session?.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' })
        return
      }

      const keys = await apiKeyService.listApiKeys(userId)

      // Strip key_hash from response for security
      const safeKeys = keys.map(({ key_hash, ...rest }) => rest)
      res.json(safeKeys)
    } catch (error) {
      log.error('Error listing API keys', { error: (error as Error).message })
      res.status(500).json({ error: 'Failed to list API keys' })
    }
  }

  /**
   * @description PATCH /api/external/api-keys/:id — Update an API key's mutable fields.
   * @param {Request} req - Express request with key ID param and update body
   * @param {Response} res - Express response with updated key record
   * @returns {Promise<void>}
   */
  async update(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.session?.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' })
        return
      }

      const { id } = req.params
      const updated = await apiKeyService.updateApiKey(userId, id!, req.body)

      if (!updated) {
        res.status(404).json({ error: 'API key not found' })
        return
      }

      // Strip key_hash from response
      const { key_hash, ...safeKey } = updated
      res.json(safeKey)
    } catch (error) {
      log.error('Error updating API key', { error: (error as Error).message })
      res.status(500).json({ error: 'Failed to update API key' })
    }
  }

  /**
   * @description DELETE /api/external/api-keys/:id — Permanently delete an API key.
   * @param {Request} req - Express request with key ID param
   * @param {Response} res - Express response with 204 on success
   * @returns {Promise<void>}
   */
  async remove(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.session?.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' })
        return
      }

      const { id } = req.params
      const deleted = await apiKeyService.deleteApiKey(userId, id!)

      if (!deleted) {
        res.status(404).json({ error: 'API key not found' })
        return
      }

      res.status(204).send()
    } catch (error) {
      log.error('Error deleting API key', { error: (error as Error).message })
      res.status(500).json({ error: 'Failed to delete API key' })
    }
  }
}

/** Singleton instance */
export const apiKeyController = new ApiKeyController()
