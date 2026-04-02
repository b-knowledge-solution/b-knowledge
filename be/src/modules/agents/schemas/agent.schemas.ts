/**
 * @fileoverview Zod validation schemas for the Agents module.
 *
 * Each schema validates request params, body, or query for a specific agent endpoint.
 * Used with the `validate()` middleware to enforce input constraints.
 *
 * @module modules/agents/schemas/agent
 */
import { z } from 'zod'
import { hexId } from '@/shared/utils/uuid.js'

/** @description POST /api/agents — body schema for agent creation */
export const createAgentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  mode: z.enum(['agent', 'pipeline']).default('agent'),
  knowledge_base_id: hexId.optional(),
  template_id: hexId.optional(),
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
  id: hexId,
})

/** @description UUID path parameter schema — validates :id and :versionId params */
export const versionIdParamSchema = z.object({
  id: hexId,
  versionId: hexId,
})

/** @description GET /api/agents — query schema for paginated agent listing with filters */
export const listAgentsQuerySchema = z.object({
  mode: z.enum(['agent', 'pipeline']).optional(),
  status: z.enum(['draft', 'published']).optional(),
  knowledge_base_id: hexId.optional(),
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(255).optional(),
})

/** @description POST /api/agents/:id/run — body schema for triggering an agent run */
export const agentRunBodySchema = z.object({
  input: z.string().min(1).max(50000),
})

/** @description UUID path parameter schema — validates :id and :runId params */
export const agentRunIdParamSchema = z.object({
  id: hexId,
  runId: hexId,
})

/** @description POST /api/agents/tools/credentials — body schema for creating a tool credential */
export const createCredentialSchema = z.object({
  tool_type: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  credentials: z.record(z.string()),
  agent_id: hexId.optional(),
})

/** @description PUT /api/agents/tools/credentials/:id — body schema for updating a tool credential */
export const updateCredentialSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  credentials: z.record(z.string()).optional(),
})

/** @description Inferred types for service layer consumption */
export type CreateAgentDto = z.infer<typeof createAgentSchema>
export type UpdateAgentDto = z.infer<typeof updateAgentSchema>
export type SaveVersionDto = z.infer<typeof saveVersionSchema>
export type ListAgentsQuery = z.infer<typeof listAgentsQuerySchema>
