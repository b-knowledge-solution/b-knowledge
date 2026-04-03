
/**
 * System History Routes
 * Defines endpoints for accessing chat, search, and agent run history.
 */
import { Router } from 'express';
import { SystemHistoryController } from '../controllers/system-history.controller.js';
import { requireAuth, requireRole } from '@/shared/middleware/auth.middleware.js';
import { requireTenant } from '@/shared/middleware/tenant.middleware.js';

const router = Router();
const controller = new SystemHistoryController();

// Apply tenant scoping to all system history routes
router.use(requireTenant);

/**
 * Route Definitions
 * Define endpoints for accessing chat, search, and agent run history.
 * All routes are protected by authentication and role-based access control (RBAC).
 * Only users with 'admin' role can access these endpoints.
 */

/**
 * @route GET /api/system/history/chat
 * @description Retrieve paginated list of all chat sessions with feedback counts.
 * @access Private (Admin, Leader)
 */
// Ensure user is authenticated and has admin or leader privileges
router.get('/chat', requireAuth, requireRole('admin'), controller.getChatHistory.bind(controller));

/**
 * @route GET /api/system/history/chat/:sessionId
 * @description Retrieve details for a specific chat session.
 * @access Private (Admin, Leader)
 */
// Ensure user is authenticated and authorized before fetching session details
router.get('/chat/:sessionId', requireAuth, requireRole('admin'), controller.getChatSessionDetails.bind(controller));

/**
 * @route GET /api/system/history/search
 * @description Retrieve paginated list of all search history records with feedback counts.
 * @access Private (Admin, Leader)
 */
// Ensure user is authenticated and authorized before listing search history
router.get('/search', requireAuth, requireRole('admin'), controller.getSearchHistory.bind(controller));

/**
 * @route GET /api/system/history/search/:sessionId
 * @description Retrieve details for a specific search session.
 * @access Private (Admin, Leader)
 */
// Ensure user is authenticated and authorized before fetching search session details
router.get('/search/:sessionId', requireAuth, requireRole('admin'), controller.getSearchSessionDetails.bind(controller));

/**
 * @route GET /api/system/history/agent-runs
 * @description Retrieve paginated list of agent runs with feedback counts.
 * @access Private (Admin, Leader)
 */
// Ensure user is authenticated and authorized before listing agent run history
router.get('/agent-runs', requireAuth, requireRole('admin'), controller.getAgentRunHistory.bind(controller));

/**
 * @route GET /api/system/history/agent-runs/:runId
 * @description Retrieve details for a specific agent run including steps and feedback.
 * @access Private (Admin, Leader)
 */
// Ensure user is authenticated and authorized before fetching agent run details
router.get('/agent-runs/:runId', requireAuth, requireRole('admin'), controller.getAgentRunDetails.bind(controller));

/**
 * @route GET /api/system/history/system-chat
 * @description Retrieve paginated list of system-level chat history (e.g., from specific admin components).
 * @access Private (Admin, Leader)
 */
// Ensure user is authenticated and authorized before listing system chat history
router.get('/system-chat', requireAuth, requireRole('admin'), controller.getSystemChatHistory.bind(controller));

export default router;
