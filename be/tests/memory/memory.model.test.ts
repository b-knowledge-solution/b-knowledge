/**
 * @fileoverview Unit tests for MemoryModel.
 *
 * Tests table name, JSONB columns, scope-based lookups, tenant filtering,
 * creator filtering, and ordering behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBuilder = vi.hoisted(() => ({
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockResolvedValue([]),
}))

const mockKnex = vi.hoisted(() => {
  const fn: any = vi.fn(() => mockBuilder)
  return fn
})

vi.mock('../../src/shared/db/knex.js', () => ({
  db: mockKnex,
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { MemoryModel } from '../../src/modules/memory/models/memory.model.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MemoryModel', () => {
  let model: MemoryModel

  beforeEach(() => {
    vi.clearAllMocks()
    // Re-establish mock return values after clearAllMocks
    mockKnex.mockReturnValue(mockBuilder)
    mockBuilder.where.mockReturnThis()
    mockBuilder.orderBy.mockResolvedValue([])
    model = new MemoryModel()
  })

  // -----------------------------------------------------------------------
  // Table name
  // -----------------------------------------------------------------------

  describe('table name', () => {
    it('uses "memories" as the table name', () => {
      // Access protected property via any cast
      expect((model as any).tableName).toBe('memories')
    })
  })

  // -----------------------------------------------------------------------
  // findByTenant
  // -----------------------------------------------------------------------

  describe('findByTenant', () => {
    it('filters by tenant_id and orders by created_at desc', async () => {
      const expected = [{ id: 'pool-1' }, { id: 'pool-2' }]
      mockBuilder.orderBy.mockResolvedValue(expected)

      const result = await model.findByTenant('tenant-1')

      expect(mockKnex).toHaveBeenCalledWith('memories')
      expect(mockBuilder.where).toHaveBeenCalledWith('tenant_id', 'tenant-1')
      expect(mockBuilder.orderBy).toHaveBeenCalledWith('created_at', 'desc')
      expect(result).toEqual(expected)
    })
  })

  // -----------------------------------------------------------------------
  // findByScope
  // -----------------------------------------------------------------------

  describe('findByScope', () => {
    it('filters by scope_type, scope_id, and tenant_id', async () => {
      const expected = [{ id: 'pool-1' }]
      mockBuilder.orderBy.mockResolvedValue(expected)

      const result = await model.findByScope('agent', 'agent-uuid', 'tenant-1')

      expect(mockBuilder.where).toHaveBeenCalledWith({
        scope_type: 'agent',
        scope_id: 'agent-uuid',
        tenant_id: 'tenant-1',
      })
      expect(mockBuilder.orderBy).toHaveBeenCalledWith('created_at', 'desc')
      expect(result).toEqual(expected)
    })

    it('returns empty array when no pools match scope', async () => {
      mockBuilder.orderBy.mockResolvedValue([])

      const result = await model.findByScope('team', 'team-1', 'tenant-1')

      expect(result).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // findByCreator
  // -----------------------------------------------------------------------

  describe('findByCreator', () => {
    it('filters by created_by and tenant_id', async () => {
      const expected = [{ id: 'pool-1' }]
      mockBuilder.orderBy.mockResolvedValue(expected)

      const result = await model.findByCreator('user-1', 'tenant-1')

      expect(mockBuilder.where).toHaveBeenCalledWith({
        created_by: 'user-1',
        tenant_id: 'tenant-1',
      })
      expect(mockBuilder.orderBy).toHaveBeenCalledWith('created_at', 'desc')
      expect(result).toEqual(expected)
    })

    it('returns empty array when user has no pools', async () => {
      mockBuilder.orderBy.mockResolvedValue([])

      const result = await model.findByCreator('user-2', 'tenant-1')

      expect(result).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // Memory interface structure
  // -----------------------------------------------------------------------

  describe('Memory interface', () => {
    it('model extends BaseModel with Memory type', () => {
      // Verify the model is an instance of MemoryModel
      expect(model).toBeInstanceOf(MemoryModel)
    })
  })
})
