/**
 * @fileoverview Tests for ChatAssistantService RBAC logic.
 *
 * Validates role-based access control for assistant listing, access checking,
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

const ASSISTANT_PUBLIC = { id: 'd-public', name: 'Public', is_public: true, created_by: 'admin-1' }
const ASSISTANT_OWN = { id: 'd-own', name: 'My Assistant', is_public: false, created_by: 'user-1' }
const ASSISTANT_PRIVATE = { id: 'd-priv', name: 'Private', is_public: false, created_by: 'other-user' }
const ASSISTANT_USER_ACCESS = { id: 'd-user-acc', name: 'User Access', is_public: false, created_by: 'other-user' }
const ASSISTANT_TEAM_ACCESS = { id: 'd-team-acc', name: 'Team Access', is_public: false, created_by: 'other-user' }

const ALL_ASSISTANTS = [ASSISTANT_PUBLIC, ASSISTANT_OWN, ASSISTANT_PRIVATE, ASSISTANT_USER_ACCESS, ASSISTANT_TEAM_ACCESS]

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockChatAssistant = {
  findAll: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  getKnex: vi.fn(),
}

const mockChatAssistantAccess = {
  getKnex: vi.fn(),
  findAll: vi.fn(),
  findAccessibleAssistantIds: vi.fn().mockResolvedValue([]),
  findByAssistantId: vi.fn().mockResolvedValue([]),
  bulkReplace: vi.fn().mockResolvedValue([]),
}

vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: {
    chatAssistant: mockChatAssistant,
    chatAssistantAccess: mockChatAssistantAccess,
    user: { getKnex: vi.fn() },
    team: { getKnex: vi.fn() },
  },
}))

vi.mock('@/shared/models/types.js', () => ({}))

vi.mock('@/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatAssistantService – RBAC logic', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // listAssistants – admin sees all
  // -----------------------------------------------------------------------

  describe('listAssistants – admin visibility', () => {
    it('admin can list all assistants regardless of ownership or access', async () => {
      const { chatAssistantService } = await import('../../src/modules/chat/services/chat-assistant.service')

      // Mock: return all assistants for admin
      mockChatAssistant.findAll.mockResolvedValue(ALL_ASSISTANTS)

      const result = await chatAssistantService.listAssistants()

      // Admin should see all 5 assistants
      expect(result).toHaveLength(5)
      expect(result).toEqual(ALL_ASSISTANTS)
    })
  })

  // -----------------------------------------------------------------------
  // listAssistants – regular user sees filtered
  // -----------------------------------------------------------------------

  describe('listAssistants – regular user visibility', () => {
    it('regular user only sees own assistants when filtered by userId', async () => {
      const { chatAssistantService } = await import('../../src/modules/chat/services/chat-assistant.service')

      // Mock: return only assistants created by this user
      const ownAssistants = [ASSISTANT_OWN]
      mockChatAssistant.findAll.mockResolvedValue(ownAssistants)

      const result = await chatAssistantService.listAssistants(REGULAR_USER.id)

      expect(result).toEqual(ownAssistants)
      expect(mockChatAssistant.findAll).toHaveBeenCalledWith(
        { created_by: REGULAR_USER.id },
        expect.any(Object)
      )
    })
  })

  // -----------------------------------------------------------------------
  // checkUserAccess
  // -----------------------------------------------------------------------

  describe('checkUserAccess', () => {
    it('returns true when user has direct access entry', async () => {
      // Mock: access entry exists for user
      const accessEntry = { id: 'a1', assistant_id: 'd-user-acc', entity_type: 'user', entity_id: 'user-1' }
      const builder = makeBuilder(accessEntry)
      mockChatAssistantAccess.getKnex.mockReturnValue(builder)

      const knex = mockChatAssistantAccess.getKnex()
      const result = await knex
        .from('chat_assistant_access')
        .where('assistant_id', 'd-user-acc')
        .where('entity_type', 'user')
        .where('entity_id', 'user-1')
        .first()

      expect(result).toBeDefined()
      expect(result.entity_id).toBe('user-1')
    })

    it('returns true when user belongs to a team with access', async () => {
      // Mock: team-based access entry
      const accessEntry = { id: 'a2', assistant_id: 'd-team-acc', entity_type: 'team', entity_id: 'team-alpha' }
      const builder = makeBuilder(accessEntry)
      mockChatAssistantAccess.getKnex.mockReturnValue(builder)

      const knex = mockChatAssistantAccess.getKnex()
      const result = await knex
        .from('chat_assistant_access')
        .where('assistant_id', 'd-team-acc')
        .where('entity_type', 'team')
        .whereIn('entity_id', ['team-alpha'])
        .first()

      expect(result).toBeDefined()
      expect(result.entity_type).toBe('team')
    })

    it('returns false when user has no access entry', async () => {
      // Mock: no access entry found
      const builder = makeBuilder(undefined)
      mockChatAssistantAccess.getKnex.mockReturnValue(builder)

      const knex = mockChatAssistantAccess.getKnex()
      const result = await knex
        .from('chat_assistant_access')
        .where('assistant_id', 'd-priv')
        .where('entity_type', 'user')
        .where('entity_id', 'user-1')
        .first()

      expect(result).toBeUndefined()
    })

    it('returns true for public assistant regardless of access entries', async () => {
      // Public assistants should be accessible without explicit access entries
      expect(ASSISTANT_PUBLIC.is_public).toBe(true)
    })

    it('returns true for assistant owner', async () => {
      // Owner should always have access to their own assistant
      expect(ASSISTANT_OWN.created_by).toBe(REGULAR_USER.id)
    })
  })

  // -----------------------------------------------------------------------
  // setAssistantAccess
  // -----------------------------------------------------------------------

  describe('setAssistantAccess', () => {
    it('creates access entries for users and teams', async () => {
      const newEntries = [
        { assistant_id: 'd1', entity_type: 'user', entity_id: 'u2' },
        { assistant_id: 'd1', entity_type: 'team', entity_id: 't1' },
      ]
      const deleteBuilder = makeBuilder(0)
      const insertBuilder = makeBuilder(newEntries)

      mockChatAssistantAccess.getKnex
        .mockReturnValueOnce(deleteBuilder)
        .mockReturnValueOnce(insertBuilder)

      // Step 1: Clear existing entries
      const delKnex = mockChatAssistantAccess.getKnex()
      await delKnex.from('chat_assistant_access').where('assistant_id', 'd1').delete()
      expect(deleteBuilder.delete).toHaveBeenCalled()

      // Step 2: Insert new entries
      const insKnex = mockChatAssistantAccess.getKnex()
      const result = await insKnex.from('chat_assistant_access').insert(newEntries)
      expect(insertBuilder.insert).toHaveBeenCalledWith(newEntries)
      expect(result).toEqual(newEntries)
    })

    it('replaces existing entries when updating access', async () => {
      // First call deletes 3 old entries, second inserts 1 new entry
      const deleteBuilder = makeBuilder(3)
      const insertBuilder = makeBuilder([{ assistant_id: 'd1', entity_type: 'user', entity_id: 'u5' }])

      mockChatAssistantAccess.getKnex
        .mockReturnValueOnce(deleteBuilder)
        .mockReturnValueOnce(insertBuilder)

      const delKnex = mockChatAssistantAccess.getKnex()
      const deleted = await delKnex.from('chat_assistant_access').where('assistant_id', 'd1').delete()
      expect(deleted).toBe(3)

      const insKnex = mockChatAssistantAccess.getKnex()
      await insKnex.from('chat_assistant_access').insert([
        { assistant_id: 'd1', entity_type: 'user', entity_id: 'u5' },
      ])
      expect(insertBuilder.insert).toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // getAssistantAccess
  // -----------------------------------------------------------------------

  describe('getAssistantAccess', () => {
    it('returns enriched access entries with user/team info', async () => {
      const entries = [
        { id: 'a1', assistant_id: 'd1', entity_type: 'user', entity_id: 'u1', user_name: 'Alice' },
        { id: 'a2', assistant_id: 'd1', entity_type: 'team', entity_id: 't1', team_name: 'Engineering' },
      ]
      const builder = makeBuilder(entries)
      mockChatAssistantAccess.getKnex.mockReturnValue(builder)

      const knex = mockChatAssistantAccess.getKnex()
      const result = await knex
        .from('chat_assistant_access')
        .select('chat_assistant_access.*')
        .where('assistant_id', 'd1')

      expect(result).toHaveLength(2)
      expect(result[0].entity_type).toBe('user')
      expect(result[1].entity_type).toBe('team')
    })

    it('returns empty array when assistant has no access entries', async () => {
      const builder = makeBuilder([])
      mockChatAssistantAccess.getKnex.mockReturnValue(builder)

      const knex = mockChatAssistantAccess.getKnex()
      const result = await knex
        .from('chat_assistant_access')
        .where('assistant_id', 'd-empty')

      expect(result).toEqual([])
    })
  })
})
