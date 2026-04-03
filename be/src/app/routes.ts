
/**
 * Centralized route registration for all API endpoints.
 * Consolidates route imports, middleware, and mounts them on the Express app.
 * @module routes/index
 */
import { Router, Express, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { checkConnection } from '@/shared/db/index.js';
import { getRedisStatus } from '@/shared/services/redis.service.js';
import { log } from '@/shared/services/logger.service.js';
import { HealthStatus } from '@/shared/constants/index.js';

// Route imports
import authRoutes from '@/modules/auth/auth.routes.js';

import systemRoutes from '@/modules/system/routes/system.routes.js';
import userRoutes from '@/modules/users/routes/users.routes.js';
import teamRoutes from '@/modules/teams/routes/teams.routes.js';
import systemToolsRoutes from '@/modules/system-tools/system-tools.routes.js';
import auditRoutes from '@/modules/audit/routes/audit.routes.js';

import broadcastMessageRoutes from '@/modules/broadcast/routes/broadcast-message.routes.js';
import systemHistoryRoutes from '@/modules/system/routes/system-history.routes.js';
import chatConversationRoutes from '@/modules/chat/routes/chat-conversation.routes.js';
import chatAssistantRoutes from '@/modules/chat/routes/chat-assistant.routes.js';
import chatEmbedRoutes from '@/modules/chat/routes/chat-embed.routes.js';
import chatFileRoutes from '@/modules/chat/routes/chat-file.routes.js';
import userHistoryRoutes from '@/modules/user-history/user-history.routes.js';
import searchRoutes from '@/modules/search/routes/search.routes.js';
import searchEmbedRoutes from '@/modules/search/routes/search-embed.routes.js';
import chatOpenaiRoutes from '@/modules/chat/routes/chat-openai.routes.js';
import searchOpenaiRoutes from '@/modules/search/routes/search-openai.routes.js';

import dashboardRoutes from '@/modules/dashboard/dashboard.routes.js';
import glossaryRoutes from '@/modules/glossary/routes/glossary.routes.js';
import ragRoutes from '@/modules/rag/routes/rag.routes.js';
import llmProviderRoutes from '@/modules/llm-provider/routes/llm-provider.routes.js';
import llmProviderPublicRoutes from '@/modules/llm-provider/routes/llm-provider-public.routes.js';
import syncRoutes from '@/modules/sync/routes/sync.routes.js';
import knowledgeBaseRoutes from '@/modules/knowledge-base/routes/knowledge-base.routes.js';
import feedbackRoutes from '@/modules/feedback/routes/feedback.routes.js';
import apiKeyRoutes from '@/modules/external/routes/api-key.routes.js';
import externalApiRoutes from '@/modules/external/routes/external-api.routes.js';
import agentRoutes from '@/modules/agents/routes/agent.routes.js';
import agentWebhookRoutes from '@/modules/agents/routes/agent-webhook.routes.js';
import agentEmbedRoutes from '@/modules/agents/routes/agent-embed.routes.js';
import memoryRoutes from '@/modules/memory/routes/memory.routes.js';
import codeGraphRoutes from '@/modules/code-graph/code-graph.routes.js';
import { agentController } from '@/modules/agents/controllers/agent.controller.js';
import { agentEmbedController } from '@/modules/agents/controllers/agent-embed.controller.js';
import { requireAuth, requireAbility } from '@/shared/middleware/auth.middleware.js';
import { requireTenant } from '@/shared/middleware/tenant.middleware.js';

// ============================================================================
// Rate Limiters
// ============================================================================

/**
 * @description General API rate limiter: 1000 requests per 15-minute window per IP.
 */
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
});

/**
 * @description Stricter rate limit for authentication endpoints: 20 attempts per 15-minute window.
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please try again later.' },
});

// ============================================================================
// Middleware
// ============================================================================

/**
 * @description Validates the Content-Type header on mutation requests (POST/PUT/PATCH).
 * Rejects requests with unsupported content types with HTTP 415.
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Next middleware function
 */
const validateContentType = (req: Request, res: Response, next: NextFunction) => {
    // Only validate mutation methods that typically carry a body
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        const contentType = req.headers['content-type'];
        // Allow requests without Content-Type (e.g. empty body)
        if (!contentType) return next();

        // Accept standard web content types
        if (contentType.includes('application/json') ||
            contentType.includes('multipart/form-data') ||
            contentType.includes('application/x-www-form-urlencoded')) {
            return next();
        }

        // Reject unsupported content types
        return res.status(415).json({
            error: 'Unsupported Media Type',
            message: 'Content-Type must be application/json, multipart/form-data, or application/x-www-form-urlencoded'
        });
    }
    next();
};

// ============================================================================
// Route Registration
// ============================================================================

/**
 * @description Register all feature-module routes on the provided Express router.
 * Each module is mounted at its own base path under /api/.
 * @param {Router} apiRouter - Express Router instance to mount routes on
 * @returns {void}
 */
function registerRoutes(apiRouter: Router): void {
    // Apply auth rate limiting to login endpoints
    apiRouter.use('/auth/login', authLimiter);
    apiRouter.use('/auth/callback', authLimiter);

    // Authentication routes
    apiRouter.use('/auth', authRoutes);

    // System routes
    apiRouter.use('/system', systemRoutes);
    apiRouter.use('/system/history', systemHistoryRoutes);
    apiRouter.use('/system/dashboard', dashboardRoutes);

    // User management
    apiRouter.use('/users', userRoutes);
    apiRouter.use('/user/history', userHistoryRoutes);

    // Team management
    apiRouter.use('/teams', teamRoutes);

    // System tools (health checks, diagnostics)
    apiRouter.use('/system-tools', systemToolsRoutes);

    // Audit logging
    apiRouter.use('/audit', auditRoutes);


    // Broadcast messages
    apiRouter.use('/broadcast-messages', broadcastMessageRoutes);

    // Chat conversations (local DB + LLM)
    apiRouter.use('/chat', chatConversationRoutes);

    // Chat assistants (assistant configuration)
    apiRouter.use('/chat', chatAssistantRoutes);

    // Chat embed widget (token management + public endpoints)
    apiRouter.use('/chat', chatEmbedRoutes);

    // Chat file uploads (images + PDFs for multimodal)
    apiRouter.use('/chat', chatFileRoutes);

    // Search apps
    apiRouter.use('/search', searchRoutes);

    // Search embed widget (token management + public endpoints)
    apiRouter.use('/search', searchEmbedRoutes);

    // Glossary management (tasks, keywords, prompt builder)
    apiRouter.use('/glossary', glossaryRoutes);

    // RAG datasets and documents
    apiRouter.use('/rag', ragRoutes);

    // LLM provider management (admin only)
    apiRouter.use('/llm-provider', llmProviderRoutes);

    // Public model listing (auth required, no admin permission)
    apiRouter.use('/models', llmProviderPublicRoutes);

    // Data source sync (connectors → MinIO → parse)
    apiRouter.use('/sync', syncRoutes);

    // Answer feedback (chat and search quality tracking)
    apiRouter.use('/feedback', feedbackRoutes);

    // Knowledge Base (multi-category document management)
    apiRouter.use('/knowledge-base', knowledgeBaseRoutes);

    // Agent webhook (unauthenticated, rate-limited — must be before authenticated agent routes)
    apiRouter.use('/agents/webhook', agentWebhookRoutes);

    // Agent embed widget (token-based public access — must be before authenticated agent routes)
    apiRouter.use('/agents/embed', agentEmbedRoutes);

    // Agent templates (authenticated, registered before /:id to prevent Express param collision)
    apiRouter.get('/agents/templates', requireAuth, requireTenant, agentController.listTemplates.bind(agentController));

    // Agent embed token management (authenticated)
    apiRouter.post('/agents/:id/embed-token', requireAuth, requireTenant, agentEmbedController.getEmbedToken.bind(agentEmbedController));
    apiRouter.get('/agents/:id/embed-tokens', requireAuth, requireTenant, agentEmbedController.listTokens.bind(agentEmbedController));
    apiRouter.delete('/agents/embed-tokens/:tokenId', requireAuth, requireTenant, agentEmbedController.revokeToken.bind(agentEmbedController));

    // Agents (AI workflow graphs with versioning)
    apiRouter.use('/agents', agentRoutes);

    // Memory pools (persistent knowledge store for agents/chat)
    apiRouter.use('/memory', memoryRoutes);

    // Code knowledge graph (Memgraph Bolt queries)
    apiRouter.use('/code-graph', codeGraphRoutes);

    // External API key management (session auth)
    apiRouter.use('/external/api-keys', apiKeyRoutes);

    // OpenAI-compatible API endpoints (Bearer token auth)
    apiRouter.use('/v1', chatOpenaiRoutes);
    apiRouter.use('/v1', searchOpenaiRoutes);

    // External evaluation API (API key auth)
    apiRouter.use('/v1/external', externalApiRoutes);
}

// ============================================================================
// Main Setup Function
// ============================================================================

/**
 * @description Configure all API routes and middleware on the Express app.
 * Sets up rate limiting, content validation, the health check endpoint,
 * all feature-module API routes, the 404 handler, and the global error handler.
 * @param {Express} app - Express application instance
 * @returns {void}
 */
export function setupApiRoutes(app: Express): void {
    // Apply general rate limiter to all API routes
    app.use('/api', generalLimiter);

    // Health check endpoint (outside /api for load balancer probes)
    app.get('/health', async (_req: Request, res: Response) => {
        const timestamp = new Date().toISOString();
        const dbConnected = await checkConnection();
        const redisStatus = getRedisStatus();

        // Report 'ok' only when both DB and Redis are healthy; treat unconfigured Redis as acceptable
        const healthPayload = {
            status: dbConnected && (redisStatus === HealthStatus.CONNECTED || redisStatus === HealthStatus.NOT_CONFIGURED) ? HealthStatus.OK : HealthStatus.DEGRADED,
            timestamp,
            services: {
                express: 'running',
                database: dbConnected ? HealthStatus.CONNECTED : HealthStatus.DISCONNECTED,
                redis: redisStatus,
            },
        };

        res.status(healthPayload.status === HealthStatus.OK ? 200 : 503).json(healthPayload);
    });

    // Content-Type validation middleware
    app.use('/api', validateContentType);

    // Register all API routes
    const apiRouter = Router();
    registerRoutes(apiRouter);
    app.use('/api', apiRouter);

    // 404 handler for unknown API routes
    app.use('/api/*', (_req: Request, res: Response) => {
        res.status(404).json({ error: 'Not Found', message: 'The requested API endpoint does not exist' });
    });

    // Global error handler
    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
        log.error('Unhandled error', { error: err.message, stack: err.stack });
        res.status(500).json({ error: 'Internal server error' });
    });
}

export { registerRoutes };
export default setupApiRoutes;
