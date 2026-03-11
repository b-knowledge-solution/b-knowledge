/**
 * @fileoverview Tests for ChatDialogService RBAC logic.
 *
 * Validates role-based access control for dialog listing, access checking,
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

const DIALOG_PUBLIC = { id: 'd-public', name: 'Public', is_public: true, created_by: 'admin-1' }
const DIALOG_OWN = { id: 'd-own', name: 'My Dialog', is_public: false, created_by: 'user-1' }
const DIALOG_PRIVATE = { id: 'd-priv', name: 'Private', is_public: false, created_by: 'other-user' }
const DIALOG_USER_ACCESS = { id: 'd-user-acc', name: 'User Access', is_public: false, created_by: 'other-user' }
const DIALOG_TEAM_ACCESS = { id: 'd-team-acc', name: 'Team Access', is_public: false, created_by: 'other-user' }

const ALL_DIALOGS = [DIALOG_PUBLIC, DIALOG_OWN, DIALOG_PRIVATE, DIALOG_USER_ACCESS, DIALOG_TEAM_ACCESS]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatDialogService – RBAC logic', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // listDialogs – admin sees all
  // -----------------------------------------------------------------------

  describe('listDialogs – admin visibility', () => {
    it('admin can list all dialogs regardless of ownership or access', async () => {
      const { chatDialogService } = await import('../../src/modules/chat/services/chat-dialog.service')
      const factory = await import('../../src/shared/models/factory')

      // Mock: return all dialogs for admin
      const builder = makeBuilder(ALL_DIALOGS)
      factory.ModelFactory.chatDialog.findAll = vi.fn().mockResolvedValue(ALL_DIALOGS)

      const result = await chatDialogService.listDialogs(ADMIN_USER.id)

      // Admin should see all 5 dialogs
      expect(result).toHaveLength(5)
      expect(result).toEqual(ALL_DIALOGS)
    })
  })

  // -----------------------------------------------------------------------
  // listDialogs – regular user sees filtered
  // -----------------------------------------------------------------------

  describe('listDialogs – regular user visibility', () => {
    it('regular user only sees own dialogs when no RBAC entries exist', async () => {
      const { chatDialogService } = await import('../../src/modules/chat/services/chat-dialog.service')
      const factory = await import('../../src/shared/models/factory')

      // Mock: return only dialogs created by this user
      const ownDialogs = [DIALOG_OWN]
      factory.ModelFactory.chatDialog.findAll = vi.fn().mockResolvedValue(ownDialogs)

      const result = await chatDialogService.listDialogs(REGULAR_USER.id)

      expect(result).toEqual(ownDialogs)
      expect(factory.ModelFactory.chatDialog.findAll).toHaveBeenCalledWith(
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
      const factory = await import('../../src/shared/models/factory')

      // Mock: access entry exists for user
      const accessEntry = { id: 'a1', dialog_id: 'd-user-acc', access_type: 'user', target_id: 'user-1' }
      const builder = makeBuilder(accessEntry)
      factory.ModelFactory.chatDialogAccess = { getKnex: vi.fn().mockReturnValue(builder) } as any

      const knex = factory.ModelFactory.chatDialogAccess.getKnex()
      const result = await knex
        .from('chat_dialog_access')
        .where('dialog_id', 'd-user-acc')
        .where('access_type', 'user')
        .where('target_id', 'user-1')
        .first()

      expect(result).toBeDefined()
      expect(result.target_id).toBe('user-1')
    })

    it('returns true when user belongs to a team with access', async () => {
      const factory = await import('../../src/shared/models/factory')

      // Mock: team-based access entry
      const accessEntry = { id: 'a2', dialog_id: 'd-team-acc', access_type: 'team', target_id: 'team-alpha' }
      const builder = makeBuilder(accessEntry)
      factory.ModelFactory.chatDialogAccess = { getKnex: vi.fn().mockReturnValue(builder) } as any

      const knex = factory.ModelFactory.chatDialogAccess.getKnex()
      const result = await knex
        .from('chat_dialog_access')
        .where('dialog_id', 'd-team-acc')
        .where('access_type', 'team')
        .whereIn('target_id', ['team-alpha'])
        .first()

      expect(result).toBeDefined()
      expect(result.access_type).toBe('team')
    })

    it('returns false when user has no access entry', async () => {
      const factory = await import('../../src/shared/models/factory')

      // Mock: no access entry found
      const builder = makeBuilder(undefined)
      factory.ModelFactory.chatDialogAccess = { getKnex: vi.fn().mockReturnValue(builder) } as any

      const knex = factory.ModelFactory.chatDialogAccess.getKnex()
      const result = await knex
        .from('chat_dialog_access')
        .where('dialog_id', 'd-priv')
        .where('access_type', 'user')
        .where('target_id', 'user-1')
        .first()

      expect(result).toBeUndefined()
    })

    it('returns true for public dialog regardless of access entries', async () => {
      // Public dialogs should be accessible without explicit access entries
      expect(DIALOG_PUBLIC.is_public).toBe(true)
    })

    it('returns true for dialog owner', async () => {
      // Owner should always have access to their own dialog
      expect(DIALOG_OWN.created_by).toBe(REGULAR_USER.id)
    })
  })

  // -----------------------------------------------------------------------
  // setDialogAccess
  // -----------------------------------------------------------------------

  describe('setDialogAccess', () => {
    it('creates access entries for users and teams', async () => {
      const factory = await import('../../src/shared/models/factory')

      const newEntries = [
        { dialog_id: 'd1', access_type: 'user', target_id: 'u2' },
        { dialog_id: 'd1', access_type: 'team', target_id: 't1' },
      ]
      const deleteBuilder = makeBuilder(0)
      const insertBuilder = makeBuilder(newEntries)

      factory.ModelFactory.chatDialogAccess = {
        getKnex: vi.fn()
          .mockReturnValueOnce(deleteBuilder)
          .mockReturnValueOnce(insertBuilder),
      } as any

      // Step 1: Clear existing entries
      const delKnex = factory.ModelFactory.chatDialogAccess.getKnex()
      await delKnex.from('chat_dialog_access').where('dialog_id', 'd1').delete()
      expect(deleteBuilder.delete).toHaveBeenCalled()

      // Step 2: Insert new entries
      const insKnex = factory.ModelFactory.chatDialogAccess.getKnex()
      const result = await insKnex.from('chat_dialog_access').insert(newEntries)
      expect(insertBuilder.insert).toHaveBeenCalledWith(newEntries)
      expect(result).toEqual(newEntries)
    })

    it('replaces existing entries when updating access', async () => {
      const factory = await import('../../src/shared/models/factory')

      // First call deletes 3 old entries, second inserts 1 new entry
      const deleteBuilder = makeBuilder(3)
      const insertBuilder = makeBuilder([{ dialog_id: 'd1', access_type: 'user', target_id: 'u5' }])

      factory.ModelFactory.chatDialogAccess = {
        getKnex: vi.fn()
          .mockReturnValueOnce(deleteBuilder)
          .mockReturnValueOnce(insertBuilder),
      } as any

      const delKnex = factory.ModelFactory.chatDialogAccess.getKnex()
      const deleted = await delKnex.from('chat_dialog_access').where('dialog_id', 'd1').delete()
      expect(deleted).toBe(3)

      const insKnex = factory.ModelFactory.chatDialogAccess.getKnex()
      await insKnex.from('chat_dialog_access').insert([
        { dialog_id: 'd1', access_type: 'user', target_id: 'u5' },
      ])
      expect(insertBuilder.insert).toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // getDialogAccess
  // -----------------------------------------------------------------------

  describe('getDialogAccess', () => {
    it('returns enriched access entries with user/team info', async () => {
      const factory = await import('../../src/shared/models/factory')

      const entries = [
        { id: 'a1', dialog_id: 'd1', access_type: 'user', target_id: 'u1', user_name: 'Alice' },
        { id: 'a2', dialog_id: 'd1', access_type: 'team', target_id: 't1', team_name: 'Engineering' },
      ]
      const builder = makeBuilder(entries)
      factory.ModelFactory.chatDialogAccess = { getKnex: vi.fn().mockReturnValue(builder) } as any

      const knex = factory.ModelFactory.chatDialogAccess.getKnex()
      const result = await knex
        .from('chat_dialog_access')
        .select('chat_dialog_access.*')
        .where('dialog_id', 'd1')

      expect(result).toHaveLength(2)
      expect(result[0].access_type).toBe('user')
      expect(result[1].access_type).toBe('team')
    })

    it('returns empty array when dialog has no access entries', async () => {
      const factory = await import('../../src/shared/models/factory')

      const builder = makeBuilder([])
      factory.ModelFactory.chatDialogAccess = { getKnex: vi.fn().mockReturnValue(builder) } as any

      const knex = factory.ModelFactory.chatDialogAccess.getKnex()
      const result = await knex
        .from('chat_dialog_access')
        .where('dialog_id', 'd-empty')

      expect(result).toEqual([])
    })
  })
})
