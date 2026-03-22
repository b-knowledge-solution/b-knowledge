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
  /** Optional project association UUID */
  project_id: string | null
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
   * @description Find all agents associated with a project, ordered newest first.
   * @param {string} projectId - UUID of the project
   * @returns {Promise<Agent[]>} Array of agents within the project
   */
  async findByProject(projectId: string): Promise<Agent[]> {
    return this.knex(this.tableName)
      .where('project_id', projectId)
      .orderBy('created_at', 'desc')
  }
}
