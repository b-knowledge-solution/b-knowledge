
/**
 * @fileoverview Chat dialog controller.
 * Handles HTTP requests for dialog (chat assistant configuration) CRUD
 * and RBAC access control management.
 *
 * @module controllers/chat-dialog
 */

import { Request, Response } from 'express'
import { log } from '@/shared/services/logger.service.js'
import { chatDialogService } from '../services/chat-dialog.service.js'
import { ModelFactory } from '@/shared/models/factory.js'

/**
 * Controller class for chat dialog endpoints.
 */
export class ChatDialogController {
  /**
   * Create a new dialog configuration.
   * @param req - Express request with dialog data in body
   * @param res - Express response
   */
  async createDialog(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      // Create dialog with validated body data
      const dialog = await chatDialogService.createDialog(req.body, userId)
      res.status(201).json(dialog)
    } catch (error) {
      log.error('Error creating dialog', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Get a dialog by ID.
   * @param req - Express request with :id param
   * @param res - Express response
   */
  async getDialog(req: Request, res: Response): Promise<void> {
    try {
      const dialog = await chatDialogService.getDialog(req.params.id!)

      if (!dialog) {
        res.status(404).json({ error: 'Dialog not found' })
        return
      }

      res.json(dialog)
    } catch (error) {
      log.error('Error getting dialog', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * List all dialogs with RBAC filtering.
   * Admins see all; other users see their own, public, and shared dialogs.
   * @param req - Express request
   * @param res - Express response
   */
  async listDialogs(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      const userRole = req.user?.role

      if (!userId || !userRole) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      // Fetch team IDs the user belongs to for RBAC evaluation
      const userTeams = await ModelFactory.userTeam.findAll({ user_id: userId })
      const teamIds = userTeams.map((ut: { team_id: string }) => ut.team_id)

      // List dialogs filtered by RBAC rules
      const dialogs = await chatDialogService.listAccessibleDialogs(userId, userRole, teamIds)
      res.json(dialogs)
    } catch (error) {
      log.error('Error listing dialogs', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Update an existing dialog.
   * @param req - Express request with :id param and update data in body
   * @param res - Express response
   */
  async updateDialog(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      // Update dialog with validated body data
      const updated = await chatDialogService.updateDialog(req.params.id!, req.body, userId)

      if (!updated) {
        res.status(404).json({ error: 'Dialog not found' })
        return
      }

      res.json(updated)
    } catch (error) {
      log.error('Error updating dialog', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Delete a dialog by ID.
   * @param req - Express request with :id param
   * @param res - Express response
   */
  async deleteDialog(req: Request, res: Response): Promise<void> {
    try {
      // Delete the dialog record
      await chatDialogService.deleteDialog(req.params.id!)
      res.status(204).send()
    } catch (error) {
      log.error('Error deleting dialog', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Get access control entries for a dialog.
   * Returns entries enriched with user/team display names.
   * @param req - Express request with :id param
   * @param res - Express response
   */
  async getDialogAccess(req: Request, res: Response): Promise<void> {
    try {
      // Fetch access entries with resolved display names
      const entries = await chatDialogService.getDialogAccess(req.params.id!)
      res.json(entries)
    } catch (error) {
      log.error('Error getting dialog access', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Set (replace) access control entries for a dialog.
   * Bulk replaces all existing entries with the provided list.
   * @param req - Express request with :id param and entries in body
   * @param res - Express response
   */
  async setDialogAccess(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      // Bulk replace access entries with validated body data
      const entries = await chatDialogService.setDialogAccess(
        req.params.id!,
        req.body.entries,
        userId
      )
      res.json(entries)
    } catch (error) {
      log.error('Error setting dialog access', { error: (error as Error).message })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
