/**
 * @fileoverview Feedback module barrel exports.
 * @description Public API surface for the feedback module. External modules should
 *   import only from this file, never from internal paths.
 * @module modules/feedback
 */

/** @description Feedback route definitions */
export { default as feedbackRoutes } from './routes/feedback.routes.js'

/** @description Feedback service singleton */
export { feedbackService } from './services/feedback.service.js'

/** @description Feedback Zod schemas */
export {
  createFeedbackSchema,
  searchFeedbackSchema,
  listFeedbackQuerySchema,
  feedbackStatsQuerySchema,
} from './schemas/feedback.schemas.js'
