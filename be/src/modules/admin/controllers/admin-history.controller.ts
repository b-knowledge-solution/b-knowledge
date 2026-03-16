/**
 * @fileoverview Admin History Controller
 * Handles internal requests for viewing chat and search history.
 */
import { Request, Response } from 'express';
import { log } from '@/shared/services/logger.service.js';
import { adminHistoryService } from '@/modules/admin/services/admin-history.service.js';

/**
 * @description Handles admin requests for viewing chat and search history across all users
 */
export class AdminHistoryController {
    /**
     * @description Retrieve paginated chat history with optional filters for email, date range, and search text
     * @param {Request} req - Express request object containing query parameters (page, limit, q, email, startDate, endDate, sourceName)
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async getChatHistory(req: Request, res: Response): Promise<void> {
        try {
            // Parse pagination and filter parameters from query
            const page = parseInt(req.query.page as string || '1', 10);
            const limit = parseInt(req.query.limit as string || '20', 10);
            const search = req.query.q as string || '';
            const email = req.query.email as string || '';
            const startDate = req.query.startDate as string || '';
            const endDate = req.query.endDate as string || '';
            const sourceName = req.query.sourceName as string || '';

            // Fetch chat history from service
            const sessions = await adminHistoryService.getChatHistory(page, limit, search, email, startDate, endDate, sourceName);
            res.json(sessions);
        } catch (error) {
            // Log error and return 500 status
            log.error('Error fetching chat history', error as Record<string, unknown>);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * @description Retrieve all messages for a specific chat session by its session ID
     * @param {Request} req - Express request object containing sessionId route parameter
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async getChatSessionDetails(req: Request, res: Response): Promise<void> {
        try {
            // Extract session ID from route parameters
            const { sessionId } = req.params;
            // Guard: reject requests without a session ID
            if (!sessionId) {
                res.status(400).json({ error: 'Session ID is required' });
                return;
            }

            // Fetch session details from service
            const messages = await adminHistoryService.getChatSessionDetails(sessionId);
            res.json(messages);
        } catch (error) {
            // Log error and return 500 status
            log.error('Error fetching chat session details', error as Record<string, unknown>);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * @description Retrieve paginated search history with optional filters for email, date range, and search text
     * @param {Request} req - Express request object containing query parameters (page, limit, q, email, startDate, endDate, sourceName)
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async getSearchHistory(req: Request, res: Response): Promise<void> {
        try {
            // Parse pagination and filter parameters from query
            const page = parseInt(req.query.page as string || '1', 10);
            const limit = parseInt(req.query.limit as string || '20', 10);
            const search = req.query.q as string || '';
            const email = req.query.email as string || '';
            const startDate = req.query.startDate as string || '';
            const endDate = req.query.endDate as string || '';
            const sourceName = req.query.sourceName as string || '';

            // Fetch search history from service
            const sessions = await adminHistoryService.getSearchHistory(page, limit, search, email, startDate, endDate, sourceName);
            res.json(sessions);
        } catch (error) {
            // Log error and return 500 status
            log.error('Error fetching search history', error as Record<string, unknown>);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * @description Retrieve all records for a specific search session by its session ID
     * @param {Request} req - Express request object containing sessionId route parameter
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async getSearchSessionDetails(req: Request, res: Response): Promise<void> {
        try {
            // Extract session ID from route parameters
            const { sessionId } = req.params;
            // Guard: reject requests without a session ID
            if (!sessionId) {
                res.status(400).json({ error: 'Session ID is required' });
                return;
            }

            // Fetch search session details from service
            const messages = await adminHistoryService.getSearchSessionDetails(sessionId);
            res.json(messages);
        } catch (error) {
            // Log error and return 500 status
            log.error('Error fetching search session details', error as Record<string, unknown>);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * @description Retrieve paginated system-level chat history with optional search filtering
     * @param {Request} req - Express request object containing query parameters (page, limit, q)
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async getSystemChatHistory(req: Request, res: Response): Promise<void> {
        try {
            // Parse pagination parameters from query
            const page = parseInt(req.query.page as string || '1', 10);
            const limit = parseInt(req.query.limit as string || '50', 10);
            const search = req.query.q as string || '';

            // Fetch system chat history from service
            const history = await adminHistoryService.getSystemChatHistory(page, limit, search);
            res.json(history);
        } catch (error) {
            // Log error and return 500 status
            log.error('Error fetching system chat history', error as Record<string, unknown>);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}
