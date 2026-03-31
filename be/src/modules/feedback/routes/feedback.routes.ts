/**
 * @fileoverview Feedback routes.
 * @description Defines endpoints for creating answer feedback.
 *   Mounted under /api/feedback by the central route registration.
 * @module routes/feedback
 */
import { Router } from 'express'
import { FeedbackController } from '../controllers/feedback.controller.js'
import { requireAuth } from '@/shared/middleware/auth.middleware.js'
import { validate } from '@/shared/middleware/validate.middleware.js'
import { createFeedbackSchema } from '../schemas/feedback.schemas.js'

const router = Router()
const controller = new FeedbackController()

/**
 * @route POST /api/feedback
 * @description Create a new answer feedback record (chat or search).
 * @access Private
 */
router.post(
  '/',
  requireAuth,
  validate(createFeedbackSchema),
  controller.create.bind(controller)
)

export default router
