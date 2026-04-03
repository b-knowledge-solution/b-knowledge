/**
 * @fileoverview Broadcast message controller: serves active system notices and manages admin CRUD with audit context.
 * @module modules/broadcast/controllers/broadcast-message
 */
import { Request, Response } from 'express'
import { broadcastMessageService } from '@/modules/broadcast/services/broadcast-message.service.js'
import { log } from '@/shared/services/logger.service.js'
import { getClientIp } from '@/shared/utils/ip.js'

/**
 * @description Controller for broadcast message endpoints including public active messages and admin CRUD
 */
export class BroadcastMessageController {
    /**
     * @description Get active broadcast messages for the current user
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async getActive(req: Request, res: Response): Promise<void> {
        try {
            // Get user ID if authenticated
            const userId = req.user?.id;
            // Fetch active messages relevant to user
            const messages = await broadcastMessageService.getActiveMessages(userId);
            res.json(messages);
        } catch (error) {
            // Log error and return 500 status
            log.error('Failed to fetch active broadcast messages', { error: String(error) });
            res.status(500).json({ error: 'Failed to fetch active broadcast messages' });
        }
    }

    /**
     * @description Get all broadcast messages for admin management
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async getAll(req: Request, res: Response): Promise<void> {
        try {
            // Fetch all messages from service
            const messages = await broadcastMessageService.getAllMessages();
            res.json(messages);
        } catch (error) {
            // Log error and return 500 status
            log.error('Failed to fetch all broadcast messages', { error: String(error) });
            res.status(500).json({ error: 'Failed to fetch broadcast messages' });
        }
    }

    /**
     * @description Create a new broadcast message with audit trail
     * @param {Request} req - Express request object containing message details
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async create(req: Request, res: Response): Promise<void> {
        try {
            // Capture user context for audit
            const user = req.user ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) } : undefined;
            // Create message via service
            const message = await broadcastMessageService.createMessage(req.body, user);
            res.status(201).json(message);
        } catch (error) {
            // Log error and return 500 status
            log.error('Failed to create broadcast message', { error: String(error) });
            res.status(500).json({ error: 'Failed to create broadcast message' });
        }
    }

    /**
     * @description Update an existing broadcast message by ID
     * @param {Request} req - Express request object containing updates
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async update(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        // Validate ID presence
        if (!id) {
            res.status(400).json({ error: 'ID is required' });
            return;
        }
        try {
            // Capture user context for audit
            const user = req.user ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) } : undefined;
            // Update message via service
            const message = await broadcastMessageService.updateMessage(id, req.body, user);

            // Handle not found case
            if (!message) {
                res.status(404).json({ error: 'Broadcast message not found' });
                return;
            }
            res.json(message);
        } catch (error) {
            // Log error and return 500 status
            log.error('Failed to update broadcast message', { id: req.params.id, error: String(error) });
            res.status(500).json({ error: 'Failed to update broadcast message' });
        }
    }

    /**
     * @description Delete a broadcast message by ID with audit trail
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async delete(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        // Validate ID presence
        if (!id) {
            res.status(400).json({ error: 'ID is required' });
            return;
        }
        try {
            // Capture user context for audit
            const user = req.user ? { id: req.user.id, email: req.user.email, ip: getClientIp(req) } : undefined;
            // Delete message via service
            const deleted = await broadcastMessageService.deleteMessage(id, user);

            // Handle not found case
            if (!deleted) {
                res.status(404).json({ error: 'Broadcast message not found' });
                return;
            }
            res.json({ success: true });
        } catch (error) {
            // Log error and return 500 status
            log.error('Failed to delete broadcast message', { id: req.params.id, error: String(error) });
            res.status(500).json({ error: 'Failed to delete broadcast message' });
        }
    }

    /**
     * @description Dismiss a broadcast message for the current user, storing preference server-side if authenticated
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     * @returns {Promise<any>}
     */
    async dismiss(req: Request, res: Response): Promise<any> {
        try {
            const userId = req.user?.id;
            const { id: broadcastId } = req.params;

            // Handle unauthenticated dismissal (client-side only)
            if (!userId) {
                // If not logged in, we silently succeed (frontend will fallback to localStorage)
                return res.json({ success: true, localOnly: true });
            }

            // Validate broadcast ID
            if (!broadcastId) {
                return res.status(400).json({ error: 'ID is required' });
            }

            // Persist dismissal via service
            await broadcastMessageService.dismissMessage(userId, broadcastId, req.user?.email, getClientIp(req));
            return res.json({ success: true });
        } catch (error) {
            // Log error and return 500 status
            log.error('Failed to dismiss broadcast message', { id: req.params.id, error: String(error) });
            return res.status(500).json({ error: 'Failed to dismiss broadcast message' });
        }
    }
}
