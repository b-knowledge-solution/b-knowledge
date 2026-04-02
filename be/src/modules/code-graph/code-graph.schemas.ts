/**
 * @fileoverview Zod validation schemas for code-graph API endpoints.
 * @description Validates request parameters and body for graph queries.
 * @module code-graph/code-graph.schemas
 */

import { z } from 'zod'

/**
 * @description Validates kbId route parameter.
 */
export const kbIdParamSchema = z.object({
  kbId: z.string().min(1, 'Knowledge base ID is required'),
})

/**
 * @description Validates name query parameter for callers/callees/snippets.
 */
export const nameQuerySchema = z.object({
  name: z.string().min(1, 'Function or class name is required'),
})

/**
 * @description Validates raw Cypher execution request body.
 */
export const cypherBodySchema = z.object({
  cypher: z.string().min(1, 'Cypher query is required'),
  params: z.record(z.unknown()).optional(),
})

/**
 * @description Validates graph data query (optional limit).
 */
export const graphDataQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(5000).optional().default(500),
})

/**
 * @description Validates NL query request body for AI-powered Cypher generation.
 */
export const nlQueryBodySchema = z.object({
  question: z.string().min(1, 'Question is required').max(2000),
  providerId: z.string().optional(),
})

/**
 * @description Validates search query for code search endpoint.
 */
export const searchQuerySchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
})

/**
 * @description Validates optional name filter for dependency analysis.
 */
export const dependencyQuerySchema = z.object({
  name: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
})
