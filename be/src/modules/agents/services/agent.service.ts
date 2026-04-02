/**
 * @fileoverview Agent service — CRUD, versioning, duplication, and export for agents.
 *
 * Implements the version-as-row pattern: each saved version creates a new row
 * with parent_id pointing to the original agent and an incrementing version_number.
 *
 * @module modules/agents/services/agent
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { db } from '@/shared/db/knex.js'
import { log } from '@/shared/services/logger.service.js'
import { AgentStatus } from '@/shared/constants/index.js'
import type { Agent } from '../models/agent.model.js'
import type { CreateAgentDto, UpdateAgentDto, ListAgentsQuery } from '../schemas/agent.schemas.js'

/**
 * @description Singleton service providing agent CRUD operations, version-as-row
 *   versioning, duplication, and JSON export. All queries are tenant-scoped.
 */
class AgentService {
  /**
   * @description List root agents (parent_id IS NULL) for a tenant with optional filters.
   *   Supports pagination, mode/status filtering, knowledge base association, and name search.
   * @param {string} tenantId - Tenant/organization identifier for multi-tenant isolation
   * @param {ListAgentsQuery} filters - Pagination and filter parameters
   * @returns {Promise<{ data: Agent[]; total: number; page: number; page_size: number }>} Paginated agent list
   */
  async list(tenantId: string, filters: ListAgentsQuery): Promise<{
    data: Agent[]
    total: number
    page: number
    page_size: number
  }> {
    const { page, page_size, mode, status, knowledge_base_id, search } = filters

    // Base query: root agents only (not version rows), scoped to tenant
    let query = ModelFactory.agent.getKnex()
      .where('tenant_id', tenantId)
      .whereNull('parent_id')

    // Apply optional mode filter (agent vs pipeline)
    if (mode) query = query.andWhere('mode', mode)

    // Apply optional status filter (draft vs published)
    if (status) query = query.andWhere('status', status)

    // Apply optional knowledge base association filter
    if (knowledge_base_id) query = query.andWhere('knowledge_base_id', knowledge_base_id)

    // Apply optional name/description search (case-insensitive ILIKE)
    if (search) {
      query = query.andWhere(function () {
        this.where('name', 'ilike', `%${search}%`)
          .orWhere('description', 'ilike', `%${search}%`)
      })
    }

    // Run count and paginated data queries in parallel for efficiency
    const [countResult, data] = await Promise.all([
      query.clone().count('* as cnt').first(),
      query.clone()
        .select('*')
        .orderBy('updated_at', 'desc')
        .limit(page_size)
        .offset((page - 1) * page_size),
    ])

    const total = Number((countResult as any)?.cnt ?? 0)

    return { data, total, page, page_size }
  }

  /**
   * @description Fetch a single agent by ID with tenant guard.
   * @param {string} id - Agent UUID
   * @param {string} tenantId - Tenant/organization identifier
   * @returns {Promise<Agent>} The agent record
   * @throws {Error} 404 if agent not found or belongs to a different tenant
   */
  async getById(id: string, tenantId: string): Promise<Agent> {
    const agent = await ModelFactory.agent.findById(id)

    // Guard: agent must exist and belong to the requesting tenant
    if (!agent || agent.tenant_id !== tenantId) {
      const error = new Error('Agent not found')
      ;(error as any).statusCode = 404
      throw error
    }

    return agent
  }

  /**
   * @description Create a new agent. If template_id is provided, copy DSL from the template.
   * @param {CreateAgentDto} data - Agent creation data (name, description, mode, knowledge_base_id, template_id)
   * @param {string} tenantId - Tenant/organization identifier
   * @param {string} userId - UUID of the creating user
   * @returns {Promise<Agent>} The created agent record
   * @throws {Error} If template_id is provided but template not found
   */
  async create(data: CreateAgentDto, tenantId: string, userId: string): Promise<Agent> {
    let dsl: Record<string, unknown> = {}

    // Copy DSL from template if specified
    if (data.template_id) {
      const template = await ModelFactory.agentTemplate.findById(data.template_id)
      if (template) {
        dsl = template.dsl ?? {}
      } else {
        log.warn('Agent template not found, creating with empty DSL', { templateId: data.template_id })
      }
    }

    const agent = await ModelFactory.agent.create({
      name: data.name,
      description: data.description ?? null,
      mode: data.mode,
      status: AgentStatus.DRAFT,
      dsl,
      dsl_version: 1,
      tenant_id: tenantId,
      knowledge_base_id: data.knowledge_base_id ?? null,
      parent_id: null,
      version_number: 0,
      version_label: null,
      created_by: userId,
    })

    log.info('Agent created', { agentId: agent.id, tenantId, userId })
    return agent
  }

  /**
   * @description Update an agent's fields. DSL updates are only allowed on draft agents.
   * @param {string} id - Agent UUID
   * @param {UpdateAgentDto} data - Partial update data
   * @param {string} tenantId - Tenant/organization identifier
   * @returns {Promise<Agent>} The updated agent record
   * @throws {Error} 404 if not found, 409 if trying to update DSL on a published agent
   */
  async update(id: string, data: UpdateAgentDto, tenantId: string): Promise<Agent> {
    const existing = await this.getById(id, tenantId)

    // Guard: published agents have immutable DSL — must revert to draft first
    if (data.dsl && existing.status === AgentStatus.PUBLISHED) {
      const error = new Error('Cannot update DSL on a published agent. Revert to draft first.')
      ;(error as any).statusCode = 409
      throw error
    }

    // Build update payload with only provided fields
    const updateData: Record<string, unknown> = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.status !== undefined) updateData.status = data.status
    if (data.dsl !== undefined) updateData.dsl = data.dsl

    const updated = await ModelFactory.agent.update(id, updateData)

    log.info('Agent updated', { agentId: id, tenantId, fields: Object.keys(updateData) })
    return updated!
  }

  /**
   * @description Delete an agent and all its version rows (CASCADE handles runs/steps).
   * @param {string} id - Agent UUID
   * @param {string} tenantId - Tenant/organization identifier
   * @returns {Promise<void>}
   * @throws {Error} 404 if agent not found or belongs to different tenant
   */
  async delete(id: string, tenantId: string): Promise<void> {
    // Verify ownership before deleting
    await this.getById(id, tenantId)

    // Delete all version rows first (children with parent_id = id)
    await ModelFactory.agent.getKnex()
      .where('parent_id', id)
      .delete()

    // Delete the parent agent itself
    await ModelFactory.agent.delete(id)

    log.info('Agent deleted', { agentId: id, tenantId })
  }

  /**
   * @description Clone an agent with name "{name} (copy)", reset to draft status.
   * @param {string} id - Agent UUID to duplicate
   * @param {string} tenantId - Tenant/organization identifier
   * @param {string} userId - UUID of the user performing the duplication
   * @returns {Promise<Agent>} The newly created clone agent
   * @throws {Error} 404 if source agent not found
   */
  async duplicate(id: string, tenantId: string, userId: string): Promise<Agent> {
    const source = await this.getById(id, tenantId)

    const clone = await ModelFactory.agent.create({
      name: `${source.name} (copy)`,
      description: source.description,
      mode: source.mode,
      status: AgentStatus.DRAFT,
      dsl: typeof source.dsl === 'string' ? JSON.parse(source.dsl) : source.dsl,
      dsl_version: source.dsl_version,
      tenant_id: tenantId,
      knowledge_base_id: source.knowledge_base_id,
      parent_id: null,
      version_number: 0,
      version_label: null,
      created_by: userId,
    })

    log.info('Agent duplicated', { sourceId: id, cloneId: clone.id, tenantId })
    return clone
  }

  /**
   * @description Save a version snapshot of the agent's current DSL as a new row.
   *   Version-as-row: creates a child row with parent_id = agent id and
   *   version_number = max existing + 1.
   * @param {string} id - Parent agent UUID
   * @param {string} tenantId - Tenant/organization identifier
   * @param {string} userId - UUID of the user saving the version
   * @param {string} [label] - Optional human-readable version label
   * @param {string} [changeSummary] - Optional description of what changed
   * @returns {Promise<Agent>} The created version row
   * @throws {Error} 404 if parent agent not found
   */
  async saveVersion(
    id: string,
    tenantId: string,
    userId: string,
    label?: string,
    changeSummary?: string,
  ): Promise<Agent> {
    const parent = await this.getById(id, tenantId)

    // Determine next version number by finding the max existing version
    const maxResult = await ModelFactory.agent.getKnex()
      .where('parent_id', id)
      .max('version_number as max_version')
      .first()

    const nextVersion = ((maxResult as any)?.max_version ?? 0) + 1

    // Auto-generate change_summary if not provided
    const summary = changeSummary || `Version ${nextVersion} saved by user`

    const version = await ModelFactory.agent.create({
      name: parent.name,
      description: summary,
      mode: parent.mode,
      status: parent.status,
      dsl: typeof parent.dsl === 'string' ? JSON.parse(parent.dsl) : parent.dsl,
      dsl_version: parent.dsl_version,
      tenant_id: tenantId,
      knowledge_base_id: parent.knowledge_base_id,
      parent_id: id,
      version_number: nextVersion,
      version_label: label ?? null,
      created_by: userId,
    })

    log.info('Agent version saved', { agentId: id, versionId: version.id, versionNumber: nextVersion })
    return version
  }

  /**
   * @description List all versions of an agent ordered by version_number descending.
   * @param {string} id - Parent agent UUID
   * @param {string} tenantId - Tenant/organization identifier
   * @returns {Promise<Agent[]>} Array of version rows, newest first
   * @throws {Error} 404 if parent agent not found
   */
  async listVersions(id: string, tenantId: string): Promise<Agent[]> {
    // Verify parent agent exists and belongs to tenant
    await this.getById(id, tenantId)

    // Retrieve all child version rows ordered by version_number DESC
    return ModelFactory.agent.getKnex()
      .where('parent_id', id)
      .orderBy('version_number', 'desc')
  }

  /**
   * @description Restore a version's DSL back to the parent agent, marking it as draft.
   * @param {string} id - Parent agent UUID
   * @param {string} versionId - Version row UUID to restore from
   * @param {string} tenantId - Tenant/organization identifier
   * @returns {Promise<Agent>} The updated parent agent with restored DSL
   * @throws {Error} 404 if parent or version not found, 400 if version doesn't belong to parent
   */
  async restoreVersion(id: string, versionId: string, tenantId: string): Promise<Agent> {
    // Verify parent agent exists
    await this.getById(id, tenantId)

    const version = await ModelFactory.agent.findById(versionId)

    // Guard: version must exist and be a child of the specified parent
    if (!version || version.parent_id !== id) {
      const error = new Error('Version not found for this agent')
      ;(error as any).statusCode = 404
      throw error
    }

    // Copy the version's DSL back to the parent and reset to draft
    const updated = await ModelFactory.agent.update(id, {
      dsl: typeof version.dsl === 'string' ? JSON.parse(version.dsl) : version.dsl,
      dsl_version: version.dsl_version,
      status: AgentStatus.DRAFT,
    })

    log.info('Agent version restored', { agentId: id, versionId, versionNumber: version.version_number })
    return updated!
  }

  /**
   * @description Delete a specific version row. Prevents deleting the parent agent.
   * @param {string} versionId - Version row UUID to delete
   * @param {string} tenantId - Tenant/organization identifier
   * @returns {Promise<void>}
   * @throws {Error} 404 if version not found, 400 if trying to delete a parent row
   */
  async deleteVersion(versionId: string, tenantId: string): Promise<void> {
    const version = await ModelFactory.agent.findById(versionId)

    // Guard: version must exist and belong to the requesting tenant
    if (!version || version.tenant_id !== tenantId) {
      const error = new Error('Version not found')
      ;(error as any).statusCode = 404
      throw error
    }

    // Guard: cannot delete a parent agent via the version endpoint
    if (!version.parent_id) {
      const error = new Error('Cannot delete a parent agent via version endpoint')
      ;(error as any).statusCode = 400
      throw error
    }

    await ModelFactory.agent.delete(versionId)

    log.info('Agent version deleted', { versionId, parentId: version.parent_id })
  }

  /**
   * @description Export agent with DSL for JSON download.
   * @param {string} id - Agent UUID
   * @param {string} tenantId - Tenant/organization identifier
   * @returns {Promise<Agent>} The full agent record including DSL
   * @throws {Error} 404 if agent not found
   */
  async exportJson(id: string, tenantId: string): Promise<Agent> {
    return this.getById(id, tenantId)
  }

  // -------------------------------------------------------------------------
  // Canvas Version Release (upstream port)
  // -------------------------------------------------------------------------

  /**
   * @description Marks a canvas version as released (published).
   * Only one version can be released at a time per canvas -- existing release flags
   * are cleared before setting the new one.
   * Upstream port: canvas_service release version workflow.
   * @param {string} canvasId - Canvas/agent ID
   * @param {string} versionId - Version ID to release
   * @param {string} tenantId - Tenant ID for access control
   * @returns {Promise<void>}
   */
  async releaseVersion(canvasId: string, versionId: string, tenantId: string): Promise<void> {
    // Clear any existing release flag for this canvas (only one active release)
    await db('user_canvas_version')
      .where('canvas_id', canvasId)
      .where('tenant_id', tenantId)
      .update({ release: false })

    // Set the release flag on the specified version
    await db('user_canvas_version')
      .where('id', versionId)
      .where('canvas_id', canvasId)
      .where('tenant_id', tenantId)
      .update({ release: true })

    log.info('Canvas version released', { canvasId, versionId, tenantId })
  }

  /**
   * @description Gets the currently released version of a canvas.
   * Returns the version row with release=true, or null if none released.
   * Upstream port: canvas_service get_released_version concept.
   * @param {string} canvasId - Canvas/agent ID
   * @param {string} tenantId - Tenant ID for access control
   * @returns {Promise<Record<string, unknown> | null>} Released version row or null
   */
  async getReleasedVersion(canvasId: string, tenantId: string): Promise<Record<string, unknown> | null> {
    // Query for the version with release=true, ordered by creation time desc
    const version = await db('user_canvas_version')
      .where('canvas_id', canvasId)
      .where('tenant_id', tenantId)
      .where('release', true)
      .orderBy('create_time', 'desc')
      .first()
    return version || null
  }
}

/** @description Singleton agent service instance */
export const agentService = new AgentService()
