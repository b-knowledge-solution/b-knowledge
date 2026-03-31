/**
 * @fileoverview Admin History Controller
 * Handles internal requests for viewing chat, search, and agent run history.
 */
import { Request, Response } from 'express';
import { log } from '@/shared/services/logger.service.js';
import { getTenantId } from '@/shared/middleware/tenant.middleware.js';
import { adminHistoryService } from '@/modules/admin/services/admin-history.service.js';
import type { FeedbackFilter } from '@/modules/admin/services/admin-history.service.js';

/**
 * @description Handles admin requests for viewing chat, search, and agent run history across all users
 */
export class AdminHistoryController {
    /**
     * @description Parse feedbackFilter query param into a validated FeedbackFilter or undefined.
     * @param {string | undefined} raw - Raw query parameter value
     * @returns {FeedbackFilter | undefined} Validated feedback filter or undefined
     */
    private parseFeedbackFilter(raw?: string): FeedbackFilter | undefined {
        // Only accept known filter values, ignore unknown input
        const valid: FeedbackFilter[] = ['positive', 'negative', 'any', 'none']
        return raw && valid.includes(raw as FeedbackFilter) ? raw as FeedbackFilter : undefined
    }

    /**
     * @description Retrieve paginated chat history with optional filters for email, date range, search text, and feedback status
     * @param {Request} req - Express request object containing query parameters (page, limit, q, email, startDate, endDate, sourceName, feedbackFilter)
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
            const feedbackFilter = this.parseFeedbackFilter(req.query.feedbackFilter as string);

            // Extract tenant ID for scoping feedback subqueries
            const tenantId = getTenantId(req) || undefined

            // Fetch chat history from service with feedback enrichment
            const sessions = await adminHistoryService.getChatHistory(page, limit, search, email, startDate, endDate, sourceName, feedbackFilter, tenantId);
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

            // Extract tenant ID for scoping feedback queries
            const tenantId = getTenantId(req) || undefined

            // Fetch session details from service with feedback enrichment
            const messages = await adminHistoryService.getChatSessionDetails(sessionId, tenantId);
            res.json(messages);
        } catch (error) {
            // Log error and return 500 status
            log.error('Error fetching chat session details', error as Record<string, unknown>);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * @description Retrieve paginated search history with optional filters for email, date range, search text, and feedback status
     * @param {Request} req - Express request object containing query parameters (page, limit, q, email, startDate, endDate, sourceName, feedbackFilter)
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
            const feedbackFilter = this.parseFeedbackFilter(req.query.feedbackFilter as string);

            // Extract tenant ID for scoping feedback subqueries
            const tenantId = getTenantId(req) || undefined

            // Fetch search history from service with feedback enrichment
            const sessions = await adminHistoryService.getSearchHistory(page, limit, search, email, startDate, endDate, sourceName, feedbackFilter, tenantId);
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

            // Extract tenant ID for scoping feedback queries
            const tenantId = getTenantId(req) || undefined

            // Fetch search session details from service with feedback enrichment
            const messages = await adminHistoryService.getSearchSessionDetails(sessionId, tenantId);
            res.json(messages);
        } catch (error) {
            // Log error and return 500 status
            log.error('Error fetching search session details', error as Record<string, unknown>);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * @description Retrieve paginated agent run history with feedback counts
     * @param {Request} req - Express request with query params (page, limit, q, email, startDate, endDate, feedbackFilter)
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async getAgentRunHistory(req: Request, res: Response): Promise<void> {
        try {
            // Parse pagination and filter parameters
            const page = parseInt(req.query.page as string || '1', 10)
            const limit = parseInt(req.query.limit as string || '20', 10)
            const search = req.query.q as string || ''
            const email = req.query.email as string || ''
            const startDate = req.query.startDate as string || ''
            const endDate = req.query.endDate as string || ''
            const feedbackFilter = this.parseFeedbackFilter(req.query.feedbackFilter as string)

            // Extract tenant ID for scoping agent run queries
            const tenantId = getTenantId(req) || undefined

            // Fetch agent run history from service (tenant-scoped)
            const runs = await adminHistoryService.getAgentRunHistory(page, limit, search, email, startDate, endDate, feedbackFilter, tenantId)
            res.json(runs)
        } catch (error) {
            log.error('Error fetching agent run history', error as Record<string, unknown>)
            res.status(500).json({ error: 'Internal server error' })
        }
    }

    /**
     * @description Retrieve details for a specific agent run including steps and feedback
     * @param {Request} req - Express request with runId route parameter
     * @param {Response} res - Express response object
     * @returns {Promise<void>}
     */
    async getAgentRunDetails(req: Request, res: Response): Promise<void> {
        try {
            const { runId } = req.params
            // Guard: reject requests without a run ID
            if (!runId) {
                res.status(400).json({ error: 'Run ID is required' })
                return
            }

            // Extract tenant ID for scoping agent run detail queries
            const tenantId = getTenantId(req) || undefined

            const details = await adminHistoryService.getAgentRunDetails(runId, tenantId)
            // Return 404 if run not found
            if (!details) {
                res.status(404).json({ error: 'Agent run not found' })
                return
            }
            res.json(details)
        } catch (error) {
            log.error('Error fetching agent run details', error as Record<string, unknown>)
            res.status(500).json({ error: 'Internal server error' })
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
