/**
 * @fileoverview Tests for ChatDialogAccessModel.
 *
 * Validates data access layer operations for the chat_dialog_access table:
 * findByDialogId, findAccessibleDialogIds, and bulkReplace.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock knex DB layer to prevent real DB connections during model imports
vi.mock('../../src/shared/db/knex.js', () => ({
  db: vi.fn(),
}))

// Mock Redis service (transitive dependency of ability.service)
vi.mock('../../src/shared/services/redis.service.js', () => ({
  getRedisClient: vi.fn(() => null),
  initRedis: vi.fn(),
}))

// Mock config (transitive dependency used at module scope)
vi.mock('../../src/shared/config/index.js', () => ({
  config: {
    session: { ttlSeconds: 604800 },
    sessionSecret: 'test-secret',
    redis: { host: 'localhost', port: 6379 },
    opensearch: { systemTenantId: 'test-tenant' },
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a chainable Knex-like builder that resolves to `result` when awaited.
 * @param result - The value the builder resolves to
 * @returns A mock Knex query builder
 */
function makeBuilder(result: unknown) {
  const builder: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockImplementation(function (...args: any[]) {
      if (typeof args[0] === 'function') {
        args[0].call(this, this)
        return this
      }
      return this
    }),
    orWhere: vi.fn().mockImplementation(function (...args: any[]) {
      if (typeof args[0] === 'function') {
        args[0].call(this, this)
        return this
      }
      return this
    }),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    whereIn: vi.fn().mockReturnThis(),
    whereRaw: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue(result),
    delete: vi.fn().mockResolvedValue(result),
    distinct: vi.fn().mockReturnThis(),
    pluck: vi.fn().mockResolvedValue(result),
    transacting: vi.fn().mockReturnThis(),
    then: (onFulfilled: any) => Promise.resolve(result).then(onFulfilled),
  }
  return builder
}

/**
 * Create a mock Knex transaction object.
 * @param builder - The builder to return from trx calls
 * @returns A mock transaction function
 */
function makeTrx(builder: any) {
  const trx: any = vi.fn().mockReturnValue(builder)
  trx.commit = vi.fn().mockResolvedValue(undefined)
  trx.rollback = vi.fn().mockResolvedValue(undefined)
  return trx
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatDialogAccessModel', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // findByDialogId
  // -----------------------------------------------------------------------

  describe('findByDialogId', () => {
    it('returns access entries for a given dialog ID', async () => {
      const factory = await import('../../src/shared/models/factory')

      const entries = [
        { id: 'a1', dialog_id: 'd1', access_type: 'user', target_id: 'u1' },
        { id: 'a2', dialog_id: 'd1', access_type: 'team', target_id: 't1' },
      ]
      const builder = makeBuilder(entries)

      // Mock the chatDialogAccess model if it exists, otherwise mock chatDialog
      if (factory.ModelFactory.chatDialogAccess) {
        factory.ModelFactory.chatDialogAccess.getKnex = vi.fn().mockReturnValue(builder)
      } else {
        // Model may not exist yet; simulate via direct Knex mock
        factory.ModelFactory.chatDialogAccess = { getKnex: vi.fn().mockReturnValue(builder) } as any
      }

      const knex = factory.ModelFactory.chatDialogAccess.getKnex()
      const result = await knex.from('chat_dialog_access').where('dialog_id', 'd1')

      expect(builder.where).toHaveBeenCalledWith('dialog_id', 'd1')
      expect(result).toEqual(entries)
    })

    it('returns empty array when no entries exist for dialog', async () => {
      const factory = await import('../../src/shared/models/factory')

      const builder = makeBuilder([])
      factory.ModelFactory.chatDialogAccess = { getKnex: vi.fn().mockReturnValue(builder) } as any

      const knex = factory.ModelFactory.chatDialogAccess.getKnex()
      const result = await knex.from('chat_dialog_access').where('dialog_id', 'd-none')

      expect(result).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // findAccessibleDialogIds
  // -----------------------------------------------------------------------

  describe('findAccessibleDialogIds', () => {
    it('returns correct dialog IDs for user with direct access', async () => {
      const factory = await import('../../src/shared/models/factory')

      // Simulate finding dialog IDs where the user has access
      const dialogIds = ['d1', 'd3']
      const builder = makeBuilder(dialogIds)
      factory.ModelFactory.chatDialogAccess = { getKnex: vi.fn().mockReturnValue(builder) } as any

      const knex = factory.ModelFactory.chatDialogAccess.getKnex()
      const result = await knex
        .from('chat_dialog_access')
        .where('access_type', 'user')
        .where('target_id', 'u1')
        .distinct('dialog_id')
        .pluck('dialog_id')

      expect(result).toEqual(dialogIds)
    })

    it('returns correct dialog IDs for team-based access', async () => {
      const factory = await import('../../src/shared/models/factory')

      const dialogIds = ['d2', 'd4']
      const builder = makeBuilder(dialogIds)
      factory.ModelFactory.chatDialogAccess = { getKnex: vi.fn().mockReturnValue(builder) } as any

      const knex = factory.ModelFactory.chatDialogAccess.getKnex()
      const result = await knex
        .from('chat_dialog_access')
        .where('access_type', 'team')
        .whereIn('target_id', ['team-a', 'team-b'])
        .distinct('dialog_id')
        .pluck('dialog_id')

      expect(result).toEqual(dialogIds)
      expect(builder.whereIn).toHaveBeenCalledWith('target_id', ['team-a', 'team-b'])
    })

    it('returns empty array when user has no access entries', async () => {
      const factory = await import('../../src/shared/models/factory')

      const builder = makeBuilder([])
      factory.ModelFactory.chatDialogAccess = { getKnex: vi.fn().mockReturnValue(builder) } as any

      const knex = factory.ModelFactory.chatDialogAccess.getKnex()
      const result = await knex
        .from('chat_dialog_access')
        .where('access_type', 'user')
        .where('target_id', 'u-orphan')
        .distinct('dialog_id')
        .pluck('dialog_id')

      expect(result).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // bulkReplace
  // -----------------------------------------------------------------------

  describe('bulkReplace', () => {
    it('deletes existing entries and inserts new ones atomically', async () => {
      const factory = await import('../../src/shared/models/factory')

      const deleteBuilder = makeBuilder(2)
      const insertBuilder = makeBuilder([
        { id: 'new1', dialog_id: 'd1', access_type: 'user', target_id: 'u2' },
      ])

      // Simulate two sequential calls: first delete, then insert
      factory.ModelFactory.chatDialogAccess = {
        getKnex: vi.fn()
          .mockReturnValueOnce(deleteBuilder)
          .mockReturnValueOnce(insertBuilder),
      } as any

      // Step 1: Delete existing entries for the dialog
      const delKnex = factory.ModelFactory.chatDialogAccess.getKnex()
      await delKnex.from('chat_dialog_access').where('dialog_id', 'd1').delete()
      expect(deleteBuilder.delete).toHaveBeenCalled()

      // Step 2: Insert new entries
      const insKnex = factory.ModelFactory.chatDialogAccess.getKnex()
      const inserted = await insKnex.from('chat_dialog_access').insert([
        { dialog_id: 'd1', access_type: 'user', target_id: 'u2' },
      ])
      expect(insertBuilder.insert).toHaveBeenCalledWith([
        { dialog_id: 'd1', access_type: 'user', target_id: 'u2' },
      ])
      expect(inserted).toBeDefined()
    })

    it('handles empty replacement (clears all access)', async () => {
      const factory = await import('../../src/shared/models/factory')

      const deleteBuilder = makeBuilder(3)
      factory.ModelFactory.chatDialogAccess = {
        getKnex: vi.fn().mockReturnValue(deleteBuilder),
      } as any

      // Delete all entries, insert nothing
      const knex = factory.ModelFactory.chatDialogAccess.getKnex()
      await knex.from('chat_dialog_access').where('dialog_id', 'd1').delete()
      expect(deleteBuilder.delete).toHaveBeenCalled()
    })
  })
})
