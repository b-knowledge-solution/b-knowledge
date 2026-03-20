/**
 * @fileoverview Tests for ChatDialogService RBAC, pagination, search, name uniqueness, and access.
 *
 * Covers listAccessibleDialogs with pagination/search, createDialog name uniqueness,
 * and checkUserAccess role-based rules.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFindAll = vi.fn()
const mockCreate = vi.fn()
const mockFindById = vi.fn()
const mockGetKnex = vi.fn()
const mockFindAccessibleDialogIds = vi.fn()

vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: {
    chatAssistant: {
      findAll: (...args: any[]) => mockFindAll(...args),
      create: (...args: any[]) => mockCreate(...args),
      findById: (...args: any[]) => mockFindById(...args),
      getKnex: (...args: any[]) => mockGetKnex(...args),
    },
    chatAssistantAccess: {
      findAccessibleAssistantIds: (...args: any[]) => mockFindAccessibleDialogIds(...args),
      findByAssistantId: vi.fn().mockResolvedValue([]),
    },
    user: { getKnex: vi.fn() },
    team: { getKnex: vi.fn() },
  },
}))

vi.mock('@/shared/models/types.js', () => ({}))

vi.mock('@/shared/services/logger.service.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Import after mocking
import { ChatDialogService } from '../../src/modules/chat/services/chat-dialog.service'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a chainable Knex-like builder that resolves to `result` when awaited.
 * Supports clone, count, first for pagination queries.
 */
function makeBuilder(result: unknown, countTotal = 0) {
  const builder: any = {
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
    orWhereIn: vi.fn().mockReturnThis(),
    whereRaw: vi.fn().mockReturnThis(),
    whereILike: vi.fn().mockReturnThis(),
    orWhereILike: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockReturnValue({
      first: vi.fn().mockResolvedValue({ count: String(countTotal) }),
    }),
    clone: vi.fn(),
    then: (onFulfilled: any) => Promise.resolve(result).then(onFulfilled),
  }
  // clone() returns a new builder for count queries
  builder.clone.mockReturnValue(builder)
  return builder
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const DIALOG_1 = { id: 'd1', name: 'Sales Bot', is_public: true, created_by: 'admin-1' }
const DIALOG_2 = { id: 'd2', name: 'Support Bot', is_public: false, created_by: 'user-1' }
const DIALOG_3 = { id: 'd3', name: 'Internal KB', is_public: false, created_by: 'user-2' }
const DIALOG_4 = { id: 'd4', name: 'Dev Helper', is_public: false, created_by: 'user-3' }
const DIALOG_5 = { id: 'd5', name: 'HR Bot', is_public: true, created_by: 'admin-1' }

const ALL_DIALOGS = [DIALOG_1, DIALOG_2, DIALOG_3, DIALOG_4, DIALOG_5]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatDialogService', () => {
  let service: ChatDialogService

  beforeEach(() => {
    service = new ChatDialogService()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // listAccessibleDialogs – admin visibility
  // -----------------------------------------------------------------------

  describe('listAccessibleDialogs – admin visibility', () => {
    it('admin sees all dialogs (no RBAC filtering)', async () => {
      const builder = makeBuilder(ALL_DIALOGS, 5)
      mockGetKnex.mockReturnValue(builder)

      const result = await service.listAccessibleDialogs('admin-1', 'admin', [])

      expect(result.data).toHaveLength(5)
      expect(result.total).toBe(5)
      // Admin should NOT trigger findAccessibleDialogIds
      expect(mockFindAccessibleDialogIds).not.toHaveBeenCalled()
    })

    it('superadmin also bypasses RBAC', async () => {
      const builder = makeBuilder(ALL_DIALOGS, 5)
      mockGetKnex.mockReturnValue(builder)

      const result = await service.listAccessibleDialogs('sa-1', 'superadmin', [])

      expect(result.data).toHaveLength(5)
      expect(mockFindAccessibleDialogIds).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // listAccessibleDialogs – pagination
  // -----------------------------------------------------------------------

  describe('listAccessibleDialogs – pagination', () => {
    it('applies page and pageSize', async () => {
      const builder = makeBuilder([DIALOG_3], 5)
      mockGetKnex.mockReturnValue(builder)

      const result = await service.listAccessibleDialogs('admin-1', 'admin', [], {
        page: 2,
        pageSize: 2,
      })

      expect(result.data).toEqual([DIALOG_3])
      expect(result.total).toBe(5)
      expect(builder.limit).toHaveBeenCalledWith(2)
      expect(builder.offset).toHaveBeenCalledWith(2) // (2-1)*2 = 2
    })

    it('defaults to page 1 and pageSize 20', async () => {
      const builder = makeBuilder(ALL_DIALOGS, 5)
      mockGetKnex.mockReturnValue(builder)

      await service.listAccessibleDialogs('admin-1', 'admin', [])

      expect(builder.limit).toHaveBeenCalledWith(20)
      expect(builder.offset).toHaveBeenCalledWith(0)
    })
  })

  // -----------------------------------------------------------------------
  // listAccessibleDialogs – search
  // -----------------------------------------------------------------------

  describe('listAccessibleDialogs – search', () => {
    it('applies ILIKE filter on name and description', async () => {
      const builder = makeBuilder([DIALOG_1], 1)
      mockGetKnex.mockReturnValue(builder)

      await service.listAccessibleDialogs('admin-1', 'admin', [], { search: 'sales' })

      // The where callback triggers whereILike and orWhereILike
      expect(builder.where).toHaveBeenCalled()
    })

    it('skips search filter when search is empty', async () => {
      const builder = makeBuilder(ALL_DIALOGS, 5)
      mockGetKnex.mockReturnValue(builder)

      await service.listAccessibleDialogs('admin-1', 'admin', [], { search: '' })

      // where should only be called for RBAC (which admin skips), not search
      // The search filter branch is skipped for empty/falsy search
      expect(builder.whereILike).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // listAccessibleDialogs – user visibility
  // -----------------------------------------------------------------------

  describe('listAccessibleDialogs – user visibility', () => {
    it('user sees own, public, and shared dialogs', async () => {
      const accessibleDialogs = [DIALOG_1, DIALOG_2, DIALOG_5]
      const builder = makeBuilder(accessibleDialogs, 3)
      mockGetKnex.mockReturnValue(builder)
      mockFindAccessibleDialogIds.mockResolvedValue(['d4'])

      const result = await service.listAccessibleDialogs('user-1', 'user', ['team-1'])

      expect(result.data).toEqual(accessibleDialogs)
      expect(result.total).toBe(3)
      expect(builder.where).toHaveBeenCalled()
    })

    it('user with no accessible IDs does not call orWhereIn', async () => {
      const builder = makeBuilder([DIALOG_1, DIALOG_2], 2)
      mockGetKnex.mockReturnValue(builder)
      mockFindAccessibleDialogIds.mockResolvedValue([])

      await service.listAccessibleDialogs('user-1', 'user', [])

      expect(builder.orWhereIn).not.toHaveBeenCalled()
    })

    it('calls findAccessibleDialogIds with userId and teamIds', async () => {
      const builder = makeBuilder([], 0)
      mockGetKnex.mockReturnValue(builder)
      mockFindAccessibleDialogIds.mockResolvedValue([])

      await service.listAccessibleDialogs('user-1', 'user', ['team-alpha', 'team-beta'])

      expect(mockFindAccessibleDialogIds).toHaveBeenCalledWith('user-1', ['team-alpha', 'team-beta'])
    })
  })

  // -----------------------------------------------------------------------
  // createDialog – name uniqueness
  // -----------------------------------------------------------------------

  describe('createDialog', () => {
    it('creates a dialog when name is unique', async () => {
      const created = { id: 'd-new', name: 'New Bot' }
      const uniqueBuilder = makeBuilder(undefined)
      uniqueBuilder.first = vi.fn().mockResolvedValue(undefined) // No duplicate
      mockGetKnex.mockReturnValue(uniqueBuilder)
      mockCreate.mockResolvedValue(created)

      const result = await service.createDialog(
        {
          name: 'New Bot',
          description: 'A new bot',
          kb_ids: ['kb-1', 'kb-2'],
          llm_id: 'llm-1',
          prompt_config: { system: 'You are helpful' },
          is_public: true,
        },
        'user-1'
      )

      expect(result).toEqual(created)
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Bot',
          description: 'A new bot',
          kb_ids: ['kb-1', 'kb-2'],
          is_public: true,
          created_by: 'user-1',
        })
      )
    })

    it('rejects duplicate name (case-insensitive)', async () => {
      const existingDialog = { id: 'd-existing', name: 'Sales Bot' }
      const uniqueBuilder = makeBuilder(undefined)
      uniqueBuilder.first = vi.fn().mockResolvedValue(existingDialog)
      mockGetKnex.mockReturnValue(uniqueBuilder)

      await expect(
        service.createDialog({ name: 'Sales Bot', kb_ids: ['kb-1'] }, 'user-1')
      ).rejects.toThrow('dialog')

      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('uses whereRaw for case-insensitive check', async () => {
      const uniqueBuilder = makeBuilder(undefined)
      uniqueBuilder.first = vi.fn().mockResolvedValue(undefined)
      mockGetKnex.mockReturnValue(uniqueBuilder)
      mockCreate.mockResolvedValue({ id: 'd-new' })

      await service.createDialog({ name: 'Test Bot', kb_ids: ['kb-1'] }, 'user-1')

      expect(uniqueBuilder.whereRaw).toHaveBeenCalledWith(
        'LOWER(name) = LOWER(?)',
        ['Test Bot']
      )
    })

    it('defaults optional fields when not provided', async () => {
      const uniqueBuilder = makeBuilder(undefined)
      uniqueBuilder.first = vi.fn().mockResolvedValue(undefined)
      mockGetKnex.mockReturnValue(uniqueBuilder)
      mockCreate.mockResolvedValue({ id: 'd-new' })

      await service.createDialog(
        { name: 'Minimal Bot', kb_ids: ['kb-1'] },
        'user-1'
      )

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Minimal Bot',
          description: null,
          icon: null,
          llm_id: null,
          prompt_config: {},
          is_public: false,
        })
      )
    })
  })

  // -----------------------------------------------------------------------
  // checkUserAccess
  // -----------------------------------------------------------------------

  describe('checkUserAccess', () => {
    it('admin always has access', async () => {
      const result = await service.checkUserAccess('d-any', 'admin-1', 'admin', [])
      expect(result).toBe(true)
      expect(mockFindById).not.toHaveBeenCalled()
    })

    it('superadmin always has access', async () => {
      const result = await service.checkUserAccess('d-any', 'sa-1', 'superadmin', [])
      expect(result).toBe(true)
    })

    it('returns false for non-existent dialog', async () => {
      mockFindById.mockResolvedValue(undefined)

      const result = await service.checkUserAccess('d-nope', 'user-1', 'user', [])
      expect(result).toBe(false)
    })

    it('owner always has access to their own dialog', async () => {
      mockFindById.mockResolvedValue(DIALOG_2) // created_by: 'user-1'

      const result = await service.checkUserAccess('d2', 'user-1', 'user', [])
      expect(result).toBe(true)
    })

    it('public dialog is accessible to anyone', async () => {
      mockFindById.mockResolvedValue(DIALOG_1) // is_public: true

      const result = await service.checkUserAccess('d1', 'random-user', 'user', [])
      expect(result).toBe(true)
    })

    it('returns false for private dialog without access grant', async () => {
      mockFindById.mockResolvedValue(DIALOG_3) // is_public: false, created_by: 'user-2'
      mockFindAccessibleDialogIds.mockResolvedValue([])

      const result = await service.checkUserAccess('d3', 'user-1', 'user', [])
      expect(result).toBe(false)
    })

    it('returns true when user has explicit access grant', async () => {
      mockFindById.mockResolvedValue(DIALOG_3)
      mockFindAccessibleDialogIds.mockResolvedValue(['d3'])

      const result = await service.checkUserAccess('d3', 'user-1', 'user', ['team-1'])
      expect(result).toBe(true)
    })
  })
})
