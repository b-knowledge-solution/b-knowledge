/**
 * @fileoverview Raw HTTP API calls for the agent feature.
 * Provides typed functions for agent CRUD, versioning, templates, and runs.
 * No React hooks here — those live in agentQueries.ts.
 *
 * @module features/agents/api/agentApi
 */

import { api } from '@/lib/api'
import type {
  Agent,
  AgentTemplate,
  AgentRun,
  CreateAgentDto,
  UpdateAgentDto,
} from '../types/agent.types'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Paginated API response wrapper for agent list endpoints
 */
interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  page_size: number
}

/**
 * @description Query parameters for filtering the agent list
 */
interface ListAgentsParams {
  mode?: 'agent' | 'pipeline'
  status?: 'draft' | 'published'
  project_id?: string
  page?: number
  page_size?: number
  search?: string
}

// ============================================================================
// Agent API
// ============================================================================

/**
 * @description Raw HTTP API calls for agent management including CRUD, versioning, templates, and runs
 */
export const agentApi = {
  /**
   * @description List agents with optional filtering by mode, status, project, and search term
   * @param {ListAgentsParams} [params] - Optional filter and pagination parameters
   * @returns {Promise<PaginatedResponse<Agent>>} Paginated list of agents
   */
  list: (params?: ListAgentsParams) => {
    // Build query string from optional filter parameters
    const qs = new URLSearchParams()
    if (params?.mode) qs.set('mode', params.mode)
    if (params?.status) qs.set('status', params.status)
    if (params?.project_id) qs.set('project_id', params.project_id)
    if (params?.page) qs.set('page', String(params.page))
    if (params?.page_size) qs.set('page_size', String(params.page_size))
    if (params?.search) qs.set('search', params.search)
    const query = qs.toString()
    return api.get<PaginatedResponse<Agent>>(`/api/agents${query ? '?' + query : ''}`)
  },

  /**
   * @description Fetch a single agent by its UUID
   * @param {string} id - Agent UUID
   * @returns {Promise<Agent>} Agent record
   */
  getById: (id: string) =>
    api.get<Agent>(`/api/agents/${id}`),

  /**
   * @description Create a new agent with name, mode, and optional template/project association
   * @param {CreateAgentDto} data - Agent creation payload
   * @returns {Promise<Agent>} Created agent record
   */
  create: (data: CreateAgentDto) =>
    api.post<Agent>('/api/agents', data),

  /**
   * @description Update an existing agent's name, description, DSL, or status
   * @param {string} id - Agent UUID
   * @param {UpdateAgentDto} data - Fields to update
   * @returns {Promise<Agent>} Updated agent record
   */
  update: (id: string, data: UpdateAgentDto) =>
    api.put<Agent>(`/api/agents/${id}`, data),

  /**
   * @description Permanently delete an agent and all its run history
   * @param {string} id - Agent UUID
   * @returns {Promise<void>}
   */
  delete: (id: string) =>
    api.delete(`/api/agents/${id}`),

  /**
   * @description Create a duplicate copy of an agent with a new UUID
   * @param {string} id - Source agent UUID to duplicate
   * @returns {Promise<Agent>} Newly created duplicate agent
   */
  duplicate: (id: string) =>
    api.post<Agent>(`/api/agents/${id}/duplicate`),

  /**
   * @description Export an agent's full definition as JSON for backup or sharing
   * @param {string} id - Agent UUID
   * @returns {Promise<Agent>} Complete agent record for export
   */
  exportJson: (id: string) =>
    api.get<Agent>(`/api/agents/${id}/export`),

  // --------------------------------------------------------------------------
  // Versioning
  // --------------------------------------------------------------------------

  /**
   * @description Save the current agent state as a new version snapshot
   * @param {string} id - Agent UUID
   * @param {object} [data] - Optional version label
   * @returns {Promise<{ version_number: number }>} Created version number
   */
  saveVersion: (id: string, data?: { version_label?: string }) =>
    api.post<{ version_number: number }>(`/api/agents/${id}/versions`, data),

  /**
   * @description List all saved version snapshots for an agent
   * @param {string} id - Agent UUID
   * @returns {Promise<Agent[]>} Array of version records
   */
  listVersions: (id: string) =>
    api.get<Agent[]>(`/api/agents/${id}/versions`),

  /**
   * @description Restore an agent to a previously saved version
   * @param {string} id - Agent UUID
   * @param {string} versionId - Version UUID to restore
   * @returns {Promise<Agent>} Restored agent record
   */
  restoreVersion: (id: string, versionId: string) =>
    api.post<Agent>(`/api/agents/${id}/versions/${versionId}/restore`),

  /**
   * @description Delete a specific version snapshot
   * @param {string} id - Agent UUID
   * @param {string} versionId - Version UUID to delete
   * @returns {Promise<void>}
   */
  deleteVersion: (id: string, versionId: string) =>
    api.delete(`/api/agents/${id}/versions/${versionId}`),

  // --------------------------------------------------------------------------
  // Templates
  // --------------------------------------------------------------------------

  /**
   * @description List all available agent templates (system and tenant-level)
   * @returns {Promise<AgentTemplate[]>} Array of template records
   */
  listTemplates: () =>
    api.get<AgentTemplate[]>('/api/agents/templates'),

  // --------------------------------------------------------------------------
  // Runs
  // --------------------------------------------------------------------------

  /**
   * @description List execution run records for a specific agent
   * @param {string} agentId - Agent UUID
   * @returns {Promise<AgentRun[]>} Array of run records
   */
  listRuns: (agentId: string) =>
    api.get<AgentRun[]>(`/api/agents/${agentId}/runs`),

  // --------------------------------------------------------------------------
  // Feedback
  // --------------------------------------------------------------------------

  /**
   * @description Submit thumbs up/down feedback on an agent run result.
   * Posts to the shared feedback endpoint with source='agent'.
   * @param {string} runId - Agent run UUID
   * @param {{ thumbup: boolean; comment?: string; query: string; answer: string }} data - Feedback payload
   * @returns {Promise<void>}
   */
  submitRunFeedback: async (
    runId: string,
    data: { thumbup: boolean; comment?: string; query: string; answer: string },
  ): Promise<void> => {
    await api.post('/api/feedback', {
      source: 'agent',
      source_id: runId,
      thumbup: data.thumbup,
      ...(data.comment ? { comment: data.comment } : {}),
      query: data.query,
      answer: data.answer,
    })
  },
}
