/**
 * @fileoverview Memory model — CRUD for the memories table.
 * @module modules/memory/models/memory
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'

/**
 * @description Memory interface representing a record in the 'memories' table.
 *   Memory pools store extracted knowledge from conversations with configurable
 *   memory types (bitmask), extraction modes, and multi-scope ownership.
 */
export interface Memory {
  /** Unique UUID for the memory pool */
  id: string
  /** Human-readable memory pool name */
  name: string
  /** Optional description of the memory pool's purpose */
  description: string | null
  /** Avatar URL or data URI for UI display */
  avatar: string | null
  /** Bitmask for enabled memory types: RAW=1, SEMANTIC=2, EPISODIC=4, PROCEDURAL=8 */
  memory_type: number
  /** Storage backend: 'table' for OpenSearch flat docs, 'graph' for knowledge graph */
  storage_type: 'table' | 'graph'
  /** Maximum memory pool size in bytes (default 5MB) */
  memory_size: number
  /** Strategy for removing old memories when pool is full */
  forgetting_policy: string
  /** Per-pool embedding model override (null = use tenant default) */
  embd_id: string | null
  /** Per-pool LLM model override for extraction (null = use tenant default) */
  llm_id: string | null
  /** LLM temperature for extraction calls */
  temperature: number
  /** Custom system prompt for memory extraction */
  system_prompt: string | null
  /** Custom user prompt template for memory extraction */
  user_prompt: string | null
  /** Extraction timing: batch = post-conversation, realtime = during conversation */
  extraction_mode: 'batch' | 'realtime'
  /** Access control: 'me' = creator only, 'team' = team-visible */
  permission: 'me' | 'team'
  /** Ownership scope: determines what entity owns this memory pool */
  scope_type: 'user' | 'agent' | 'team'
  /** UUID of the owning entity (user, agent, or team based on scope_type) */
  scope_id: string | null
  /** Multi-tenant isolation identifier */
  tenant_id: string
  /** UUID of the user who created this memory pool */
  created_by: string | null
  /** Timestamp of record creation */
  created_at: Date
  /** Timestamp of last update */
  updated_at: Date
}

/**
 * @description Provides data access for the memories table via BaseModel CRUD.
 *   Includes tenant-scoped queries, scope-based lookups, and creator filtering.
 * @extends BaseModel<Memory>
 */
export class MemoryModel extends BaseModel<Memory> {
  protected tableName = 'memories'
  protected knex = db

  /**
   * @description Find all memory pools belonging to a tenant, ordered newest first.
   *   Enforces multi-tenant isolation by filtering on tenant_id.
   * @param {string} tenantId - Tenant/organization identifier
   * @returns {Promise<Memory[]>} Array of memory pools within the tenant
   */
  async findByTenant(tenantId: string): Promise<Memory[]> {
    return this.knex(this.tableName)
      .where('tenant_id', tenantId)
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Find all memory pools matching a specific scope (user, agent, or team).
   *   Used to retrieve memories owned by a particular entity within a tenant.
   * @param {string} scopeType - Scope type: 'user', 'agent', or 'team'
   * @param {string} scopeId - UUID of the owning entity
   * @param {string} tenantId - Tenant/organization identifier for isolation
   * @returns {Promise<Memory[]>} Array of memory pools for the given scope
   */
  async findByScope(scopeType: string, scopeId: string, tenantId: string): Promise<Memory[]> {
    return this.knex(this.tableName)
      .where({ scope_type: scopeType, scope_id: scopeId, tenant_id: tenantId })
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Find all memory pools created by a specific user within a tenant.
   *   Used for "my memories" listing in the UI.
   * @param {string} userId - UUID of the creator
   * @param {string} tenantId - Tenant/organization identifier for isolation
   * @returns {Promise<Memory[]>} Array of memory pools created by the user
   */
  async findByCreator(userId: string, tenantId: string): Promise<Memory[]> {
    return this.knex(this.tableName)
      .where({ created_by: userId, tenant_id: tenantId })
      .orderBy('created_at', 'desc')
  }
}
