/**
 * @fileoverview History routes for external chat and search history collection.
 *
 * Receives and logs chat/search history from external systems
 * (e.g. browser extensions, other apps).
 *
 * @module modules/trace/routes/history
 */
import { Router } from 'express'
import { TraceHistoryController } from '@/modules/trace/controllers/trace-history.controller.js'
import { requireTraceApiKey } from '@/modules/trace/middleware/auth-trace.middleware.js'

const router = Router()
const controller = new TraceHistoryController()

/**
 * @route POST /api/external/history/chat
 * @description Collect Chat History from external client.
 * @access Private (API Key required)
 */
// Protected by API key check to ensure source validity
router.post('/chat', requireTraceApiKey, controller.collectChatHistory.bind(controller))

/**
 * @route POST /api/external/history/search
 * @description Collect Search History from external client.
 * @access Private (API Key required)
 */
// Protected by API key check to ensure source validity
router.post('/search', requireTraceApiKey, controller.collectSearchHistory.bind(controller))

export default router
