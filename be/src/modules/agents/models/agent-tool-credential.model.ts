/**
 * @fileoverview AgentToolCredential model — CRUD for the agent_tool_credentials table.
 * @module modules/agents/models/agent-tool-credential
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'

/**
 * @description AgentToolCredential interface representing a record in the 'agent_tool_credentials' table.
 *   Stores encrypted credentials for external tools used by agents. A NULL agent_id
 *   indicates a tenant-level default credential for that tool type.
 */
export interface AgentToolCredential {
  /** Unique UUID for the credential */
  id: string
  /** Multi-tenant isolation identifier */
  tenant_id: string
  /** NULL = tenant-level default; non-null = agent-specific override */
  agent_id: string | null
  /** Tool identifier (e.g., 'tavily', 'github', 'sql') */
  tool_type: string
  /** Human-readable credential name */
  name: string
  /** AES-256-CBC encrypted credential payload */
  encrypted_credentials: string
  /** UUID of the user who created this credential */
  created_by: string | null
  /** Timestamp of record creation */
  created_at: Date
  /** Timestamp of last update */
  updated_at: Date
}

/**
 * @description Provides data access for the agent_tool_credentials table via BaseModel CRUD.
 *   Includes tenant-scoped, agent-scoped, and tenant-default credential lookups.
 * @extends BaseModel<AgentToolCredential>
 */
export class AgentToolCredentialModel extends BaseModel<AgentToolCredential> {
  protected tableName = 'agent_tool_credentials'
  protected knex = db

  /**
   * @description Find all credentials belonging to a tenant, ordered by tool type.
   * @param {string} tenantId - Tenant/organization identifier
   * @returns {Promise<AgentToolCredential[]>} Array of credentials within the tenant
   */
  async findByTenant(tenantId: string): Promise<AgentToolCredential[]> {
    return this.knex(this.tableName)
      .where('tenant_id', tenantId)
      .orderBy('tool_type', 'asc')
  }

  /**
   * @description Find all credentials for a specific agent.
   * @param {string} agentId - UUID of the agent
   * @returns {Promise<AgentToolCredential[]>} Array of agent-specific credentials
   */
  async findByAgent(agentId: string): Promise<AgentToolCredential[]> {
    return this.knex(this.tableName)
      .where('agent_id', agentId)
      .orderBy('tool_type', 'asc')
  }

  /**
   * @description Find the tenant-level default credential for a specific tool type.
   *   Tenant defaults have agent_id = NULL and are used as fallback when
   *   no agent-specific credential exists.
   * @param {string} tenantId - Tenant/organization identifier
   * @param {string} toolType - Tool identifier (e.g., 'tavily')
   * @returns {Promise<AgentToolCredential | undefined>} Default credential if found
   */
  async findTenantDefault(tenantId: string, toolType: string): Promise<AgentToolCredential | undefined> {
    return this.knex(this.tableName)
      .where('tenant_id', tenantId)
      .where('tool_type', toolType)
      .whereNull('agent_id')
      .first()
  }
}
