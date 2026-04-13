/**
 * @fileoverview Express routes for the code knowledge graph API.
 * @description RESTful endpoints for querying code graphs stored in Memgraph.
 * Requires authentication on all routes. Cypher execution requires admin role.
 * @module code-graph/code-graph.routes
 */

import { Router } from 'express'
import { CodeGraphController } from './code-graph.controller.js'
import { requireAuth, requirePermission } from '@/shared/middleware/auth.middleware.js'
import { validate } from '@/shared/middleware/validate.middleware.js'
import {
  kbIdParamSchema,
  nameQuerySchema,
  cypherBodySchema,
  graphDataQuerySchema,
  nlQueryBodySchema,
  searchQuerySchema,
  dependencyQuerySchema,
} from './code-graph.schemas.js'

const router = Router()
const controller = new CodeGraphController()

/**
 * @route GET /api/code-graph/:kbId/stats
 * @description Get node and relationship counts for a knowledge base's code graph.
 * @access Private
 */
router.get(
  '/:kbId/stats',
  requireAuth,
  validate({ params: kbIdParamSchema }),
  controller.getStats.bind(controller),
)

/**
 * @route GET /api/code-graph/:kbId/callers
 * @description Find all callers of a function/method by name.
 * @access Private
 */
router.get(
  '/:kbId/callers',
  requireAuth,
  validate({ params: kbIdParamSchema, query: nameQuerySchema }),
  controller.getCallers.bind(controller),
)

/**
 * @route GET /api/code-graph/:kbId/callees
 * @description Find all functions/methods called by a given function.
 * @access Private
 */
router.get(
  '/:kbId/callees',
  requireAuth,
  validate({ params: kbIdParamSchema, query: nameQuerySchema }),
  controller.getCallees.bind(controller),
)

/**
 * @route GET /api/code-graph/:kbId/snippet
 * @description Get source code snippet for a function/method.
 * @access Private
 */
router.get(
  '/:kbId/snippet',
  requireAuth,
  validate({ params: kbIdParamSchema, query: nameQuerySchema }),
  controller.getSnippet.bind(controller),
)

/**
 * @route GET /api/code-graph/:kbId/hierarchy
 * @description Get class inheritance hierarchy for a class name.
 * @access Private
 */
router.get(
  '/:kbId/hierarchy',
  requireAuth,
  validate({ params: kbIdParamSchema, query: nameQuerySchema }),
  controller.getHierarchy.bind(controller),
)

/**
 * @route GET /api/code-graph/:kbId/graph
 * @description Get full graph data for visualization (nodes + links).
 * @access Private
 */
router.get(
  '/:kbId/graph',
  requireAuth,
  validate({ params: kbIdParamSchema, query: graphDataQuerySchema }),
  controller.getGraphData.bind(controller),
)

/**
 * @route GET /api/code-graph/:kbId/schema
 * @description Get graph schema (node labels + relationship types) for a KB.
 * @access Private
 */
router.get(
  '/:kbId/schema',
  requireAuth,
  validate({ params: kbIdParamSchema }),
  controller.getSchema.bind(controller),
)

/**
 * @route GET /api/code-graph/:kbId/search
 * @description Search for code entities by name pattern (case-insensitive).
 * @access Private
 */
router.get(
  '/:kbId/search',
  requireAuth,
  validate({ params: kbIdParamSchema, query: searchQuerySchema }),
  controller.searchCode.bind(controller),
)

/**
 * @route GET /api/code-graph/:kbId/dependencies
 * @description Get import/dependency relationships. Optionally filter by name.
 * @access Private
 */
router.get(
  '/:kbId/dependencies',
  requireAuth,
  validate({ params: kbIdParamSchema, query: dependencyQuerySchema }),
  controller.getDependencies.bind(controller),
)

/**
 * @route POST /api/code-graph/:kbId/nl-query
 * @description Natural language query — AI generates Cypher from the question.
 * @access Private
 */
router.post(
  '/:kbId/nl-query',
  // NL query is semantically read-only — composes a Cypher read query from natural language
  requirePermission('code_graph.view'),
  validate({ params: kbIdParamSchema, body: nlQueryBodySchema }),
  controller.nlQuery.bind(controller),
)

/**
 * @route POST /api/code-graph/:kbId/cypher
 * @description Execute a raw Cypher query against the code graph (admin only).
 * @access Admin
 */
router.post(
  '/:kbId/cypher',
  // Raw Cypher execution — maintenance-level operation gated on the manage permission
  requirePermission('code_graph.manage'),
  validate({ params: kbIdParamSchema, body: cypherBodySchema }),
  controller.executeCypher.bind(controller),
)

export default router
