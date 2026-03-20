/**
 * @fileoverview Tests for SearchAppAccessModel.
 *
 * Validates data access layer operations for the search_app_access table:
 * findByAppId, findAccessibleAppIds, and bulkReplace.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    returning: vi.fn().mockReturnThis(),
    transacting: vi.fn().mockReturnThis(),
    then: (onFulfilled: any) => Promise.resolve(result).then(onFulfilled),
  }
  return builder
}

// ---------------------------------------------------------------------------
// Mock ModelFactory with writable searchAppAccess
// ---------------------------------------------------------------------------

const mockSearchAppAccess = {
  getKnex: vi.fn(),
}

vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: {
    searchAppAccess: mockSearchAppAccess,
  },
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SearchAppAccessModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // findByAppId
  // -----------------------------------------------------------------------

  describe('findByAppId', () => {
    it('returns access entries for a given app ID', async () => {
      const entries = [
        { id: 'a1', app_id: 'app1', entity_type: 'user', entity_id: 'u1' },
        { id: 'a2', app_id: 'app1', entity_type: 'team', entity_id: 't1' },
      ]
      const builder = makeBuilder(entries)
      mockSearchAppAccess.getKnex.mockReturnValue(builder)

      const knex = mockSearchAppAccess.getKnex()
      const result = await knex.from('search_app_access').where('app_id', 'app1')

      expect(builder.where).toHaveBeenCalledWith('app_id', 'app1')
      expect(result).toEqual(entries)
    })

    it('returns empty array when no entries exist for app', async () => {
      const builder = makeBuilder([])
      mockSearchAppAccess.getKnex.mockReturnValue(builder)

      const knex = mockSearchAppAccess.getKnex()
      const result = await knex.from('search_app_access').where('app_id', 'app-none')

      expect(result).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // findAccessibleAppIds
  // -----------------------------------------------------------------------

  describe('findAccessibleAppIds', () => {
    it('returns correct app IDs for user with direct access', async () => {
      const appIds = ['app1', 'app3']
      const builder = makeBuilder(appIds)
      mockSearchAppAccess.getKnex.mockReturnValue(builder)

      const knex = mockSearchAppAccess.getKnex()
      const result = await knex
        .from('search_app_access')
        .where('entity_type', 'user')
        .where('entity_id', 'u1')
        .distinct('app_id')
        .pluck('app_id')

      expect(result).toEqual(appIds)
    })

    it('returns correct app IDs for team-based access', async () => {
      const appIds = ['app2', 'app4']
      const builder = makeBuilder(appIds)
      mockSearchAppAccess.getKnex.mockReturnValue(builder)

      const knex = mockSearchAppAccess.getKnex()
      const result = await knex
        .from('search_app_access')
        .where('entity_type', 'team')
        .whereIn('entity_id', ['team-a', 'team-b'])
        .distinct('app_id')
        .pluck('app_id')

      expect(result).toEqual(appIds)
      expect(builder.whereIn).toHaveBeenCalledWith('entity_id', ['team-a', 'team-b'])
    })

    it('returns empty array when user has no access entries', async () => {
      const builder = makeBuilder([])
      mockSearchAppAccess.getKnex.mockReturnValue(builder)

      const knex = mockSearchAppAccess.getKnex()
      const result = await knex
        .from('search_app_access')
        .where('entity_type', 'user')
        .where('entity_id', 'u-orphan')
        .distinct('app_id')
        .pluck('app_id')

      expect(result).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // bulkReplace
  // -----------------------------------------------------------------------

  describe('bulkReplace', () => {
    it('deletes existing entries and inserts new ones atomically', async () => {
      const deleteBuilder = makeBuilder(2)
      const insertBuilder = makeBuilder([
        { id: 'new1', app_id: 'app1', entity_type: 'user', entity_id: 'u2' },
      ])

      // Simulate two sequential calls: first delete, then insert
      mockSearchAppAccess.getKnex
        .mockReturnValueOnce(deleteBuilder)
        .mockReturnValueOnce(insertBuilder)

      // Step 1: Delete existing entries for the app
      const delKnex = mockSearchAppAccess.getKnex()
      await delKnex.from('search_app_access').where('app_id', 'app1').delete()
      expect(deleteBuilder.delete).toHaveBeenCalled()

      // Step 2: Insert new entries
      const insKnex = mockSearchAppAccess.getKnex()
      const inserted = await insKnex.from('search_app_access').insert([
        { app_id: 'app1', entity_type: 'user', entity_id: 'u2', created_by: 'admin-1' },
      ])
      expect(insertBuilder.insert).toHaveBeenCalledWith([
        { app_id: 'app1', entity_type: 'user', entity_id: 'u2', created_by: 'admin-1' },
      ])
      expect(inserted).toBeDefined()
    })

    it('handles empty replacement (clears all access)', async () => {
      const deleteBuilder = makeBuilder(3)
      mockSearchAppAccess.getKnex.mockReturnValue(deleteBuilder)

      // Delete all entries, insert nothing
      const knex = mockSearchAppAccess.getKnex()
      await knex.from('search_app_access').where('app_id', 'app1').delete()
      expect(deleteBuilder.delete).toHaveBeenCalled()
    })
  })
})
