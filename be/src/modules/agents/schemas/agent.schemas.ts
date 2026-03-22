/**
 * @fileoverview Zod validation schemas for the Agents module.
 *
 * Each schema validates request params, body, or query for a specific agent endpoint.
 * Used with the `validate()` middleware to enforce input constraints.
 *
 * @module modules/agents/schemas/agent
 */
import { z } from 'zod'

/** @description POST /api/agents — body schema for agent creation */
export const createAgentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  mode: z.enum(['agent', 'pipeline']).default('agent'),
  project_id: z.string().uuid().optional(),
  template_id: z.string().uuid().optional(),
})

/** @description PUT /api/agents/:id — body schema for agent update (all fields optional) */
export const updateAgentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(['draft', 'published']).optional(),
  dsl: z.record(z.unknown()).optional(),
})

/** @description POST /api/agents/:id/versions — body schema for saving a version snapshot */
export const saveVersionSchema = z.object({
  version_label: z.string().max(128).optional(),
  change_summary: z.string().max(1000).optional(),
})

/** @description UUID path parameter schema — validates :id param */
export const agentIdParamSchema = z.object({
  id: z.string().uuid(),
})

/** @description UUID path parameter schema — validates :id and :versionId params */
export const versionIdParamSchema = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
})

/** @description GET /api/agents — query schema for paginated agent listing with filters */
export const listAgentsQuerySchema = z.object({
  mode: z.enum(['agent', 'pipeline']).optional(),
  status: z.enum(['draft', 'published']).optional(),
  project_id: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(255).optional(),
})

/** @description Inferred types for service layer consumption */
export type CreateAgentDto = z.infer<typeof createAgentSchema>
export type UpdateAgentDto = z.infer<typeof updateAgentSchema>
export type SaveVersionDto = z.infer<typeof saveVersionSchema>
export type ListAgentsQuery = z.infer<typeof listAgentsQuerySchema>
