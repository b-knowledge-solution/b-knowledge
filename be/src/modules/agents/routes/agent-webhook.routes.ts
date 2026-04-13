/**
 * @fileoverview Public webhook routes for triggering agent execution.
 *
 * These routes are intentionally unauthenticated — webhook callers (external
 * systems, CI/CD pipelines, Zapier, etc.) don't have user sessions.
 * A separate rate limiter is applied to prevent abuse.
 *
 * @module modules/agents/routes/agent-webhook
 */

import { Router, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { agentWebhookService } from '../services/agent-webhook.service.js'
import { log } from '@/shared/services/logger.service.js'
import { markPublicRoute } from '@/shared/middleware/markPublicRoute.js'

const router = Router()

// ============================================================================
// Rate Limiter
// ============================================================================

/**
 * @description Webhook-specific rate limiter: 100 requests per 15 minutes per IP.
 *   Stricter than the general API limiter to protect unauthenticated endpoints.
 */
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests, please try again later.' },
})

// ============================================================================
// Routes
// ============================================================================

/**
 * @description POST /agents/webhook/:agentId — Trigger an agent execution via webhook.
 *   No authentication required. Rate-limited to 100 requests per 15 min per IP.
 *   Accepts JSON body with 'input', 'message', or 'query' field.
 */
// Intentionally public — external webhook callers (CI, Zapier) have no user session.
router.post('/:agentId', markPublicRoute(), webhookLimiter, async (req: Request, res: Response) => {
  try {
    const agentId = req.params['agentId']!
    const result = await agentWebhookService.handleWebhook(agentId, req.body)
    res.status(201).json(result)
  } catch (error: any) {
    log.error('Webhook handler failed', { error: String(error) })
    const status = error.statusCode || 500
    res.status(status).json({ error: error.message || 'Webhook execution failed' })
  }
})

export default router
