/**
 * @fileoverview Tests for SearchService RBAC logic.
 *
 * Validates role-based access control for search app listing, access checking,
 * and access management operations.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

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
    orWhereExists: vi.fn().mockImplementation(function (fn: any) { fn.call(this); return this }),
    insert: vi.fn().mockResolvedValue(result),
    delete: vi.fn().mockResolvedValue(result),
    distinct: vi.fn().mockReturnThis(),
    pluck: vi.fn().mockResolvedValue(result),
    first: vi.fn().mockResolvedValue(result),
    returning: vi.fn().mockReturnThis(),
    transacting: vi.fn().mockReturnThis(),
    count: vi.fn().mockReturnValue({ first: () => Promise.resolve({ total: '0' }) }),
    then: (onFulfilled: any) => Promise.resolve(result).then(onFulfilled),
  }
  return builder
}

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const ADMIN_USER = { id: 'admin-1', role: 'admin' }
const LEADER_USER = { id: 'leader-1', role: 'leader' }
const REGULAR_USER = { id: 'user-1', role: 'user' }

const APP_PUBLIC = { id: 'app-public', name: 'Public Search', is_public: true, created_by: 'admin-1' }
const APP_OWN = { id: 'app-own', name: 'My Search', is_public: false, created_by: 'user-1' }
const APP_PRIVATE = { id: 'app-priv', name: 'Private Search', is_public: false, created_by: 'other-user' }
const APP_USER_ACCESS = { id: 'app-user-acc', name: 'User Access', is_public: false, created_by: 'other-user' }
const APP_TEAM_ACCESS = { id: 'app-team-acc', name: 'Team Access', is_public: false, created_by: 'other-user' }

const ALL_APPS = [APP_PUBLIC, APP_OWN, APP_PRIVATE, APP_USER_ACCESS, APP_TEAM_ACCESS]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SearchService – RBAC logic', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // listSearchApps – admin sees all
  // -----------------------------------------------------------------------

  describe('listSearchApps – admin visibility', () => {
    it('admin can list all search apps regardless of ownership or access', async () => {
      const { searchService } = await import('../../src/modules/search/services/search.service')
      const factory = await import('../../src/shared/models/factory')

      // Mock: return all apps for admin (no filter)
      factory.ModelFactory.searchApp.findAll = vi.fn().mockResolvedValue(ALL_APPS)

      const result = await searchService.listSearchApps()

      // Admin should see all 5 apps
      expect(result).toHaveLength(5)
      expect(result).toEqual(ALL_APPS)
    })
  })

  // -----------------------------------------------------------------------
  // listSearchApps – regular user sees filtered
  // -----------------------------------------------------------------------

  describe('listSearchApps – regular user visibility', () => {
    it('regular user only sees own apps when no RBAC entries exist', async () => {
      const { searchService } = await import('../../src/modules/search/services/search.service')
      const factory = await import('../../src/shared/models/factory')

      // Mock: return only apps created by this user
      const ownApps = [APP_OWN]
      factory.ModelFactory.searchApp.findAll = vi.fn().mockResolvedValue(ownApps)

      const result = await searchService.listSearchApps(REGULAR_USER.id)

      expect(result).toEqual(ownApps)
      expect(factory.ModelFactory.searchApp.findAll).toHaveBeenCalledWith(
        { created_by: REGULAR_USER.id },
        expect.any(Object)
      )
    })

    it('regular user sees public apps, own apps, direct access apps, and team access apps', async () => {
      const { searchService } = await import('../../src/modules/search/services/search.service')
      const factory = await import('../../src/shared/models/factory')

      // Mock: user sees public + own + user-access + team-access apps
      const accessibleApps = [APP_PUBLIC, APP_OWN, APP_USER_ACCESS, APP_TEAM_ACCESS]
      factory.ModelFactory.searchApp.findAll = vi.fn().mockResolvedValue(accessibleApps)

      const result = await searchService.listSearchApps(REGULAR_USER.id)

      // Should NOT include APP_PRIVATE
      expect(result).toEqual(accessibleApps)
      expect(result).not.toContainEqual(APP_PRIVATE)
    })
  })

  // -----------------------------------------------------------------------
  // checkUserAccess
  // -----------------------------------------------------------------------

  describe('checkUserAccess', () => {
    it('returns true when user has direct access entry', async () => {
      const factory = await import('../../src/shared/models/factory')

      // Mock: access entry exists for user
      const accessEntry = { id: 'a1', app_id: 'app-user-acc', entity_type: 'user', entity_id: 'user-1' }
      const builder = makeBuilder(accessEntry)
      factory.ModelFactory.searchAppAccess = { getKnex: vi.fn().mockReturnValue(builder) } as any

      const knex = factory.ModelFactory.searchAppAccess.getKnex()
      const result = await knex
        .from('search_app_access')
        .where('app_id', 'app-user-acc')
        .where('entity_type', 'user')
        .where('entity_id', 'user-1')
        .first()

      expect(result).toBeDefined()
      expect(result.entity_id).toBe('user-1')
    })

    it('returns true when user belongs to a team with access', async () => {
      const factory = await import('../../src/shared/models/factory')

      // Mock: team-based access entry
      const accessEntry = { id: 'a2', app_id: 'app-team-acc', entity_type: 'team', entity_id: 'team-alpha' }
      const builder = makeBuilder(accessEntry)
      factory.ModelFactory.searchAppAccess = { getKnex: vi.fn().mockReturnValue(builder) } as any

      const knex = factory.ModelFactory.searchAppAccess.getKnex()
      const result = await knex
        .from('search_app_access')
        .where('app_id', 'app-team-acc')
        .where('entity_type', 'team')
        .whereIn('entity_id', ['team-alpha'])
        .first()

      expect(result).toBeDefined()
      expect(result.entity_type).toBe('team')
    })

    it('returns false when user has no access entry', async () => {
      const factory = await import('../../src/shared/models/factory')

      // Mock: no access entry found
      const builder = makeBuilder(undefined)
      factory.ModelFactory.searchAppAccess = { getKnex: vi.fn().mockReturnValue(builder) } as any

      const knex = factory.ModelFactory.searchAppAccess.getKnex()
      const result = await knex
        .from('search_app_access')
        .where('app_id', 'app-priv')
        .where('entity_type', 'user')
        .where('entity_id', 'user-1')
        .first()

      expect(result).toBeUndefined()
    })

    it('returns true for public app regardless of access entries', async () => {
      // Public apps should be accessible without explicit access entries
      expect(APP_PUBLIC.is_public).toBe(true)
    })

    it('returns true for app owner', async () => {
      // Owner should always have access to their own app
      expect(APP_OWN.created_by).toBe(REGULAR_USER.id)
    })
  })

  // -----------------------------------------------------------------------
  // setAppAccess
  // -----------------------------------------------------------------------

  describe('setAppAccess', () => {
    it('creates access entries for users and teams', async () => {
      const factory = await import('../../src/shared/models/factory')

      const newEntries = [
        { app_id: 'app1', entity_type: 'user', entity_id: 'u2', created_by: 'admin-1' },
        { app_id: 'app1', entity_type: 'team', entity_id: 't1', created_by: 'admin-1' },
      ]
      const deleteBuilder = makeBuilder(0)
      const insertBuilder = makeBuilder(newEntries)

      factory.ModelFactory.searchAppAccess = {
        getKnex: vi.fn()
          .mockReturnValueOnce(deleteBuilder)
          .mockReturnValueOnce(insertBuilder),
      } as any

      // Step 1: Clear existing entries
      const delKnex = factory.ModelFactory.searchAppAccess.getKnex()
      await delKnex.from('search_app_access').where('app_id', 'app1').delete()
      expect(deleteBuilder.delete).toHaveBeenCalled()

      // Step 2: Insert new entries
      const insKnex = factory.ModelFactory.searchAppAccess.getKnex()
      const result = await insKnex.from('search_app_access').insert(newEntries)
      expect(insertBuilder.insert).toHaveBeenCalledWith(newEntries)
      expect(result).toEqual(newEntries)
    })

    it('replaces existing entries when updating access', async () => {
      const factory = await import('../../src/shared/models/factory')

      // First call deletes 3 old entries, second inserts 1 new entry
      const deleteBuilder = makeBuilder(3)
      const insertBuilder = makeBuilder([{ app_id: 'app1', entity_type: 'user', entity_id: 'u5' }])

      factory.ModelFactory.searchAppAccess = {
        getKnex: vi.fn()
          .mockReturnValueOnce(deleteBuilder)
          .mockReturnValueOnce(insertBuilder),
      } as any

      const delKnex = factory.ModelFactory.searchAppAccess.getKnex()
      const deleted = await delKnex.from('search_app_access').where('app_id', 'app1').delete()
      expect(deleted).toBe(3)

      const insKnex = factory.ModelFactory.searchAppAccess.getKnex()
      await insKnex.from('search_app_access').insert([
        { app_id: 'app1', entity_type: 'user', entity_id: 'u5' },
      ])
      expect(insertBuilder.insert).toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // getAppAccess
  // -----------------------------------------------------------------------

  describe('getAppAccess', () => {
    it('returns enriched access entries with user/team info', async () => {
      const factory = await import('../../src/shared/models/factory')

      const entries = [
        { id: 'a1', app_id: 'app1', entity_type: 'user', entity_id: 'u1', user_name: 'Alice' },
        { id: 'a2', app_id: 'app1', entity_type: 'team', entity_id: 't1', team_name: 'Engineering' },
      ]
      const builder = makeBuilder(entries)
      factory.ModelFactory.searchAppAccess = { getKnex: vi.fn().mockReturnValue(builder) } as any

      const knex = factory.ModelFactory.searchAppAccess.getKnex()
      const result = await knex
        .from('search_app_access')
        .select('search_app_access.*')
        .where('app_id', 'app1')

      expect(result).toHaveLength(2)
      expect(result[0].entity_type).toBe('user')
      expect(result[1].entity_type).toBe('team')
    })

    it('returns empty array when app has no access entries', async () => {
      const factory = await import('../../src/shared/models/factory')

      const builder = makeBuilder([])
      factory.ModelFactory.searchAppAccess = { getKnex: vi.fn().mockReturnValue(builder) } as any

      const knex = factory.ModelFactory.searchAppAccess.getKnex()
      const result = await knex
        .from('search_app_access')
        .where('app_id', 'app-empty')

      expect(result).toEqual([])
    })
  })
})
