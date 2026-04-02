/**
 * @fileoverview AgentTemplate model — CRUD for the agent_templates table.
 * @module modules/agents/models/agent-template
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'

/**
 * @description AgentTemplate interface representing a record in the 'agent_templates' table.
 *   Pre-built workflow templates that users can instantiate as new agents.
 */
export interface AgentTemplate {
  /** Unique UUID for the template */
  id: string
  /** Template display name */
  name: string
  /** Optional description of what the template does */
  description: string | null
  /** Template avatar/icon URL */
  avatar: string | null
  /** Category for gallery filtering (e.g., 'customer-support', 'data-processing') */
  category: string | null
  /** Execution mode: 'agent' or 'pipeline' */
  mode: 'agent' | 'pipeline'
  /** JSONB workflow graph template */
  dsl: Record<string, unknown>
  /** DSL schema version */
  dsl_version: number
  /** System templates cannot be deleted by users */
  is_system: boolean
  /** NULL = global system template; non-null = tenant-specific custom template */
  tenant_id: string | null
  /** UUID of the user who created this template */
  created_by: string | null
  /** Timestamp of record creation */
  created_at: Date
  /** Timestamp of last update */
  updated_at: Date
}

/**
 * @description Provides data access for the agent_templates table via BaseModel CRUD.
 *   Includes tenant-scoped listing and system template queries.
 * @extends BaseModel<AgentTemplate>
 */
export class AgentTemplateModel extends BaseModel<AgentTemplate> {
  protected tableName = 'agent_templates'
  protected knex = db

  /**
   * @description Find all templates visible to a tenant (tenant-specific + system templates).
   *   Returns both global system templates and tenant-owned custom templates.
   * @param {string} tenantId - Tenant/organization identifier
   * @returns {Promise<AgentTemplate[]>} Array of templates ordered by name
   */
  async findByTenant(tenantId: string): Promise<AgentTemplate[]> {
    return this.knex(this.tableName)
      .where('tenant_id', tenantId)
      .orWhereNull('tenant_id')
      .orderBy('name', 'asc')
  }

  /**
   * @description Find all global system templates (tenant_id IS NULL, is_system = true).
   *   Used for the template gallery default view.
   * @returns {Promise<AgentTemplate[]>} Array of system templates ordered by category then name
   */
  async findSystemTemplates(): Promise<AgentTemplate[]> {
    return this.knex(this.tableName)
      .where('is_system', true)
      .whereNull('tenant_id')
      .orderBy('category', 'asc')
      .orderBy('name', 'asc')
  }
}
