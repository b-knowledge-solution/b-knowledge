/**
 * @fileoverview Memory pool service -- CRUD operations for memory pools (memories table).
 *
 * Singleton service following the agentService pattern. All queries are tenant-scoped.
 * On pool creation, ensures the OpenSearch index exists via memoryMessageService.
 * On pool deletion, removes all associated messages from OpenSearch first.
 *
 * @module modules/memory/services/memory
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import type { Memory } from '../models/memory.model.js'
import type { CreateMemoryDto, UpdateMemoryDto } from '../schemas/memory.schemas.js'
import { memoryMessageService } from './memory-message.service.js'

/**
 * @description Singleton service providing memory pool CRUD operations.
 *   All queries enforce tenant isolation via tenant_id filtering.
 */
class MemoryService {
  /**
   * @description Create a new memory pool and ensure the OpenSearch index exists.
   * @param {CreateMemoryDto} dto - Validated memory pool creation data
   * @param {string} userId - UUID of the creating user
   * @param {string} tenantId - Tenant/organization identifier for multi-tenant isolation
   * @returns {Promise<Memory>} The created memory pool record
   */
  async createPool(dto: CreateMemoryDto, userId: string, tenantId: string): Promise<Memory> {
    // Spread optional fields explicitly to satisfy exactOptionalPropertyTypes
    const pool = await ModelFactory.memory.create({
      name: dto.name,
      memory_type: dto.memory_type,
      storage_type: dto.storage_type,
      memory_size: dto.memory_size,
      temperature: dto.temperature,
      extraction_mode: dto.extraction_mode,
      permission: dto.permission,
      scope_type: dto.scope_type,
      tenant_id: tenantId,
      created_by: userId,
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.embd_id !== undefined ? { embd_id: dto.embd_id } : {}),
      ...(dto.llm_id !== undefined ? { llm_id: dto.llm_id } : {}),
      ...(dto.system_prompt !== undefined ? { system_prompt: dto.system_prompt } : {}),
      ...(dto.user_prompt !== undefined ? { user_prompt: dto.user_prompt } : {}),
      ...(dto.scope_id !== undefined ? { scope_id: dto.scope_id } : {}),
    })

    // Ensure the OpenSearch index exists for this tenant (idempotent, cached)
    await memoryMessageService.ensureIndex(tenantId)

    log.info('Memory pool created', { poolId: pool.id, tenantId, userId })
    return pool
  }

  /**
   * @description List memory pools visible to the current user within a tenant.
   *   Returns pools where permission is 'team' (visible to all) or
   *   permission is 'me' and the user is the creator.
   * @param {string} tenantId - Tenant/organization identifier
   * @param {string} userId - UUID of the requesting user for 'me' permission filtering
   * @returns {Promise<Memory[]>} Array of accessible memory pools, newest first
   */
  async listPools(tenantId: string, userId: string): Promise<Memory[]> {
    // Query pools where user has access: team-visible OR user's own private pools
    return ModelFactory.memory.getKnex()
      .where('tenant_id', tenantId)
      .andWhere(function () {
        this.where('permission', 'team')
          .orWhere(function () {
            this.where('permission', 'me').andWhere('created_by', userId)
          })
      })
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Retrieve a single memory pool by ID with tenant guard.
   * @param {string} id - Memory pool UUID
   * @param {string} tenantId - Tenant/organization identifier
   * @returns {Promise<Memory | null>} The memory pool or null if not found/wrong tenant
   */
  async getPool(id: string, tenantId: string): Promise<Memory | null> {
    const pool = await ModelFactory.memory.findById(id)

    // Guard: pool must exist and belong to the requesting tenant
    if (!pool || pool.tenant_id !== tenantId) {
      return null
    }

    return pool
  }

  /**
   * @description Update an existing memory pool's fields.
   * @param {string} id - Memory pool UUID
   * @param {UpdateMemoryDto} dto - Partial update data (validated by Zod)
   * @param {string} tenantId - Tenant/organization identifier for ownership check
   * @returns {Promise<Memory>} The updated memory pool record
   * @throws {Error} 404 if pool not found or belongs to different tenant
   */
  async updatePool(id: string, dto: UpdateMemoryDto, tenantId: string): Promise<Memory> {
    const existing = await this.getPool(id, tenantId)

    // Guard: pool must exist in this tenant
    if (!existing) {
      const error = new Error('Memory pool not found')
      ;(error as any).statusCode = 404
      throw error
    }

    // Build explicit update payload to satisfy exactOptionalPropertyTypes
    const updateData: Partial<Memory> = {}
    if (dto.name !== undefined) updateData.name = dto.name
    if (dto.description !== undefined) updateData.description = dto.description
    if (dto.memory_type !== undefined) updateData.memory_type = dto.memory_type
    if (dto.storage_type !== undefined) updateData.storage_type = dto.storage_type
    if (dto.memory_size !== undefined) updateData.memory_size = dto.memory_size
    if (dto.embd_id !== undefined) updateData.embd_id = dto.embd_id
    if (dto.llm_id !== undefined) updateData.llm_id = dto.llm_id
    if (dto.temperature !== undefined) updateData.temperature = dto.temperature
    if (dto.system_prompt !== undefined) updateData.system_prompt = dto.system_prompt
    if (dto.user_prompt !== undefined) updateData.user_prompt = dto.user_prompt
    if (dto.extraction_mode !== undefined) updateData.extraction_mode = dto.extraction_mode
    if (dto.permission !== undefined) updateData.permission = dto.permission
    if (dto.scope_type !== undefined) updateData.scope_type = dto.scope_type
    if (dto.scope_id !== undefined) updateData.scope_id = dto.scope_id

    const updated = await ModelFactory.memory.update(id, updateData)

    log.info('Memory pool updated', { poolId: id, tenantId, fields: Object.keys(dto) })
    return updated!
  }

  /**
   * @description Delete a memory pool and all its messages from OpenSearch.
   *   Removes OpenSearch messages first, then deletes the database record.
   * @param {string} id - Memory pool UUID
   * @param {string} tenantId - Tenant/organization identifier for ownership check
   * @returns {Promise<void>}
   * @throws {Error} 404 if pool not found or belongs to different tenant
   */
  async deletePool(id: string, tenantId: string): Promise<void> {
    const existing = await this.getPool(id, tenantId)

    // Guard: pool must exist in this tenant
    if (!existing) {
      const error = new Error('Memory pool not found')
      ;(error as any).statusCode = 404
      throw error
    }

    // Delete all messages from OpenSearch before removing the pool record
    await memoryMessageService.deleteAllByMemory(id, tenantId)

    // Delete the pool record from the database
    await ModelFactory.memory.delete(id)

    log.info('Memory pool deleted', { poolId: id, tenantId })
  }
}

/** @description Singleton memory service instance */
export const memoryService = new MemoryService()
