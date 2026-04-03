/**
 * @fileoverview User History Controller.
 * Handles HTTP requests for user-specific chat and search history.
 * Extracts user email from authenticated session and delegates to service.
 * 
 * @module controllers/user-history.controller
 */

import { Request, Response, NextFunction } from 'express';
import { userHistoryService } from '@/modules/user-history/user-history.service.js';

/**
 * @description Controller for user-specific history endpoints that extracts the user's email from the authenticated session
 */
export class UserHistoryController {
    /**
     * @description Get paginated chat history for the authenticated user
     * @param {Request} req - Express request with query params: q, startDate, endDate, page, limit
     * @param {Response} res - Express response
     * @param {NextFunction} next - Express next middleware
     * @returns {Promise<any>}
     */
    async getChatHistory(req: Request, res: Response, next: NextFunction) {
        try {
            // Extract user email from authenticated session
            const userEmail = (req as any).user?.email;

            // Validate user is authenticated
            if (!userEmail) {
                return res.status(401).json({ error: 'User not authenticated' });
            }

            // Parse query parameters with defaults
            const q = (req.query.q as string) || '';
            const startDate = (req.query.startDate as string) || '';
            const endDate = (req.query.endDate as string) || '';
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 20;

            // Call service to get user's chat history
            const result = await userHistoryService.getChatHistory(
                userEmail,
                page,
                limit,
                q,
                startDate,
                endDate
            );

            // Return results
            return res.json(result);
        } catch (error) {
            // Pass error to error handling middleware
            return next(error);
        }
    }

    /**
     * @description Get details for a specific chat session, verifying user ownership
     * @param {Request} req - Express request with sessionId param
     * @param {Response} res - Express response
     * @param {NextFunction} next - Express next middleware
     * @returns {Promise<any>}
     */
    async getChatSessionDetails(req: Request, res: Response, next: NextFunction) {
        try {
            // Extract user email from authenticated session
            const userEmail = (req as any).user?.email;

            // Validate user is authenticated
            if (!userEmail) {
                return res.status(401).json({ error: 'User not authenticated' });
            }

            // Extract session ID from URL params
            const sessionId = req.params.sessionId;

            // Validate session ID is provided
            if (!sessionId) {
                return res.status(400).json({ error: 'Session ID is required' });
            }

            // Call service to get session details (filtered by user email)
            const result = await userHistoryService.getChatSessionDetails(sessionId, userEmail);

            // Return results
            return res.json(result);
        } catch (error) {
            // Pass error to error handling middleware
            return next(error);
        }
    }

    /**
     * @description Get paginated search history for the authenticated user
     * @param {Request} req - Express request with query params: q, startDate, endDate, page, limit
     * @param {Response} res - Express response
     * @param {NextFunction} next - Express next middleware
     * @returns {Promise<any>}
     */
    async getSearchHistory(req: Request, res: Response, next: NextFunction) {
        try {
            // Extract user email from authenticated session
            const userEmail = (req as any).user?.email;

            // Validate user is authenticated
            if (!userEmail) {
                return res.status(401).json({ error: 'User not authenticated' });
            }

            // Parse query parameters with defaults
            const q = (req.query.q as string) || '';
            const startDate = (req.query.startDate as string) || '';
            const endDate = (req.query.endDate as string) || '';
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 20;

            // Call service to get user's search history
            const result = await userHistoryService.getSearchHistory(
                userEmail,
                page,
                limit,
                q,
                startDate,
                endDate
            );

            // Return results
            return res.json(result);
        } catch (error) {
            // Pass error to error handling middleware
            return next(error);
        }
    }

    /**
     * @description Get details for a specific search session, verifying user ownership
     * @param {Request} req - Express request with sessionId param
     * @param {Response} res - Express response
     * @param {NextFunction} next - Express next middleware
     * @returns {Promise<any>}
     */
    async getSearchSessionDetails(req: Request, res: Response, next: NextFunction) {
        try {
            // Extract user email from authenticated session
            const userEmail = (req as any).user?.email;

            // Validate user is authenticated
            if (!userEmail) {
                return res.status(401).json({ error: 'User not authenticated' });
            }

            // Extract session ID from URL params
            const sessionId = req.params.sessionId;

            // Validate session ID is provided
            if (!sessionId) {
                return res.status(400).json({ error: 'Session ID is required' });
            }

            // Call service to get session details (filtered by user email)
            const result = await userHistoryService.getSearchSessionDetails(sessionId, userEmail);

            // Return results
            return res.json(result);
        } catch (error) {
            // Pass error to error handling middleware
            return next(error);
        }
    }
}
