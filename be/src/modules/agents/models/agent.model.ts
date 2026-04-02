/**
 * @fileoverview Agent model — CRUD for the agents table.
 * @module modules/agents/models/agent
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'

/**
 * @description Agent interface representing a record in the 'agents' table.
 *   Agents define AI workflow graphs via JSONB DSL with versioning and ABAC support.
 */
export interface Agent {
  /** Unique UUID for the agent */
  id: string
  /** Human-readable agent name */
  name: string
  /** Optional long description of agent purpose */
  description: string | null
  /** Avatar URL or data URI */
  avatar: string | null
  /** Execution mode: 'agent' for LLM-driven, 'pipeline' for deterministic DAG */
  mode: 'agent' | 'pipeline'
  /** Lifecycle status: draft agents are not executable */
  status: 'draft' | 'published'
  /** JSONB workflow graph definition (nodes, edges, parameters) */
  dsl: Record<string, unknown>
  /** DSL schema version for forward compatibility */
  dsl_version: number
  /** ABAC policy rules matching dataset pattern */
  policy_rules: Record<string, unknown> | null
  /** Multi-tenant isolation identifier */
  tenant_id: string
  /** Optional knowledge base association UUID */
  knowledge_base_id: string | null
  /** Version-as-row: parent_id points to the original agent (null = parent) */
  parent_id: string | null
  /** Monotonically increasing version number (0 = parent) */
  version_number: number
  /** Optional human-readable version label */
  version_label: string | null
  /** UUID of the user who created this agent */
  created_by: string | null
  /** Timestamp of record creation */
  created_at: Date
  /** Timestamp of last update */
  updated_at: Date
}

/**
 * @description Provides data access for the agents table via BaseModel CRUD.
 *   Includes tenant-scoped queries, version listing, and project association lookups.
 * @extends BaseModel<Agent>
 */
export class AgentModel extends BaseModel<Agent> {
  protected tableName = 'agents'
  protected knex = db

  /**
   * @description Find all agents belonging to a tenant, ordered newest first.
   *   Enforces multi-tenant isolation by filtering on tenant_id.
   * @param {string} tenantId - Tenant/organization identifier
   * @returns {Promise<Agent[]>} Array of agents within the tenant
   */
  async findByTenant(tenantId: string): Promise<Agent[]> {
    return this.knex(this.tableName)
      .where('tenant_id', tenantId)
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Find all versions of an agent by its parent_id.
   *   Returns child versions ordered by version_number ascending.
   * @param {string} parentId - UUID of the parent agent
   * @returns {Promise<Agent[]>} Array of agent versions
   */
  async findVersions(parentId: string): Promise<Agent[]> {
    return this.knex(this.tableName)
      .where('parent_id', parentId)
      .orderBy('version_number', 'asc')
  }

  /**
   * @description Find all agents associated with a knowledge base, ordered newest first.
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @returns {Promise<Agent[]>} Array of agents within the knowledge base
   */
  async findByKnowledgeBase(knowledgeBaseId: string): Promise<Agent[]> {
    return this.knex(this.tableName)
      .where('knowledge_base_id', knowledgeBaseId)
      .orderBy('created_at', 'desc')
  }

  /**
   * @description List root agents (parent_id IS NULL) for a tenant with optional filters and pagination.
   *   Excludes the large JSONB 'dsl' column from list queries to reduce I/O bandwidth.
   * @param {string} tenantId - Tenant identifier
   * @param {{ page: number; page_size: number; mode?: string; status?: string; knowledge_base_id?: string; search?: string }} filters - Pagination and filter params
   * @returns {Promise<{ data: any[]; total: number }>} Paginated results with total count
   */
  async listRootAgents(tenantId: string, filters: {
    page: number; page_size: number; mode?: string | undefined; status?: string | undefined;
    knowledge_base_id?: string | undefined; search?: string | undefined
  }): Promise<{ data: any[]; total: number }> {
    const { page, page_size, mode, status, knowledge_base_id, search } = filters

    // Base query: root agents only (not version rows), scoped to tenant
    let query = this.knex(this.tableName)
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

    // Exclude large JSONB 'dsl' column from list queries
    const listColumns = [
      'id', 'name', 'description', 'avatar', 'mode', 'status',
      'dsl_version', 'tenant_id', 'knowledge_base_id',
      'parent_id', 'version_number', 'version_label',
      'created_by', 'created_at', 'updated_at',
    ]

    // Run count and paginated data queries in parallel for efficiency
    const [countResult, data] = await Promise.all([
      query.clone().count('* as cnt').first(),
      query.clone()
        .select(listColumns)
        .orderBy('updated_at', 'desc')
        .limit(page_size)
        .offset((page - 1) * page_size),
    ])

    const total = Number((countResult as any)?.cnt ?? 0)
    return { data, total }
  }

  /**
   * @description Delete all version rows for a parent agent
   * @param {string} parentId - Parent agent UUID
   * @returns {Promise<void>}
   */
  async deleteVersionsByParentId(parentId: string): Promise<void> {
    await this.knex(this.tableName)
      .where('parent_id', parentId)
      .delete()
  }

  /**
   * @description Get the maximum version number for a parent agent
   * @param {string} parentId - Parent agent UUID
   * @returns {Promise<number>} Maximum version number, or 0 if no versions exist
   */
  async getMaxVersionNumber(parentId: string): Promise<number> {
    const result = await this.knex(this.tableName)
      .where('parent_id', parentId)
      .max('version_number as max_version')
      .first()
    return (result as any)?.max_version ?? 0
  }

  /**
   * @description List all versions of an agent ordered by version_number descending
   * @param {string} parentId - Parent agent UUID
   * @returns {Promise<Agent[]>} Array of version rows, newest first
   */
  async listVersionsDesc(parentId: string): Promise<Agent[]> {
    return this.knex(this.tableName)
      .where('parent_id', parentId)
      .orderBy('version_number', 'desc')
  }
}
