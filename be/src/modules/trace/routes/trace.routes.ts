/**
 * @fileoverview Trace routes for LLM execution traces and feedback.
 *
 * Provides endpoints for external systems to submit Langfuse-compatible
 * trace data and user feedback.
 *
 * @module modules/trace/routes/trace
 */
import { Router } from 'express'
import { TraceController } from '@/modules/trace/controllers/trace.controller.js'

const router = Router()
const controller = new TraceController()

/**
 * @route POST /api/external/trace/submit
 * @description Accept trace payloads from external systems.
 * @access Public (Protected by downstream validation)
 */
// Ingestion endpoint for trace data
router.post('/submit', controller.submitTrace.bind(controller))

/**
 * @route POST /api/external/trace/feedback
 * @description Accept user feedback tied to existing traces.
 * @access Public (Protected by downstream validation)
 */
// Ingestion endpoint for trace feedback scores
router.post('/feedback', controller.submitFeedback.bind(controller))

export default router
