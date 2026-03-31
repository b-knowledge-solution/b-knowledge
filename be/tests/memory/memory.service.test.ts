/**
 * @fileoverview Unit tests for MemoryService.
 *
 * Tests pool CRUD operations: create (with scoping and OpenSearch index),
 * listPools (permission filtering for me/team), getPool (tenant guard),
 * updatePool (404 handling), and deletePool (OpenSearch cleanup + DB delete).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMemoryModel = vi.hoisted(() => ({
  create: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getKnex: vi.fn(),
}))

const mockMemoryMessageService = vi.hoisted(() => ({
  ensureIndex: vi.fn(),
  deleteAllByMemory: vi.fn(),
}))

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    memory: mockMemoryModel,
  },
}))

vi.mock('../../src/modules/memory/services/memory-message.service.js', () => ({
  memoryMessageService: mockMemoryMessageService,
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { memoryService } from '../../src/modules/memory/services/memory.service.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a mock memory pool record with sensible defaults
 */
function buildPool(overrides: Partial<any> = {}): any {
  return {
    id: 'pool-1',
    name: 'Test Pool',
    description: null,
    avatar: null,
    memory_type: 15,
    storage_type: 'table',
    memory_size: 5242880,
    forgetting_policy: 'fifo',
    embd_id: null,
    llm_id: null,
    temperature: 0.1,
    system_prompt: null,
    user_prompt: null,
    extraction_mode: 'batch',
    permission: 'me',
    scope_type: 'user',
    scope_id: null,
    tenant_id: 'tenant-1',
    created_by: 'user-1',
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MemoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -----------------------------------------------------------------------
  // createPool
  // -----------------------------------------------------------------------

  describe('createPool', () => {
    it('creates a pool with required fields and defaults', async () => {
      const created = buildPool()
      mockMemoryModel.create.mockResolvedValue(created)
      mockMemoryMessageService.ensureIndex.mockResolvedValue(undefined)

      const result = await memoryService.createPool(
        { name: 'Test Pool', memory_type: 15, storage_type: 'table', memory_size: 5242880, temperature: 0.1, extraction_mode: 'batch', permission: 'me', scope_type: 'user' },
        'user-1',
        'tenant-1',
      )

      expect(result).toBe(created)
      expect(mockMemoryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Pool',
          tenant_id: 'tenant-1',
          created_by: 'user-1',
          memory_type: 15,
        }),
      )
    })

    it('ensures OpenSearch index after pool creation', async () => {
      mockMemoryModel.create.mockResolvedValue(buildPool())
      mockMemoryMessageService.ensureIndex.mockResolvedValue(undefined)

      await memoryService.createPool(
        { name: 'Test', memory_type: 15, storage_type: 'table', memory_size: 5242880, temperature: 0.1, extraction_mode: 'batch', permission: 'me', scope_type: 'user' },
        'user-1',
        'tenant-1',
      )

      expect(mockMemoryMessageService.ensureIndex).toHaveBeenCalledWith('tenant-1')
    })

    it('passes optional fields when provided', async () => {
      mockMemoryModel.create.mockResolvedValue(buildPool())
      mockMemoryMessageService.ensureIndex.mockResolvedValue(undefined)

      await memoryService.createPool(
        {
          name: 'Test',
          memory_type: 3,
          storage_type: 'graph',
          memory_size: 10485760,
          temperature: 0.5,
          extraction_mode: 'realtime',
          permission: 'team',
          scope_type: 'agent',
          description: 'Test description',
          embd_id: 'embd-1',
          llm_id: 'llm-1',
          system_prompt: 'Custom system',
          user_prompt: 'Custom user',
          scope_id: 'scope-uuid',
        },
        'user-1',
        'tenant-1',
      )

      expect(mockMemoryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Test description',
          embd_id: 'embd-1',
          llm_id: 'llm-1',
          system_prompt: 'Custom system',
          user_prompt: 'Custom user',
          scope_id: 'scope-uuid',
        }),
      )
    })

    it('creates pool with scope_type user', async () => {
      mockMemoryModel.create.mockResolvedValue(buildPool({ scope_type: 'user' }))
      mockMemoryMessageService.ensureIndex.mockResolvedValue(undefined)

      const result = await memoryService.createPool(
        { name: 'User Pool', memory_type: 1, storage_type: 'table', memory_size: 1024, temperature: 0, extraction_mode: 'batch', permission: 'me', scope_type: 'user' },
        'user-1',
        'tenant-1',
      )

      expect(mockMemoryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ scope_type: 'user' }),
      )
      expect(result.scope_type).toBe('user')
    })

    it('creates pool with scope_type agent', async () => {
      mockMemoryModel.create.mockResolvedValue(buildPool({ scope_type: 'agent' }))
      mockMemoryMessageService.ensureIndex.mockResolvedValue(undefined)

      await memoryService.createPool(
        { name: 'Agent Pool', memory_type: 15, storage_type: 'table', memory_size: 5242880, temperature: 0.1, extraction_mode: 'batch', permission: 'me', scope_type: 'agent' },
        'user-1',
        'tenant-1',
      )

      expect(mockMemoryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ scope_type: 'agent' }),
      )
    })

    it('creates pool with scope_type team', async () => {
      mockMemoryModel.create.mockResolvedValue(buildPool({ scope_type: 'team', permission: 'team' }))
      mockMemoryMessageService.ensureIndex.mockResolvedValue(undefined)

      await memoryService.createPool(
        { name: 'Team Pool', memory_type: 15, storage_type: 'table', memory_size: 5242880, temperature: 0.1, extraction_mode: 'batch', permission: 'team', scope_type: 'team' },
        'user-1',
        'tenant-1',
      )

      expect(mockMemoryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ scope_type: 'team', permission: 'team' }),
      )
    })
  })

  // -----------------------------------------------------------------------
  // listPools
  // -----------------------------------------------------------------------

  describe('listPools', () => {
    it('returns pools visible to the user (team + own private)', async () => {
      const pools = [buildPool({ id: 'p1', permission: 'team' }), buildPool({ id: 'p2', permission: 'me' })]

      // Build a chainable Knex builder
      const builder: any = {
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockImplementation(function (this: any, cb: any) {
          // Simulate query execution
          return this
        }),
        orderBy: vi.fn().mockResolvedValue(pools),
      }
      mockMemoryModel.getKnex.mockReturnValue(builder)

      const result = await memoryService.listPools('tenant-1', 'user-1')

      expect(result).toEqual(pools)
      // Verify tenant filtering
      expect(builder.where).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    })

    it('returns empty array when no pools exist', async () => {
      const builder: any = {
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      }
      mockMemoryModel.getKnex.mockReturnValue(builder)

      const result = await memoryService.listPools('tenant-1', 'user-1')

      expect(result).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // getPool
  // -----------------------------------------------------------------------

  describe('getPool', () => {
    it('returns pool when found and tenant matches', async () => {
      const pool = buildPool()
      mockMemoryModel.findById.mockResolvedValue(pool)

      const result = await memoryService.getPool('pool-1', 'tenant-1')

      expect(result).toBe(pool)
    })

    it('returns null when pool not found', async () => {
      mockMemoryModel.findById.mockResolvedValue(undefined)

      const result = await memoryService.getPool('missing', 'tenant-1')

      expect(result).toBeNull()
    })

    it('returns null when tenant does not match (tenant guard)', async () => {
      mockMemoryModel.findById.mockResolvedValue(buildPool({ tenant_id: 'other-tenant' }))

      const result = await memoryService.getPool('pool-1', 'tenant-1')

      expect(result).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // updatePool
  // -----------------------------------------------------------------------

  describe('updatePool', () => {
    it('updates a pool successfully', async () => {
      const existing = buildPool()
      const updated = buildPool({ name: 'Updated Pool' })
      mockMemoryModel.findById.mockResolvedValue(existing)
      mockMemoryModel.update.mockResolvedValue(updated)

      const result = await memoryService.updatePool('pool-1', { name: 'Updated Pool' }, 'tenant-1')

      expect(result).toBe(updated)
      expect(mockMemoryModel.update).toHaveBeenCalledWith('pool-1', { name: 'Updated Pool' })
    })

    it('throws 404 when pool not found', async () => {
      mockMemoryModel.findById.mockResolvedValue(undefined)

      await expect(
        memoryService.updatePool('missing', { name: 'X' }, 'tenant-1'),
      ).rejects.toThrow('Memory pool not found')
    })

    it('throws 404 when tenant does not match', async () => {
      mockMemoryModel.findById.mockResolvedValue(buildPool({ tenant_id: 'other-tenant' }))

      await expect(
        memoryService.updatePool('pool-1', { name: 'X' }, 'tenant-1'),
      ).rejects.toThrow('Memory pool not found')
    })

    it('passes only defined fields to update', async () => {
      const existing = buildPool()
      mockMemoryModel.findById.mockResolvedValue(existing)
      mockMemoryModel.update.mockResolvedValue(existing)

      await memoryService.updatePool('pool-1', { memory_type: 3, temperature: 0.5 }, 'tenant-1')

      expect(mockMemoryModel.update).toHaveBeenCalledWith('pool-1', {
        memory_type: 3,
        temperature: 0.5,
      })
    })

    it('sets error statusCode to 404', async () => {
      mockMemoryModel.findById.mockResolvedValue(undefined)

      try {
        await memoryService.updatePool('missing', { name: 'X' }, 'tenant-1')
        expect.unreachable('Should have thrown')
      } catch (error: any) {
        expect(error.statusCode).toBe(404)
      }
    })
  })

  // -----------------------------------------------------------------------
  // deletePool
  // -----------------------------------------------------------------------

  describe('deletePool', () => {
    it('deletes OpenSearch messages first, then the DB record', async () => {
      const existing = buildPool()
      mockMemoryModel.findById.mockResolvedValue(existing)
      mockMemoryMessageService.deleteAllByMemory.mockResolvedValue(undefined)
      mockMemoryModel.delete.mockResolvedValue(undefined)

      await memoryService.deletePool('pool-1', 'tenant-1')

      // Verify order: OpenSearch cleanup before DB delete
      expect(mockMemoryMessageService.deleteAllByMemory).toHaveBeenCalledWith('pool-1', 'tenant-1')
      expect(mockMemoryModel.delete).toHaveBeenCalledWith('pool-1')
    })

    it('throws 404 when pool not found', async () => {
      mockMemoryModel.findById.mockResolvedValue(undefined)

      await expect(
        memoryService.deletePool('missing', 'tenant-1'),
      ).rejects.toThrow('Memory pool not found')
    })

    it('throws 404 when tenant does not match', async () => {
      mockMemoryModel.findById.mockResolvedValue(buildPool({ tenant_id: 'other-tenant' }))

      await expect(
        memoryService.deletePool('pool-1', 'tenant-1'),
      ).rejects.toThrow('Memory pool not found')
    })

    it('sets error statusCode to 404 on missing pool', async () => {
      mockMemoryModel.findById.mockResolvedValue(undefined)

      try {
        await memoryService.deletePool('missing', 'tenant-1')
        expect.unreachable('Should have thrown')
      } catch (error: any) {
        expect(error.statusCode).toBe(404)
      }
    })
  })
})
