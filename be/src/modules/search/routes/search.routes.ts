
/**
 * @fileoverview Search routes.
 * Defines endpoints for search app CRUD and search query execution.
 *
 * @module routes/search
 */
import { Router } from 'express'
import { SearchController } from '../controllers/search.controller.js'
import { requireAuth, requirePermission, requireAbility, checkSession } from '@/shared/middleware/auth.middleware.js'
import { validate } from '@/shared/middleware/validate.middleware.js'
import {
  createSearchAppSchema,
  updateSearchAppSchema,
  executeSearchSchema,
  searchAppIdParamSchema,
  askSearchSchema,
  relatedQuestionsSchema,
  mindmapSchema,
  searchAppAccessSchema,
  listSearchAppsSchema,
  retrievalTestSchema,
} from '../schemas/search.schemas.js'
import { searchFeedbackSchema } from '@/modules/feedback/schemas/feedback.schemas.js'

const router = Router()
const controller = new SearchController()

/**
 * @route POST /api/search/apps
 * @description Create a new search app.
 * @access Admin only (manage_users permission)
 */
router.post(
  '/apps',
  requireAuth,
  requirePermission('manage_users'),
  validate(createSearchAppSchema),
  controller.createSearchApp.bind(controller)
)

/**
 * @route GET /api/search/apps
 * @description List all search apps with optional pagination, search, and sorting.
 * @access Private
 */
router.get(
  '/apps',
  checkSession,
  validate({ query: listSearchAppsSchema }),
  controller.listSearchApps.bind(controller)
)

/**
 * @route GET /api/search/apps/:id
 * @description Get a search app by ID.
 * @access Private
 */
router.get(
  '/apps/:id',
  checkSession,
  validate({ params: searchAppIdParamSchema }),
  controller.getSearchApp.bind(controller)
)

/**
 * @route PUT /api/search/apps/:id
 * @description Update an existing search app.
 * @access Admin only (manage_users permission)
 */
router.put(
  '/apps/:id',
  requireAuth,
  requirePermission('manage_users'),
  validate({ body: updateSearchAppSchema, params: searchAppIdParamSchema }),
  controller.updateSearchApp.bind(controller)
)

/**
 * @route DELETE /api/search/apps/:id
 * @description Delete a search app.
 * @access Admin only (manage_users permission)
 */
router.delete(
  '/apps/:id',
  requireAuth,
  requirePermission('manage_users'),
  validate({ params: searchAppIdParamSchema }),
  controller.deleteSearchApp.bind(controller)
)

/**
 * @route GET /api/search/apps/:id/access
 * @description Get access control entries for a search app.
 * @access Admin only (manage_users permission)
 */
router.get(
  '/apps/:id/access',
  requireAuth,
  requirePermission('manage_users'),
  validate({ params: searchAppIdParamSchema }),
  controller.getAppAccess.bind(controller)
)

/**
 * @route PUT /api/search/apps/:id/access
 * @description Set (replace) access control entries for a search app.
 * @access Admin only (manage_users permission)
 */
router.put(
  '/apps/:id/access',
  requireAuth,
  requirePermission('manage_users'),
  validate({ body: searchAppAccessSchema, params: searchAppIdParamSchema }),
  controller.setAppAccess.bind(controller)
)

/**
 * @route POST /api/search/apps/:id/retrieval-test
 * @description Dry-run retrieval test without LLM summary for testing search quality.
 * @access Private
 */
router.post(
  '/apps/:id/retrieval-test',
  requireAuth,
  validate({ body: retrievalTestSchema, params: searchAppIdParamSchema }),
  // Row-scoped read gate: a user may only retrieval-test search apps they can view
  requireAbility('read', 'SearchApp', 'id'),
  controller.retrievalTest.bind(controller)
)

/**
 * @route POST /api/search/apps/:id/feedback
 * @description Submit thumbs up/down feedback on a search answer.
 * @access Private
 */
router.post(
  '/apps/:id/feedback',
  requireAuth,
  validate({ body: searchFeedbackSchema, params: searchAppIdParamSchema }),
  // Row-scoped read gate: feedback requires the user can view this search app
  requireAbility('read', 'SearchApp', 'id'),
  controller.sendFeedback.bind(controller)
)

/**
 * @route POST /api/search/apps/:id/search
 * @description Execute a search query against a search app.
 * @access Private
 */
router.post(
  '/apps/:id/search',
  requireAuth,
  validate({ body: executeSearchSchema, params: searchAppIdParamSchema }),
  // Row-scoped read gate: search execution requires view access to the app
  requireAbility('read', 'SearchApp', 'id'),
  controller.executeSearch.bind(controller)
)

/**
 * @route POST /api/search/apps/:id/ask
 * @description Stream an AI-generated summary answer for a search query (SSE).
 * @access Private
 */
router.post(
  '/apps/:id/ask',
  requireAuth,
  validate({ body: askSearchSchema, params: searchAppIdParamSchema }),
  // Row-scoped read gate: AI answer streaming requires view access to the app
  requireAbility('read', 'SearchApp', 'id'),
  controller.askSearch.bind(controller)
)

/**
 * @route POST /api/search/apps/:id/related-questions
 * @description Generate related questions from a user query.
 * @access Private
 */
router.post(
  '/apps/:id/related-questions',
  requireAuth,
  validate({ body: relatedQuestionsSchema, params: searchAppIdParamSchema }),
  // Row-scoped read gate: related-questions generation requires view access to the app
  requireAbility('read', 'SearchApp', 'id'),
  controller.relatedQuestions.bind(controller)
)

/**
 * @route POST /api/search/apps/:id/mindmap
 * @description Generate a mind map JSON tree from search results.
 * @access Private
 */
router.post(
  '/apps/:id/mindmap',
  requireAuth,
  validate({ body: mindmapSchema, params: searchAppIdParamSchema }),
  // Row-scoped read gate: mindmap generation requires view access to the app
  requireAbility('read', 'SearchApp', 'id'),
  controller.mindmap.bind(controller)
)

export default router
